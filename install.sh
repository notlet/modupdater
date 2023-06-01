#!/bin/bash

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed on this system."
    echo "Please install Node.js and try again."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm is not installed on this system."
    echo "Please install npm and try again."
    exit 1
fi

# Check if Node.js is running
if ! node -v &> /dev/null; then
    echo "Node.js is installed but not running."
    echo "Please start Node.js and try again."
    exit 1
fi

# Check if the directory name matches the expected directory
expected_directory=".minecraft"
current_directory="$(basename "$(dirname "$(pwd)")")"

if [ "$current_directory" != "$expected_directory" ]; then
    echo "The installer isn't running in .minecraft/modupdater folder!"
    echo "Exiting the script."
    exit 1
fi

# Install required packages
echo "Node.js and npm are installed. Installing required packages..."
npm install


echo "Required packages installed. Execute run.sh to update your mods list from now on. It will automatically be executed in 2 seconds."
chmod +x run.sh
sleep 2

bash run.sh
