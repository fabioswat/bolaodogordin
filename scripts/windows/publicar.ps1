# Publica a versao da pasta de desenvolvimento na pasta em uso (producao).
#
# Uso: em um PowerShell aberto COMO ADMINISTRADOR, dentro da pasta de DESENVOLVIMENTO:
#   powershell -ExecutionPolicy Bypass -File scripts\windows\publicar.ps1
#
# Opcoes:
#   -Destino C:\OutraPasta   pasta em uso (padrao: C:\BolaoDaVirada)
#   -PularTestes             nao roda os testes antes (nao recomendado)
#   -Simular                 so mostra o que mudou, sem alterar nada
#
# Passos:
#   1. Roda os testes automaticos. Se algum falhar, para sem mexer na producao.
#   2. Mostra os arquivos alterados e decide o que e preciso:
#        - so interface (src\web)            -> copia + build, sem reiniciar
#        - servidor/regras/banco             -> copia + build + reinicia o servidor
#        - bibliotecas (package-lock.json)   -> para o servidor + copia + npm ci + build + reinicia
#   3. Faz backup do banco antes de copiar.
#   4. Nunca copia data, backups, logs nem .env (o banco e a configuracao reais ficam intactos).
#   5. No final, confere se o servidor responde.

param(
  [string]$Destino = 'C:\BolaoDaVirada',
  [switch]$PularTestes,
  [switch]$Simular
)

$ErrorActionPreference = 'Stop'
$origem = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$tarefa = 'Bolao da Virada - Servidor'

function Passo($texto) { Write-Host ''; Write-Host "==> $texto" -ForegroundColor Cyan }
function Falha($texto) { Write-Host ''; Write-Host "ERRO: $texto" -ForegroundColor Red; exit 1 }
function Npm($pasta, [string[]]$argumentos) {
  Push-Location $pasta
  try {
    & npm.cmd @argumentos
    if ($LASTEXITCODE -ne 0) { Falha "'npm $($argumentos -join ' ')' falhou em $pasta." }
  } finally { Pop-Location }
}

