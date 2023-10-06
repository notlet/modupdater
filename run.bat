@echo off

where node >nul 2>nul
if errorlevel 1 (
    echo No NodeJS found in the system's PATH! Please download it from https://nodejs.org/en/download and run this script again.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo No NPM found in the system's PATH! Please download it from https://nodejs.org/en/download and run this script again.
    pause
    exit /b 1
)

for /f %%i in ('node --version 2^>^&1') do set node_version=%%i

echo Running NodeJS %node_version% on %OS% %PROCESSOR_ARCHITECTURE%

if not exist node_modules\ (
    echo Looks like it's your first time running this! We are going to install the required modules now.
    echo Please restart the script after the modules are installed.
    npm install
)

:loop
node modupdater.js

choice /c RQ /n /m "Program finished, press Q to quit or R to rerun. "
if errorlevel 2 (
    echo bye!
) else (
    goto loop
)