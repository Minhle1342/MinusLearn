@echo off
title MinusLearn
set ROOT=%~dp0

if not exist "%ROOT%backend\.venv\Scripts\python.exe" (
  echo Backend virtual environment is missing.
  echo Run: py -m venv backend\.venv
  echo Then: backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
  pause
  exit /b 1
)

:: Ensure icon & shortcut created for start.bat
if exist "%ROOT%generate_shortcut.ps1" (
  powershell -ExecutionPolicy Bypass -File "%ROOT%generate_shortcut.ps1" >nul 2>&1
)

start "MinusLearn API" cmd /k "cd /d ""%ROOT%backend"" && .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
cd /d "%ROOT%frontend"
npm run dev -- --open
