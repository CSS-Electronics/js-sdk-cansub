@echo off
echo ============================================
echo  Building one single-file app per example...
echo ============================================
echo.

cd /d "%~dp0"
npm run build

echo.
echo  Output: dist\^<example^>.html (one file per example)
echo  Upload a file to your CANsub device, put it on a
echo  web server or open it directly in a browser.
