@echo off
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not installed. Download from https://nodejs.org and re-run.
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing dependencies...
    npm install
)

echo.
echo  CodeCure Dashboard starting...
echo  Open http://localhost:3000 in your browser
echo.
node server.js
pause
