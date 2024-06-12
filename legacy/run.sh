#!/bin/bash

# Set your node binary here
node=
npm=

if [ -z "$node" ]; then
    if [ -z "$(which node)" ]; then 
        echo No NodeJS found! Please download it from https://nodejs.org/en/download and run this script again.
        exit 1
    else 
        node="$(which node)"
    fi
fi

if [ -z "$npm" ]; then
    if [ -z "$(which npm)" ]; then 
        echo No NPM found! Please download it from https://nodejs.org/en/download and run this script again.
        exit 1
    else 
        npm="$(which npm)"
    fi
fi

if [ -z "$($node --version)" ]; then 
    echo "String provided in node variable is not a NodeJS binary."
    exit 1 
fi

echo "Running NodeJS $($node --version) on $(uname -s) $(uname -m)"

if [ ! -d "node_modules" ]; then
    echo "Looks like it's your first time running this! We are going to install the required modules now."
    $npm install
    echo "installation completed, proceeding."
fi

in="r"
while [ "$in" == "r" ]; do
  $node modupdater.js

  echo -e "\nProgram finished, press any key to exit or R to rerun."
  read -rsn1 in
done