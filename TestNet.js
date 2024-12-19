global.appType = "TestNet";
global.version = "1.0.8";

const fs = require('fs');
const prompt = require("prompt-sync")();
const RequestUtils = require('./includes/RequestUtils');
const Logger = require('./includes/Logger');

Logger.log();
Logger.log(fs.readFileSync('AppLogo.txt', 'utf8').replace('[version]', 'TestNet v' + version));
Logger.log();

const GET = "GET";
const POST = "POST";
const TYPE_TEXT = "text";
const TYPE_JSON = "json";

let storedInputValuesFilePath = 'env.json';
let testDefFilePath = 'test.def.json';
let inputValues = {};
let storedInputValues = {};
let responseValues = {};

let chosenTestSet;
let passedTests = [];
let failedTests = [];
let failedTestsFilePath = 'failed.json';

let localTestDefFilePath;
let folderPath;
if (process.argv.indexOf("-folderPath") != -1){
	folderPath = process.argv[process.argv.indexOf("-folderPath") + 1];
	localTestDefFilePath = folderPath + "/" + testDefFilePath;
}

function chooseTests(){
	if (fs.existsSync(localTestDefFilePath)){
		Logger.log("Using local test.def.json config");
		testDefFilePath = localTestDefFilePath;
	}
	else if (!fs.existsSync(testDefFilePath)){
		Logger.log("** No test.def.json file present - please create one **");
		Logger.log("Defaulting to root example.test.def.json for demonstration purposes");
		testDefFilePath = 'example.test.def.json';
	}
	else {
		Logger.log("Using root test.def.json config");
	}
	let testDefinitionData;
	try {
		testDefinitionData = JSON.parse(fs.readFileSync(testDefFilePath, 'utf8'));
	}
	catch (error){
		Logger.log("Invalid test.def.json file");
		process.exit(0);
	}

	Logger.log("\nPlease choose test set to run\n");

	let testNameArray = Object.keys(testDefinitionData);
	for (let index = 0; index < testNameArray.length; index++){
		Logger.log("\t" + (index + 1) + ". " + testNameArray[index]);	
	}

	Logger.log();
	let testChoiceIndex = prompt(testNameArray.length > 1 ? 'Choose (1-' + testNameArray.length + '): ' : 'Choose: ');
	if (testChoiceIndex == null || testChoiceIndex == ''){
		process.exit(0);
	}
	testChoiceIndex = parseInt(testChoiceIndex.trim());
	if (Number.isNaN(testChoiceIndex) || testChoiceIndex < 1 || testChoiceIndex > testNameArray.length){
		Logger.log("Invalid choice.");
		process.exit(0);
	}
	let testChoiceKey = testNameArray[testChoiceIndex - 1];

	chosenTestSet = testDefinitionData[testChoiceKey];
	if (chosenTestSet.allowSelfSigned){
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
	}
	let tests = preProcessTests(chosenTestSet);

	gatherInputValues(chosenTestSet, testChoiceKey);

	Logger.log("\nRunning tests...\n");

	recursivelyRunTests(tests, 0, function(){
		displayTestResults();
	});
}

function preProcessTests(chosenTestSet){

	let tests = chosenTestSet.tests;

	if (chosenTestSet.useSSL == null){
		return tests;
	}

	for (let index = 0; index < tests.length; index++){
		let test = tests[index];
		if (chosenTestSet.useSSL){
			if (test.url.startsWith("https:")){
				// do nothing
			}
			else if (test.url.startsWith("http:")){
				test.url = test.url.replace("http:", "https:");
			}
			else {
				test.url = "https://" + test.url;
			}
		}
		else {
			if (test.url.startsWith("https:")){
				test.url = test.url.replace("https:", "http:");
			}
			else if (test.url.startsWith("http:")){
				// do nothing
			}
			else {
				test.url = "http://" + test.url;
			}
		}
	}
	return tests;
}

