#!/bin/bash

touch ~/.zshrc

TESTNETSET=false

while read -r line
do
	if [[ "$line" =~ ^"alias testnet="* ]]; then
		TESTNETSET=true
	fi
done < ~/.zshrc

NEWLINESET=false

if [[ "$TESTNETSET" != true ]]; then
	if [[ "$NEWLINESET" != true ]]; then
		echo '' >> ~/.zshrc
		NEWLINESET=true
	fi
	echo "Setting 'testnet' alias";
	echo "alias testnet='dt=\$(pwd); cd $(pwd); node TestNet.js -folderPath \$dt; cd \$dt;'" >> ~/.zshrc
fi

source ~/.zshrc

echo "Setup complete"