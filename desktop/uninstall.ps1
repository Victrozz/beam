# Removes Beam. Normally you'd use Settings → Apps → Beam → Uninstall instead; this also cleans up
# copies installed by the old install.ps1. Pass -KeepFiles to keep received files and your sign-in (config.json).
param([switch]$KeepFiles)
Get-Process Beam -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800
$uninstaller = "$env:LOCALAPPDATA\Programs\Beam\Uninstall Beam.exe"
if (Test-Path $uninstaller) { Start-Process $uninstaller -ArgumentList '/S' -Wait }
Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name Beam -ErrorAction SilentlyContinue
Get-ChildItem ([Environment]::GetFolderPath('SendTo')) -Filter '*(Beam).lnk' | Remove-Item -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath('Programs')) 'Beam.lnk') -ErrorAction SilentlyContinue
$beamHome = "$env:LOCALAPPDATA\Beam"
if ($KeepFiles) { Remove-Item "$beamHome\app", "$beamHome\data" -Recurse -Force -ErrorAction SilentlyContinue }
else { Remove-Item $beamHome -Recurse -Force -ErrorAction SilentlyContinue }
Write-Host 'Beam removed.'