function gatherInputValues(chosenTestSet, testChoiceKey){
	if (!chosenTestSet.inputValues){
		return;
	}

	let requireUserInput = true;

	if (storedInputValues[testChoiceKey] != null){
		Logger.log("\nExisting input values found for this test set");
		let useStoredInputValuesChoice = prompt("Use these values (y/n)?: ");
		if (useStoredInputValuesChoice != null && useStoredInputValuesChoice.toLowerCase().trim() == ("y")){
			inputValues = storedInputValues[testChoiceKey];
			requireUserInput = false;
		}
	}

	if (requireUserInput){
		Logger.log("\nPlease input some required values\n");

		for (let index = 0; index < chosenTestSet.inputValues.length; index++){
			let inputKey = chosenTestSet.inputValues[index];
			let inputValue = prompt(inputKey + ": ");
			inputValues[inputKey] = inputValue;
		}

		Logger.log();
		let storeInputValuesChoice = prompt("Store these values (y/n)?: ");
		if (storeInputValuesChoice != null && storeInputValuesChoice.toLowerCase().trim() == ("y")){
			storeInputValues(inputValues, testChoiceKey);
		}	
	}
}

// TODO Will probably have to refactor this when environment variables are implement properly
function storeInputValues(inputValues, testChoiceKey){
	let existingInputValues = storedInputValues[testChoiceKey] != null ? storedInputValues[testChoiceKey] : {};
	let newInputValues = Object.assign(existingInputValues, inputValues);
	storedInputValues[testChoiceKey] = newInputValues;
	fs.writeFileSync(storedInputValuesFilePath, JSON.stringify(storedInputValues));
}

function loadStoredInputValues(){
	if (fs.existsSync(storedInputValuesFilePath)){
		try {
			storedInputValues = JSON.parse(fs.readFileSync(storedInputValuesFilePath, 'utf8'));
		}
		catch (error){
			Logger.log("\nUnable to load stored input values\n");
		}
		
	}
}

