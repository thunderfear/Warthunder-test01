@echo off
title WT Hit Analysis Launcher
echo ============================================================
echo   War Thunder Hit Analysis - Local Launcher (Windows)
echo ============================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js not found.
  echo Download and install LTS from https://nodejs.org, then re-run this script.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo [OK] Node.js %%v detected
echo.

set "BDIR=%~dp0backend"
set "FDIR=%~dp0frontend"

echo Starting backend API (port 3000)...
start "Backend API" cmd /k "cd /d "%BDIR%" && npm install && npx prisma generate && npx prisma db push --skip-generate && npm run dev"

echo Starting frontend (port 5173)...
start "Frontend" cmd /k "cd /d "%FDIR%" && npm install && npm run dev"

echo.
echo ============================================================
echo  Two black windows opened. Wait until the frontend window
echo  shows "Local: http://localhost:5173", then open in browser:
echo      http://localhost:5173
echo ============================================================
echo.
echo  To stop: just close the two black windows.
echo.
pause
