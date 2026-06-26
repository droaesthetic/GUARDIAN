@echo off
setlocal
title Guardian Bot

cd /d "%~dp0"

echo.
echo Starting Guardian Discord Bot...
echo Folder: %cd%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js from https://nodejs.org/ and then run this file again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found.
  echo Reinstall Node.js with npm enabled, then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo Missing .env file.
  echo Copy .env.example to .env and fill in your Discord bot settings first.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo Dependency install failed.
    pause
    exit /b 1
  )
  echo.
)

echo Building bot...
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed. Fix the error above, then run this file again.
  pause
  exit /b 1
)

echo.
echo Bot is starting. Keep this window open while the bot is running.
echo Press Ctrl+C in this window to stop it.
echo.

call npm start

echo.
echo Bot stopped.
pause