function recursivelyRunTests(tests, index, callbackFunction){
	if (index >= tests.length){
		callbackFunction();
		return;
	}
	let test = tests[index];
	let testTitle = test.title;
	let expectedResponse = test.expected;

	if (!test.type){
		recordFailure(test, null, null, "Missing request type");
		recursivelyRunTests(tests, index + 1, callbackFunction);
		return;
	}

	if (![GET, POST].includes(test.type)){
		recordFailure(test, null, null, "Invalid request type: " + test.type);
		recursivelyRunTests(tests, index + 1, callbackFunction);
		return;
	}

	if (![TYPE_TEXT, TYPE_JSON].includes(expectedResponse.type) && expectedResponse.code == null){
		recordFailure(test, null, null, "Invalid expected response type: " + expectedResponse.type);
		recursivelyRunTests(tests, index + 1, callbackFunction);
		return;
	}

	if (test.headers){
		let headerKeys = Object.keys(test.headers);
		for (let keyIndex = 0; keyIndex < headerKeys.length; keyIndex++){
			let key = headerKeys[keyIndex];
			let value = test.headers[key];
			if (value.startsWith("<") && value.endsWith(">")){
				let trimmedValue = value.substr(1, value.length - 2);
				if (inputValues[trimmedValue]){
					test.headers[key] = inputValues[trimmedValue];
				}
				else if (responseValues[trimmedValue]){
					test.headers[key] = responseValues[trimmedValue];
				}
			}
			else if (inputValues[key]){
				test.headers[key] = inputValues[key];
			}
			else if (responseValues[key]){
				test.headers[key] = responseValues[key];
			}
		}
	}

	if (!test.url){
		recordFailure(test, null, null, "Missing test URL");
		recursivelyRunTests(tests, index + 1, callbackFunction);
		return;
	}
	test.url = processUrlParams(test.url);

	let testStartTime = Date.now();

	if (test.type == GET){
		RequestUtils.sendGetRequest(test.url, test.headers ? test.headers : {}, 
			// successFunction
			function(body, statusCode){
				let responseTime = Date.now() - testStartTime;
				test['responseTime'] = responseTime;

				if (expectedResponse.type == null){
					if (expectedResponse.code == null){
						recordFailure(test, null, null, "No expected status code provided");
					}
					else if (statusCode == expectedResponse.code){
						recordSuccess(test);
					}
					else {
						recordFailure(test, null, null, "Unexpected status code: " + statusCode);
					}
					recursivelyRunTests(tests, index + 1, callbackFunction);
				}

				if (expectedResponse.type == TYPE_TEXT){
					if (expectedResponse.content != null){
						test.response = body;
						if (expectedResponse.content == body){
							if (expectedResponse.code == null || statusCode == expectedResponse.code){
								recordSuccess(test);
							}
							else {
								recordFailure(test, null, null, "Unexpected status code: " + statusCode);
							}
						}
						else {
							recordFailure(test, body, null, "Expected content does not match");
						}	
					}

					storeTextResponse(test, body);

					recursivelyRunTests(tests, index + 1, callbackFunction);
					
				}
				else if (expectedResponse.type == TYPE_JSON){
					if (expectedResponse.content != null){
						test.response = body;
						if (JSON.stringify(expectedResponse.content) == body){
							if (expectedResponse.code == null || statusCode == expectedResponse.code){
								recordSuccess(test);
							}
							else {
								recordFailure(test, null, null, "Unexpected status code: " + statusCode);
							}
						}
						else {
							recordFailure(test, body, null, "Expected content does not match");
						}	
					}
					else if (expectedResponse.code == null){
						recordFailure(test, null, null, "No expected status code provided");
					}
					else if (statusCode == expectedResponse.code){
						recordSuccess(test);
					}
					else {
						recordFailure(test, null, null, "Unexpected status code: " + statusCode);
					}
					
					let responseJson = JSON.parse(body);
					storeResponseValues(test, responseJson);

					recursivelyRunTests(tests, index + 1, callbackFunction);
				}
			},
			// failFunction
			function(statusCode){
				let responseTime = Date.now() - testStartTime;
				test['responseTime'] = responseTime;

				if (expectedResponse.code != null && expectedResponse.code == statusCode){
					recordSuccess(test);
				}
				else {
					recordFailure(test, null, statusCode);
				}
				recursivelyRunTests(tests, index + 1, callbackFunction);
			},
			// noResponseFunction
			function(){
				let responseTime = Date.now() - testStartTime;
				test['responseTime'] = responseTime;

				if (expectedResponse.code != null && expectedResponse.code == 521){
					recordSuccess(test);
				}
				else {
					recordFailure(test, null, 521);
				}
				recursivelyRunTests(tests, index + 1, callbackFunction);
			}
		);
	}
	else if (test.type == POST){

		if (test.form){
			let formKeys = Object.keys(test.form);
			for (let keyIndex = 0; keyIndex < formKeys.length; keyIndex++){
				let key = formKeys[keyIndex];
				let value = test.form[key];
				if (value.startsWith("<") && value.endsWith(">")){
					let trimmedValue = value.substr(1, value.length - 2);
					if (inputValues[trimmedValue]){
						test.form[key] = inputValues[trimmedValue];
					}
					else if (responseValues[trimmedValue]){
						test.form[key] = responseValues[trimmedValue];
					}
				}
				else if (inputValues[key]){
					test.form[key] = inputValues[key];
				}
				else if (responseValues[key]){
					test.form[key] = responseValues[key];
				}
			}	
		}

		let postFunction = RequestUtils.sendPostBodyRequest;
		let postData = {};
		if (test.body){
			postData = test.body;
		}
		else if (test.form){
			postFunction = RequestUtils.sendPostFormRequest;
			postData = test.form;
		}

		postFunction(test.url, test.headers ? test.headers : {}, postData, 
			// successFunction
			function(body, statusCode){
				let responseTime = Date.now() - testStartTime;
				test['responseTime'] = responseTime;

				if (expectedResponse.type == null){
					if (expectedResponse.code == null){
						recordFailure(test, null, null, "No expected status code provided");
					}
					else if (statusCode == expectedResponse.code){
						recordSuccess(test);
					}
					else {
						recordFailure(test, null, null, "Unexpected status code: " + statusCode);
					}
					recursivelyRunTests(tests, index + 1, callbackFunction);
					return;
				}

				if (expectedResponse.type == TYPE_TEXT){
					if (expectedResponse.content != null){
						test.response = body;
						if (expectedResponse.content == body){
							if (expectedResponse.code == null || statusCode == expectedResponse.code){
								recordSuccess(test);
							}
							else {
								recordFailure(test, null, null, "Unexpected status code: " + statusCode);
							}
						}
						else {
							recordFailure(test, body, null, "Expected content does not match");
						}	
					}

					storeTextResponse(test, body);

					recursivelyRunTests(tests, index + 1, callbackFunction);
				}
				else if (expectedResponse.type == TYPE_JSON){
					if (expectedResponse.content != null){
						test.response = body;
						if (JSON.stringify(expectedResponse.content) == body){
							if (expectedResponse.code == null || statusCode == expectedResponse.code){
								recordSuccess(test);
							}
							else {
								recordFailure(test, null, null, "Unexpected status code: " + statusCode);
							}
						}
						else {
							recordFailure(test, body, null, "Expected content does not match");
						}	
					}
					else if (expectedResponse.code == null){
						recordFailure(test, null, null, "No expected status code provided");
					}
					else if (statusCode == expectedResponse.code){
						recordSuccess(test);
					}
					else {
						recordFailure(test, null, null, "Unexpected status code: " + statusCode);
					}

					let responseJson = JSON.parse(body);
					storeResponseValues(test, responseJson);

					recursivelyRunTests(tests, index + 1, callbackFunction);
				}
			},
			// failFunction
			function(statusCode){
				let responseTime = Date.now() - testStartTime;
				test['responseTime'] = responseTime;

				if (expectedResponse.code != null && expectedResponse.code == statusCode){
					recordSuccess(test);
				}
				else {
					recordFailure(test, null, statusCode);
				}
				recursivelyRunTests(tests, index + 1, callbackFunction);
			},
			// noResponseFunction
			function(){
				let responseTime = Date.now() - testStartTime;
				test['responseTime'] = responseTime;

				if (expectedResponse.code != null && expectedResponse.code == 521){
					recordSuccess(test);
				}
				else {
					recordFailure(test, null, 521);
				}
				recursivelyRunTests(tests, index + 1, callbackFunction);
			}
		);
	}
}

