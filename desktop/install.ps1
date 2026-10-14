# Builds Beam-Setup.exe from this folder and runs it. (Friends don't need this: they get Beam-Setup.exe from GitHub Releases.)
#   powershell -ExecutionPolicy Bypass -File desktop\install.ps1
# Run it in a normal PowerShell window, not from inside another app's sandbox, so Beam lands in your real %LOCALAPPDATA%.
# -Server / -Token pre-fill %LOCALAPPDATA%\Beam\config.json so setup is skipped (e.g. the server owner's own laptop).
param([string]$Server, [string]$Token)
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot

if ($Server -or $Token) {
  $beamHome = "$env:LOCALAPPDATA\Beam"
  $cfgPath = "$beamHome\config.json"
  New-Item -ItemType Directory -Force $beamHome | Out-Null
  $cfg = [ordered]@{}
  if (Test-Path $cfgPath) {
    (Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json).psobject.Properties | ForEach-Object { $cfg[$_.Name] = $_.Value }
  }
  if ($Server) { $cfg.server = $Server.TrimEnd('/') }
  if ($Token) { $cfg.token = $Token }
  [IO.File]::WriteAllText($cfgPath, ($cfg | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
}

Push-Location $src
try {
  npm install --no-audit --no-fund
  npx electron-builder --win nsis --publish never
} finally { Pop-Location }

Start-Process "$src\dist\Beam-Setup.exe"
Write-Host 'Installing Beam. It opens by itself when done.'
