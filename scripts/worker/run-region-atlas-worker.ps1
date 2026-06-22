$ErrorActionPreference = "Stop"

$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Python = Join-Path $Repo ".venv\Scripts\python.exe"
if (!(Test-Path $Python)) {
  $Python = "py"
}

Set-Location $Repo
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONLEGACYWINDOWSSTDIO = "0"
$env:PYTHONUNBUFFERED = "1"
& $Python "scripts\pc_sftp_worker.py" --daemon --daily --interval 120
