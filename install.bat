@echo off

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is not installed on this system.
    echo Please install Node.js and try again.
    exit /b 1
)

REM Check if npm is installed
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo npm is not installed on this system.
    echo Please install npm and try again.
    exit /b 1
)

REM Check if Node.js is running
node -v >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js is installed but not running.
    echo Please start Node.js and try again.
    exit /b 1
)

echo Was the zip file extracted into a folder inside the .minecraft folder?
echo Press Enter if yes, or Ctrl+C to cancel.
pause

REM Install required packages
echo Node.js and npm are installed. Installing required packages...
npm install

echo Required packages installed. Execute run.sh to update your mods list from now on. It will automatically be executed in 2 seconds.
timeout /t 2 >nul
call run.bat