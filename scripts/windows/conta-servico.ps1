# Faz o servidor do bolao rodar com uma conta propria do Windows, sem privilegios.
# Se alguem explorar uma falha no site, fica preso a pasta do bolao: nao enxerga
# seus documentos, o perfil do seu usuario nem as pastas bloqueadas abaixo.
#
# Uso: em um PowerShell aberto COMO ADMINISTRADOR, dentro da pasta em uso (ex.: C:\BolaoDaVirada):
#   powershell -ExecutionPolicy Bypass -File scripts\windows\conta-servico.ps1
#
# O que faz:
#   1. Cria a conta local "bolao" (senha aleatoria que ninguem conhece; nao aparece na tela de login,
#      nao pode entrar no Windows nem pela rede; so roda as tarefas do bolao).
#   2. Permissoes: a pasta do bolao fica somente leitura para a conta, exceto data, backups e logs.
#   3. Bloqueia a conta nas pastas pessoais extras (unidade D: e pastas de usuario em C:\).
#   4. Recria as tarefas do servidor e do backup com essa conta e reinicia o servidor.
#
# Para voltar a rodar com o seu usuario:
#   powershell -ExecutionPolicy Bypass -File scripts\windows\instalar-tarefas.ps1 -NaInicializacao

param(
  [string]$Conta = 'bolao',
  [string[]]$Bloquear = @('D:\', 'C:\.cache', 'C:\G-Menu', 'C:\My Games', 'C:\OneDriveTemp')
)

$ErrorActionPreference = 'Stop'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Abra o PowerShell como administrador e rode de novo.' }

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$me = "$env:USERDOMAIN\$env:USERNAME"
Write-Host "Pasta do bolao: $root"

# ---------- 1. Conta ----------
if (-not (Get-LocalUser -Name $Conta -ErrorAction SilentlyContinue)) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $senha = ConvertTo-SecureString ([Convert]::ToBase64String($bytes) + 'aA1!') -AsPlainText -Force
  New-LocalUser -Name $Conta -Password $senha -PasswordNeverExpires -UserMayNotChangePassword `
    -FullName 'Bolao (servico)' -Description 'Servidor do bolao (sem privilegios)' | Out-Null
  Write-Host "Conta '$Conta' criada."
} else {
  Write-Host "Conta '$Conta' ja existe."
}
$sid = (Get-LocalUser -Name $Conta).SID.Value
$usersGroup = (New-Object Security.Principal.SecurityIdentifier 'S-1-5-32-545').Translate([Security.Principal.NTAccount]).Value.Split('\')[-1]
Add-LocalGroupMember -Group $usersGroup -Member $Conta -ErrorAction SilentlyContinue

# Esconde da tela de login.
$ul = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\SpecialAccounts\UserList'
New-Item -Path $ul -Force | Out-Null
New-ItemProperty -Path $ul -Name $Conta -Value 0 -PropertyType DWord -Force | Out-Null

# Direitos: pode rodar tarefas agendadas; nao pode entrar no Windows nem pela rede/area de trabalho remota.
$cfg = Join-Path $env:TEMP 'bolao-direitos.inf'
$sdb = Join-Path $env:TEMP 'bolao-direitos.sdb'
secedit /export /cfg $cfg /areas USER_RIGHTS | Out-Null
$lines = [Collections.Generic.List[string]](Get-Content $cfg)
foreach ($right in 'SeBatchLogonRight', 'SeDenyInteractiveLogonRight', 'SeDenyNetworkLogonRight', 'SeDenyRemoteInteractiveLogonRight') {
  $i = $lines.FindIndex([Predicate[string]] { param($l) $l -match "^$right\s*=" })
  if ($i -ge 0) {
    if ($lines[$i] -notmatch [regex]::Escape("*$sid")) { $lines[$i] = $lines[$i] + ",*$sid" }
  } else {
    $p = $lines.FindIndex([Predicate[string]] { param($l) $l -eq '[Privilege Rights]' })
    $lines.Insert($p + 1, "$right = *$sid")
  }
}
Set-Content -Path $cfg -Value $lines -Encoding Unicode
secedit /configure /db $sdb /cfg $cfg /areas USER_RIGHTS | Out-Null
Remove-Item $cfg, $sdb -ErrorAction SilentlyContinue
Write-Host 'Direitos da conta ajustados.'

# ---------- 2. Permissoes da pasta do bolao ----------
# Remove a heranca (que dava escrita a qualquer usuario) e define: admin/sistema/voce = total; conta = leitura.
icacls $root /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" "${me}:(OI)(CI)F" "*${sid}:(OI)(CI)RX" /Q | Out-Null
foreach ($dir in 'data', 'backups', 'logs') {
  $path = Join-Path $root $dir
  New-Item -ItemType Directory -Force -Path $path | Out-Null
  icacls $path /grant "*${sid}:(OI)(CI)M" /T /Q | Out-Null
}
Write-Host 'Permissoes da pasta ajustadas (escrita so em data, backups e logs).'

# ---------- 3. Bloqueios ----------
foreach ($path in $Bloquear) {
  if ((Test-Path $path) -and -not $root.StartsWith($path.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) {
    $jaBloqueado = (Get-Acl $path).Access | Where-Object {
      $_.AccessControlType -eq 'Deny' -and $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $sid }
    if ($jaBloqueado) { Write-Host "Ja bloqueado: $path"; continue }
    Write-Host "Bloqueando acesso da conta em $path (pode demorar alguns minutos em unidades grandes)..."
    icacls $path /deny "*${sid}:(OI)(CI)F" /C /Q 2>$null | Out-Null
  }
}

# ---------- 4. Tarefas ----------
try {
  # Nova senha aleatoria para a conta, entregue so ao Agendador de Tarefas (ninguem precisa saber).
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $senhaTexto = [Convert]::ToBase64String($bytes) + 'aA1!'
  Set-LocalUser -Name $Conta -Password (ConvertTo-SecureString $senhaTexto -AsPlainText -Force)
  & (Join-Path $PSScriptRoot 'instalar-tarefas.ps1') -NaInicializacao -Conta $Conta -Senha $senhaTexto
  $senhaTexto = $null
} catch {
  $erro = $_.Exception.Message
  Write-Host "Nao foi possivel criar as tarefas com a conta '$Conta': $erro" -ForegroundColor Yellow
  Write-Host 'Recriando as tarefas com o seu usuario, para o site continuar subindo com o Windows...'
  & (Join-Path $PSScriptRoot 'instalar-tarefas.ps1') -NaInicializacao
  Start-ScheduledTask -TaskName 'Bolao da Virada - Servidor'
  throw "Tarefas mantidas com o seu usuario. Erro original: $erro"
}

Write-Host 'Reiniciando o servidor...'
Stop-ScheduledTask -TaskName 'Bolao da Virada - Servidor' -ErrorAction SilentlyContinue
$port = 3000
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) {
  $m = Select-String -Path $envFile -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
  if ($m) { $port = [int]$m.Matches[0].Groups[1].Value }
}
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName 'Bolao da Virada - Servidor'

$ok = $false
for ($i = 0; $i -lt 30 -and -not $ok; $i++) {
  Start-Sleep -Seconds 1
  $ok = [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}
if ($ok) {
  $procId = (Get-NetTCPConnection -LocalPort $port -State Listen | Select-Object -First 1).OwningProcess
  $owner = (Get-CimInstance Win32_Process -Filter "ProcessId=$procId" | Invoke-CimMethod -MethodName GetOwner).User
  Write-Host ''
  Write-Host "PRONTO: servidor no ar na porta $port, rodando com a conta '$owner'." -ForegroundColor Green
} else {
  Write-Host ''
  Write-Host "ATENCAO: o servidor nao subiu. Veja $root\logs\servidor.log" -ForegroundColor Yellow
}
