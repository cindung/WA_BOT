@echo off
title WhatsApp Bot

:: Pindah ke folder tempat start.bat berada
cd /d "%~dp0"

:: Jalankan bot
call node wabot.js

IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo Bot berhenti (exit code: %ERRORLEVEL%)
)

pause
