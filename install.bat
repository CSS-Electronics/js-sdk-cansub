@echo off
echo ============================================
echo  Installing dependencies...
echo ============================================
echo.
echo  This installs the SDK packages from npm and
echo  builds the package sources in packages\.
echo.

cd /d "%~dp0"
npm install

echo.
echo  Done. Run run_dev.bat to start the dev server,
echo  or run_build.bat to build one file per example in dist\.
