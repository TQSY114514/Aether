@echo off
title AetherAI Launcher
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   AetherAI v0.1.13
echo   =================
echo.

:: Check Node.js
where node 1>NUL 2>NUL
if %ERRORLEVEL% neq 0 (
    echo [!] Node.js is not installed.
    echo     Download from: https://nodejs.org
    pause & exit /b 1
)
node --version

:: Enter app directory
cd /d "%~dp0app"

:: Install dependencies if missing
if not exist "node_modules" (
    echo.
    echo [1/2] Installing dependencies...
    call npm install --ignore-scripts --no-audit --no-fund
    if %ERRORLEVEL% neq 0 (
        echo [!] npm install failed
        pause & exit /b 1
    )
)

:: Build frontend if not already built
echo.
echo [2/2] Building frontend...
call npx vite build --logLevel error
if %ERRORLEVEL% neq 0 (
  echo [!] Build failed
  pause & exit /b 1
)

echo.
echo   Starting AetherAI...
call npx electron .
