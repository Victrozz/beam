; Extra steps for the Beam-Setup.exe installer (electron-builder NSIS).

; Close any running Beam first, including copies installed by the old install.ps1 in %LOCALAPPDATA%\Beam\app.
; Both share one single-instance lock, so a leftover one would swallow the new one's launch.
!macro customInit
  nsExec::Exec 'taskkill /f /im Beam.exe'
  Sleep 800
!macroend

; Beam adds these itself at runtime; remove them on a real uninstall, not when an update replaces the old version.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Beam"
    Delete "$APPDATA\Microsoft\Windows\SendTo\*(Beam).lnk"
    Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Beam.lnk"
  ${endIf}
!macroend
