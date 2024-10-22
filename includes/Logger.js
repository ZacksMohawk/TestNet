const fs = require('fs');
const Utils = require('./Utils');

let logFilePath;

function log(message){
	if (!message){
		message = "";
	}
	console.log(message);
	
	if (!logFilePath && appType){
		logFilePath = appType + '.log';
	}
	
	if (logFilePath){
		fs.appendFile(logFilePath, new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '') + "  " + message + '\n', function (err) {
			if (err) throw err;
		});
	}
}

module.exports = {
	log: log
}