function processUrlParams(url){
	if (!url.includes("?")){
		return url;
	}
	let preParamSection = url.substr(0, url.indexOf('?'));
	let paramSection = url.substr(url.indexOf('?') + 1, url.length);
	let paramSectionArray = paramSection.split("&");
	let rebuiltParamSection = "";
	for (let index = 0; index < paramSectionArray.length; index++){
		let paramPair = paramSectionArray[index].split("=");
		let paramValue = paramPair[1];
		if (paramValue.startsWith("<") && paramValue.endsWith(">")){
			let trimmedParamValue = paramValue.substr(1, paramValue.length - 2);
			if (inputValues[trimmedParamValue]){
				paramPair[1] = inputValues[trimmedParamValue];
			}
			else if (responseValues[trimmedParamValue]){
				paramPair[1] = responseValues[trimmedParamValue];
			}
		}
		if (rebuiltParamSection){
			rebuiltParamSection += "&";
		}
		rebuiltParamSection += paramPair[0] + "=" + paramPair[1];
	}
	return preParamSection + "?" + rebuiltParamSection;
}

function storeResponseValues(test, responseJson){
	if (test.responseValues == null){
		return;
	}
	for (let index = 0; index < test.responseValues.length; index++){
		let key = test.responseValues[index];
		if (responseJson[key]){
			responseValues[key] = responseJson[key];
		}
	}
}

