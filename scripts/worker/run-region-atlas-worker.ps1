$ErrorActionPreference = "Stop"

$Repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Python = Join-Path $Repo ".venv\Scripts\python.exe"
if (!(Test-Path $Python)) {
  $Python = "py"
}

Set-Location $Repo
& $Python "scripts\pc_sftp_worker.py" --daemon --daily --interval 120
