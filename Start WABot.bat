@echo off
title WhatsApp Bot Starter

:: Pindah ke folder tempat start.bat berada
cd /d "%~dp0"

echo ==============================
echo 🚀 Menjalankan WhatsApp Bot...
echo Lokasi: %cd%
echo ==============================
echo.

:: Jalankan bot
call node wabot.js

IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Bot berhenti karena error (exit code: %ERRORLEVEL%)
)

echo.
pause