function storeTextResponse(test, body){
	if (test.responseValues == null){
		return;
	}
	if (test.responseValues.length > 1){
		Logger.log("    🟥 Cannot capture multiple values for a TEXT response: " + test.responseValues.toString());
		return;
	}
	responseValues[test.responseValues[0]] = body;
}

function recordSuccess(test){
	if (!checkNfrs(test)){
		failedTests.push(test);
		return;
	}
	Logger.log("🟢 [" + (test.type ? test.type : '?') + " " + test.url + "]   " + test.title + (test.responseTime ? "   " + test.responseTime + "ms" : ""));
	passedTests.push(test);
}

function checkNfrs(test){
	if (!test.nfr){
		return true;
	}
	if (test.nfr.maxResponseTime){
		if (test.responseTime && test.responseTime > test.nfr.maxResponseTime){
			Logger.log("🟡 [" + (test.type ? test.type : '?') + " " + test.url + "]   " + test.title + "   " + test.responseTime + "ms (slow response)");
			return false;
		}
	}

	return true;
}

function recordFailure(test, body, errorCode, customMessage){
	Logger.log("🔴 [" + (test.type ? test.type : '?') + " " + test.url + "] " + test.title + 
		(errorCode ? ' [ERROR ' + errorCode + ']' : '') + 
		(customMessage ? ' - ' + customMessage : '') + 
		(test.responseTime ? "   " + test.responseTime + "ms" : ""));
	failedTests.push(test);
	if (test.response != null){
		Logger.log("  Expected ---> " + test.expected.content);
		Logger.log("  Actual ---> " + test.response);
	}
}

function displayTestResults(){
	Logger.log("\nAll tests run\n");

	let percentagePassed = parseInt((passedTests.length / (passedTests.length + failedTests.length)) * 100);
	Logger.log("Tests passed: " + passedTests.length + " / " + (passedTests.length + failedTests.length) + " (" + percentagePassed + "%)\n");

	if (failedTests.length > 0){
		let testsToReRun = failedTests.slice(0);
		passedTests = [];
		failedTests = [];
		let rerunFailedTestsOnly = prompt("Would you like to re-run failed tests only (y/n)?: ");
		if (rerunFailedTestsOnly != null && rerunFailedTestsOnly.toLowerCase().trim() == ("y")){
			Logger.log("\nRe-running failed tests...\n");
			recursivelyRunTests(testsToReRun, 0, function(){
				displayTestResults();
			});
		}
		else {
			let failedTestsData = {
				"tests" : testsToReRun
			}
			if (chosenTestSet.allowSelfSigned){
				failedTestsData.allowSelfSigned = true;
			}
			fs.writeFileSync(failedTestsFilePath, JSON.stringify(failedTestsData));
		}
	}
}

function handleStartup(){
	if (fs.existsSync(failedTestsFilePath)){
		chosenTestSet = JSON.parse(fs.readFileSync(failedTestsFilePath, 'utf-8'));
		let testsToReRun = chosenTestSet.tests;
		if (chosenTestSet.allowSelfSigned){
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
		}
		fs.unlinkSync(failedTestsFilePath);
		let rerunFailedTestsOnly = prompt("Previously failed tests found. Would you like to re-run these failed tests only (y/n)?: ");
		if (rerunFailedTestsOnly != null && rerunFailedTestsOnly.toLowerCase().trim() == ("y")){
			Logger.log("\nRe-running failed tests...\n");
			recursivelyRunTests(testsToReRun, 0, function(){
				displayTestResults();
			});
			return;
		}
	}
	chooseTests();
}

loadStoredInputValues();
handleStartup();
