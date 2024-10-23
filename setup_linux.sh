#!/bin/bash

touch ~/.bashrc

TESTNETSET=false

while read -r line
do
	if [[ "$line" =~ ^"alias testnet="* ]]; then
		TESTNETSET=true
	fi
done < ~/.bashrc

NEWLINESET=false

if [[ "$TESTNETSET" != true ]]; then
	if [[ "$NEWLINESET" != true ]]; then
		echo '' >> ~/.bashrc
		NEWLINESET=true
	fi
	echo "Setting 'testnet' alias";
	echo "alias testnet='dt=\$(pwd); cd $(pwd); node --no-warnings TestNet.js -folderPath \$dt; cd \$dt;'" >> ~/.bashrc
fi

source ~/.bashrc

echo "Setup complete"