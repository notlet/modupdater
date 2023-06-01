@echo off

REM Check if Node.js is installed
where node > nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not installed on this system.
    echo Please install Node.js and try again.
    exit /b 1
)

REM Check if Node.js is running
node -v > nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is installed but not running.
    echo Please start Node.js and try again.
    exit /b 1
)

node modupdater.js

pause