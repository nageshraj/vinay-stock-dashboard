@echo off
title ChartPulse Stock Screener Launcher

echo ========================================================
echo   ChartPulse Stock Dashboard - Restart Script
echo ========================================================
echo.

echo [1/3] Terminating existing Python and Node processes...
taskkill /F /IM python.exe /T >nul 2>&1
taskkill /F /IM node.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/3] Starting FastAPI Backend on http://localhost:8000...
start "ChartPulse Backend (FastAPI)" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000"

echo Waiting 4 seconds for FastAPI backend to initialize...
timeout /t 4 /nobreak >nul

echo [3/3] Starting React Frontend on http://localhost:3000...
start "ChartPulse Frontend (Vite)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================================
echo   All servers started successfully!
echo   Opening http://localhost:3000 in your browser...
echo ========================================================
timeout /t 2 /nobreak >nul
start http://localhost:3000
