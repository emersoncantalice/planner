@echo off
setlocal
title Planner - Release (Front 8080 / Back 3000)

set ROOT_DIR=%~dp0
for %%I in ("%ROOT_DIR%") do set ROOT_DIR=%%~fI
set FRONT_RELEASE=%ROOT_DIR%release
set BACK_RELEASE=%ROOT_DIR%..\planner-backend\release
set FRONT_PORT=8080
set BACK_PORT=3000
set DEFAULT_SHORTCUT_DIR=%USERPROFILE%\Desktop

if not exist "%BACK_RELEASE%\start-backend.bat" (
  echo ERRO: start-backend.bat nao encontrado em:
  echo %BACK_RELEASE%
  pause
  exit /b 1
)

echo.
echo ================================================
echo  Iniciando releases
echo  Frontend: http://localhost:%FRONT_PORT%
echo  Backend : http://localhost:%BACK_PORT%
echo ================================================
echo.

if exist "%FRONT_RELEASE%\start-frontend.bat" (
  start "Planner Frontend :%FRONT_PORT%" cmd /k "cd /d ""%FRONT_RELEASE%"" && call start-frontend.bat %FRONT_PORT%"
) else (
  if not exist "%FRONT_RELEASE%\browser\index.html" (
    echo ERRO: frontend nao encontrado em:
    echo %FRONT_RELEASE%\browser
    pause
    exit /b 1
  )
  start "Planner Frontend :%FRONT_PORT%" cmd /k "cd /d ""%FRONT_RELEASE%"" && npx http-server browser -p %FRONT_PORT% -c-1"
)

start "Planner Backend :%BACK_PORT%" cmd /k "cd /d ""%BACK_RELEASE%"" && set PLANNER_SERVER_PORT=%BACK_PORT% && call start-backend.bat"

set "LOCAL_IP="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$ip=(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254*' } ^| Select-Object -First 1 -ExpandProperty IPAddress); if (-not $ip) { $ip='localhost' }; Write-Output $ip"`) do set "LOCAL_IP=%%I"
if "%LOCAL_IP%"=="" set "LOCAL_IP=localhost"
set "FRONT_URL=http://%LOCAL_IP%:%FRONT_PORT%"
set "MANIFEST_FILE=%FRONT_RELEASE%\browser\manifest.webmanifest"

if exist "%MANIFEST_FILE%" (
  powershell -NoProfile -Command ^
    "$m = Get-Content -Raw '%MANIFEST_FILE%' | ConvertFrom-Json; " ^
    "$u = '%FRONT_URL%/'; " ^
    "$m.start_url = $u; $m.scope = $u; " ^
    "$m | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 '%MANIFEST_FILE%'"
  echo Manifest PWA atualizado para: %FRONT_URL%/
)

echo Informe a pasta para criar o atalho da aplicacao (ENTER para Desktop):
echo %DEFAULT_SHORTCUT_DIR%
set /p SHORTCUT_DIR=Pasta do atalho: 
if "%SHORTCUT_DIR%"=="" set "SHORTCUT_DIR=%DEFAULT_SHORTCUT_DIR%"
if not exist "%SHORTCUT_DIR%" mkdir "%SHORTCUT_DIR%"

set "SHORTCUT_FILE=%SHORTCUT_DIR%\Planner.url"
(
  echo [InternetShortcut]
  echo URL=%FRONT_URL%
  if exist "%FRONT_RELEASE%\browser\favicon.ico" echo IconFile=%FRONT_RELEASE%\browser\favicon.ico
  echo IconIndex=0
) > "%SHORTCUT_FILE%"
echo Atalho criado em: %SHORTCUT_FILE%
echo URL: %FRONT_URL%

timeout /t 2 >nul
start "" %FRONT_URL%
exit /b 0
