@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-windows.ps1" -KeepAlive
if errorlevel 1 pause
