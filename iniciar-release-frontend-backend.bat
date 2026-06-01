@echo off
setlocal
title Planner - Release (Front 8080 / Back 3000)

set ROOT_DIR=%~dp0
for %%I in ("%ROOT_DIR%") do set ROOT_DIR=%%~fI
set FRONT_RELEASE=%ROOT_DIR%release
set BACK_RELEASE=%ROOT_DIR%..\planner-backend\release

if not exist "%FRONT_RELEASE%\start-frontend.bat" (
  echo ERRO: start-frontend.bat nao encontrado em:
  echo %FRONT_RELEASE%
  pause
  exit /b 1
)

if not exist "%BACK_RELEASE%\start-backend.bat" (
  echo ERRO: start-backend.bat nao encontrado em:
  echo %BACK_RELEASE%
  pause
  exit /b 1
)

echo.
echo ================================================
echo  Iniciando releases
echo  Frontend: http://localhost:8080
echo  Backend : http://localhost:3000
echo ================================================
echo.

start "Planner Frontend :8080" cmd /k "cd /d ""%FRONT_RELEASE%"" && call start-frontend.bat 8080"
start "Planner Backend :3000" cmd /k "cd /d ""%BACK_RELEASE%"" && set PLANNER_SERVER_PORT=3000 && call start-backend.bat"

timeout /t 2 >nul
start "" http://localhost:8080
exit /b 0
