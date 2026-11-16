# Cria duas tarefas no Agendador de Tarefas do Windows:
#   1. "Bolao da Virada - Servidor": inicia o servidor e reinicia se ele cair.
#   2. "Bolao da Virada - Backup": backup diario as 03:00.
#
# Uso (a partir da pasta do projeto):
#   powershell -ExecutionPolicy Bypass -File scripts\windows\instalar-tarefas.ps1
#       -> servidor inicia quando o usuario atual faz logon (nao exige administrador).
#   powershell -ExecutionPolicy Bypass -File scripts\windows\instalar-tarefas.ps1 -NaInicializacao
#       -> servidor inicia junto com o Windows, mesmo sem ninguem logado
#          (execute em um PowerShell aberto como administrador).
#   ... -NaInicializacao -Conta bolao
#       -> igual ao anterior, mas roda com a conta de servico indicada (ver conta-servico.ps1).

param([switch]$NaInicializacao, [string]$Conta, [string]$Senha)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$user = "$env:USERDOMAIN\$env:USERNAME"
if ($Conta) {
  if (-not $NaInicializacao) { throw 'Use -Conta junto com -NaInicializacao.' }
  $user = "$env:COMPUTERNAME\$Conta"
  if (-not $Senha) { throw 'Use -Conta junto com -Senha (o conta-servico.ps1 cuida disso).' }
}

if ($NaInicializacao) {
  # S4U: roda com o usuario atual (sem privilegios de administrador) sem precisar estar logado.
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited
  $serverTrigger = New-ScheduledTaskTrigger -AtStartup
} else {
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  $serverTrigger = New-ScheduledTaskTrigger -AtLogOn -User $user
}

$serverAction = New-ScheduledTaskAction -Execute "$root\scripts\windows\iniciar-servidor.cmd" -WorkingDirectory $root
$serverSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
# Remove a tarefa anterior antes de recriar (sobrescrever uma tarefa em execucao com outra conta e negado).
function Recriar($name, $action, $trigger, $settings) {
  if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
  }
  if ($Conta) {
    # Outra conta: o Windows nao permite S4U; registra com a senha (guardada protegida pelo Agendador).
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
      -User $user -Password $Senha -RunLevel Limited | Out-Null
  } else {
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
  }
}

Recriar 'Bolao da Virada - Servidor' $serverAction $serverTrigger $serverSettings

$backupAction = New-ScheduledTaskAction -Execute "$root\scripts\windows\backup.cmd" -WorkingDirectory $root
$backupTrigger = New-ScheduledTaskTrigger -Daily -At 3am
$backupSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries
Recriar 'Bolao da Virada - Backup' $backupAction $backupTrigger $backupSettings

Write-Host 'Tarefas criadas:'
if ($NaInicializacao) { Write-Host '  - Bolao da Virada - Servidor (ao ligar o computador)' }
else { Write-Host '  - Bolao da Virada - Servidor (ao fazer logon)' }
Write-Host '  - Bolao da Virada - Backup (diario, 03:00)'
Write-Host 'Para iniciar agora: Start-ScheduledTask -TaskName "Bolao da Virada - Servidor"'
