@echo off
echo ============================================
echo  CANsub App - Development Server
echo ============================================
echo.
echo  Enter your device URL or localhost address
echo  in the browser when it opens.
echo.
echo  Press Ctrl+C to stop.
echo.

cd /d "%~dp0"
npm run dev
