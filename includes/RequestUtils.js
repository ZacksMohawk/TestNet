let request = require('request');

function sendPostFormRequest(url, headers, formData, successFunction, failFunction, noResponseFunction){
	request.post(
		url,
		{
			headers: headers,
			form: formData
		},
		function (error, response, body) {
			if (response){
				if (response.statusCode == 200 || response.statusCode == 204){
					// execute the provided success function
					successFunction(body, response.statusCode);
				}
				else {
					// execute fail function
					failFunction(body, response.statusCode);
				}
			}
			else {
				// execute no response function
				noResponseFunction();
			}
		}
	);
}

function sendPostBodyRequest(url, headers, postBody, successFunction, failFunction, noResponseFunction){
	request.post(
		url,
		{
			headers: headers,
			json: postBody
		},
		function (error, response, body) {
			if (response){
				if (response.statusCode == 200 || response.statusCode == 204){
					// execute the provided success function
					successFunction(body, response.statusCode);
				}
				else {
					// execute fail function
					failFunction(body, response.statusCode);
				}
			}
			else {
				// execute no response function
				noResponseFunction();
			}
		}
	);
}

function sendGetRequest(url, headers, successFunction, failFunction, noResponseFunction){
	request.get(
		url,
		{
			headers: headers
		},
		function (error, response, body) {
			if (response){
				if (response.statusCode == 200){
					// execute the provided success function
					successFunction(body, response.statusCode);
				}
				else {
					// execute fail function
					failFunction(body, response.statusCode);
				}
			}
			else {
				// execute no response function
				noResponseFunction();
			}
		}
	);
}

module.exports = {
	sendPostFormRequest: sendPostFormRequest,
	sendPostBodyRequest: sendPostBodyRequest,
	sendGetRequest: sendGetRequest
}