@echo off
setlocal
set "DASHBOARD_DIR=%~dp0"

rem Windows Explorer sometimes runs BAT files from ZIP archives in a temporary
rem folder while leaving the remaining project files inside the ZIP.
if not exist "%DASHBOARD_DIR%server.mjs" (
    echo.
    echo =============================================================
    echo  BILLS COMMAND - SETUP REQUIRED
    echo =============================================================
    echo.
    echo  This launcher cannot find server.mjs in the same folder.
    echo.
    echo  Most likely, you opened start-windows.bat from inside the ZIP.
    echo  Windows only extracted the launcher to a temporary location.
    echo.
    echo  FIX:
    echo    1. Close this window.
    echo    2. Right-click Bills-Command-Dashboard.zip.
    echo    3. Choose Extract All and select Desktop or Documents.
    echo    4. Open the EXTRACTED Bills-Command-Dashboard folder.
    echo    5. Double-click start-windows.bat from that folder.
    echo.
    echo  The extracted folder must also contain server.mjs and app.js.
    echo =============================================================
    echo.
    pause
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo Node.js was not found. Install Node.js 22 or newer from:
    echo https://nodejs.org/
    echo Then reopen this launcher.
    echo.
    pause
    exit /b 1
)

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
if errorlevel 1 (
    echo.
    echo Node.js 22 or newer is required for Bills Command.
    echo Your installed version is:
    node --version
    echo Update Node.js at https://nodejs.org/
    echo.
    pause
    exit /b 1
)

cd /d "%DASHBOARD_DIR%"
echo.
echo Starting Buffalo Bills Command Dashboard...
echo Keep this window open while using the dashboard.
echo If the page appears before the server is ready, refresh it.
echo.
start "" "http://localhost:3000"
node "%DASHBOARD_DIR%server.mjs"
echo.
echo Dashboard server stopped.
pause
endlocal
