# Zack's Mohawk Limited
## TestNet

## Overview

An application for running automated testing of API endpoints (currently limited to GET and POST requests), including NFR testing (such as max. response time). Future work may include improved environment variable handling and/or improved integration compatibility for code pipelines.

## How To Install

	npm install

## How To Configure

Tests need to be defined in a test.def.json file in the TestNet folder. Instructions on how to do this properly will follow.

## How To Setup Command Line Alias

To be able to run TestNet from any folder on Mac, run the following setup script.

	./setup_mac.sh

For Linux machines, run the following setup script. Windows script may be coming soon.

	./setup_linux.sh

## How To Run

In your terminal, from any location, type:

	testnet