# ---------- Verificacoes ----------
if (-not $Simular) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { Falha 'Abra o PowerShell como administrador e rode de novo.' }
}
if (-not (Test-Path (Join-Path $origem 'package.json'))) { Falha "Pasta de desenvolvimento invalida: $origem" }
if (-not (Test-Path (Join-Path $Destino 'package.json'))) { Falha "Pasta em uso nao encontrada: $Destino" }
if ($origem.TrimEnd('\') -ieq $Destino.TrimEnd('\')) { Falha 'Rode este script a partir da pasta de DESENVOLVIMENTO, nao da pasta em uso.' }
Write-Host "Origem (desenvolvimento): $origem"
Write-Host "Destino (em uso):         $Destino"

$excluirPastas = @('node_modules', 'data', 'data-dev', 'backups', 'backups-dev', 'logs', 'dist', '.git', '.claude')
$excluirArquivos = @('.env', '*.db', '*.db-wal', '*.db-shm', '*.log')

# ---------- 1. O que mudou ----------
Passo 'Verificando o que mudou'
$lista = robocopy $origem $Destino /L /E /XX /XD @excluirPastas /XF @excluirArquivos /NJH /NJS /NDL /NC /NS /NP /FP
$alterados = @($lista | ForEach-Object { $_.Trim() } | Where-Object { $_ } |
  ForEach-Object { $_.Substring($origem.Length).TrimStart('\') })
if ($alterados.Count -eq 0) {
  Write-Host 'Nada mudou desde a ultima publicacao. Nada a fazer.' -ForegroundColor Green
  exit 0
}
$alterados | ForEach-Object { Write-Host "  $_" }

# Bibliotecas: compara so as dependencias (mudar apenas a "version" do projeto nao exige npm ci).
function Dependencias($pasta) {
  # Usa o Node (o PowerShell 5.1 nao le a chave vazia "" do package-lock.json).
  $js = "const fs=require('fs'),p=require('path'),d=process.argv[1];" +
    "const k=JSON.parse(fs.readFileSync(p.join(d,'package.json'),'utf8'));" +
    "let s=JSON.stringify([k.dependencies,k.devDependencies]);" +
    "const f=p.join(d,'package-lock.json');" +
    "if(fs.existsSync(f)){const l=JSON.parse(fs.readFileSync(f,'utf8'));" +
    "s+=Object.entries(l.packages||{}).filter(([n])=>n).map(([n,v])=>n+'@'+v.version).sort().join(';')}" +
    "console.log(require('crypto').createHash('sha256').update(s).digest('hex'))"
  $hash = & node -e $js $pasta
  if ($LASTEXITCODE -ne 0) { Falha "Nao foi possivel ler as dependencias em $pasta." }
  return $hash
}
$mudouBibliotecas = (Dependencias $origem) -ne (Dependencias $Destino)
$mudouServidor = $mudouBibliotecas -or [bool]($alterados | Where-Object { $_ -match '^src\\(server|shared)\\' })

Write-Host ''
if ($mudouBibliotecas) { Write-Host 'Bibliotecas mudaram: o servidor sera parado, e o npm ci sera rodado.' -ForegroundColor Yellow }
elseif ($mudouServidor) { Write-Host 'Codigo do servidor mudou: o servidor sera reiniciado (uns 5 segundos fora do ar).' -ForegroundColor Yellow }
else { Write-Host 'Servidor nao mudou (so interface, documentos ou scripts): sem reiniciar.' -ForegroundColor Green }

if ($Simular) { Write-Host ''; Write-Host 'Simulacao: nada foi alterado.'; exit 0 }

# ---------- 2. Testes ----------
if (-not $PularTestes) {
  Passo 'Rodando os testes (na pasta de desenvolvimento)'
  Npm $origem @('test')
  Write-Host 'Testes OK.' -ForegroundColor Green
}

# ---------- 3. Backup ----------
Passo 'Backup do banco em uso'
Npm $Destino @('run', 'backup')

# ---------- 4. Parar servidor (se for trocar bibliotecas) ----------
$porta = 3000
$envFile = Join-Path $Destino '.env'
if (Test-Path $envFile) {
  $m = Select-String -Path $envFile -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
  if ($m) { $porta = [int]$m.Matches[0].Groups[1].Value }
}
function PararServidor {
  Stop-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue
  Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}
if ($mudouBibliotecas) { Passo 'Parando o servidor'; PararServidor }

# ---------- 5. Copiar ----------
Passo 'Copiando arquivos'
robocopy $origem $Destino /E /XD @excluirPastas /XF @excluirArquivos /NJH /NJS /NDL /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Falha "robocopy falhou (codigo $LASTEXITCODE)." }
Write-Host "$($alterados.Count) arquivo(s) copiado(s)."

# ---------- 6. Bibliotecas e build ----------
if ($mudouBibliotecas) { Passo 'Instalando bibliotecas (npm ci)'; Npm $Destino @('ci', '--no-audit', '--no-fund') }
Passo 'Gerando a interface (build)'
Npm $Destino @('run', 'build')

# ---------- 7. Reiniciar ----------
if ($mudouServidor) {
  Passo 'Reiniciando o servidor'
  if (-not $mudouBibliotecas) { PararServidor }
  Start-ScheduledTask -TaskName $tarefa
}

# ---------- 8. Conferir ----------
Passo 'Conferindo se o servidor responde'
$ok = $false
for ($i = 0; $i -lt 30 -and -not $ok; $i++) {
  Start-Sleep -Seconds 1
  try { $ok = (Invoke-WebRequest "http://127.0.0.1:$porta/api/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { }
}
Write-Host ''
if ($ok) {
  Write-Host 'PRONTO: nova versao publicada e servidor respondendo.' -ForegroundColor Green
  if (-not $mudouServidor) { Write-Host 'Quem estiver com o site aberto ve a mudanca ao atualizar a pagina.' }
} else {
  Write-Host "ATENCAO: o servidor nao respondeu. Veja $Destino\logs\servidor.log" -ForegroundColor Yellow
  Write-Host "Para voltar o banco, siga 'Backup e restauracao' em docs\DEPLOYMENT.md."
  exit 1
}
