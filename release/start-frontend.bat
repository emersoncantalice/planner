@echo off
setlocal
set APP_DIR=%~dp0
for %%I in ("%APP_DIR%") do set APP_DIR=%%~fI

if not exist "%APP_DIR%index.html" (
  echo ERRO: frontend nao encontrado em %APP_DIR%
  pause
  exit /b 1
)

start "Planner Frontend" cmd /k "cd /d %APP_DIR% && npx http-server . -p 4200 -c-1"
timeout /t 2 >nul
start http://localhost:4200
exit /b 0
