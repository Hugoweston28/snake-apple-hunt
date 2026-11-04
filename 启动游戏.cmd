@echo off
cd /d "%~dp0"
node tools\serve.js --open
if errorlevel 1 (
  echo.
  echo Failed to start. Is Node.js installed?
  echo Try: node -v
)
pause
