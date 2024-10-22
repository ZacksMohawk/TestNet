function getTimestamp(){
	return new Date().toISOString().replace(/T/, ' ').replace(/Z/, '');
}

module.exports = {
	getTimestamp: getTimestamp
}