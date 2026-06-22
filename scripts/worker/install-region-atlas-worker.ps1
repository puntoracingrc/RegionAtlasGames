$ErrorActionPreference = "Stop"

$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$VenvPython = Join-Path $Repo ".venv\Scripts\python.exe"
$RunScript = Join-Path $Repo "scripts\worker\run-region-atlas-worker.ps1"
$TaskName = "Region Atlas PC Worker"

Set-Location $Repo

if (!(Test-Path ".venv")) {
  py -3 -m venv .venv
}

& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install paramiko

if (!(Test-Path ".env.worker")) {
  Copy-Item ".env.worker.example" ".env.worker"
  Write-Host "Creado .env.worker desde plantilla. Rellena credenciales antes de iniciar la tarea."
}

& $VenvPython "scripts\pc_sftp_worker.py" --check

$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$RunScript`"" `
  -WorkingDirectory $Repo
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 2)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Worker instalado y arrancado como tarea programada: $TaskName"
