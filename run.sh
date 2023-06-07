#!/bin/bash

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed on this system."
    echo "Please install Node.js and try again."
    exit 1
fi

# Check if Node.js is running
if ! node -v &> /dev/null; then
    echo "Node.js is installed but not running."
    echo "Please start Node.js and try again."
    exit 1
fi

node modupdater.js

echo ""
echo "Program finished, press ENTER to exit..."
read -p ""