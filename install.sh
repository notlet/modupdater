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

chmod +x run.sh
echo "Launch run.sh after the installation completes."

# Install required packages
echo "Node.js and npm are installed. Installing required packages..."
npm install
