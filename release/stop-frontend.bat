@echo off
taskkill /FI "WINDOWTITLE eq Planner Frontend" /T /F >nul 2>nul
echo Frontend finalizado.
exit /b 0
