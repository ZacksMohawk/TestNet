global.appType = "TestNet";
global.version = "1.0.10";

const fs = require('fs');
const prompt = require("prompt-sync")();
const RequestUtils = require('./includes/RequestUtils');
const Logger = require('./includes/Logger');

Logger.log();
Logger.log(fs.readFileSync('AppLogo.txt', 'utf8').replace('[version]', 'TestNet v' + version), "FgGreen");
Logger.log();

const GET = "GET";
const POST = "POST";
const TYPE_TEXT = "text";
const TYPE_JSON = "json";

const MATCH_TYPE_FULL = "full";
const MATCH_TYPE_PARTIAL = "partial";

let storedInputValuesFilePath = 'env.json';
let testDefFilePath = 'test.def.json';
let inputValues = {};
let storedInputValues = {};
let responseValues = {};

let chosenTestSet;
let passedTests = [];
let failedTests = [];
let failedTestsFilePath = 'failed.json';

let totalTests;
let stopAfterFailure = false;

let localTestDefFilePath;
let folderPath;
if (process.argv.indexOf("-folderPath") != -1){
	folderPath = process.argv[process.argv.indexOf("-folderPath") + 1];
	localTestDefFilePath = folderPath + "/" + testDefFilePath;
}

let testFilePath;
if (process.argv.indexOf("-testFilePath") != -1){
	testFilePath = process.argv[process.argv.indexOf("-testFilePath") + 1];
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

	beginTests(chosenTestSet, testChoiceKey);
}

function beginTests(chosenTestSet, testChoiceKey){
	if (chosenTestSet.allowSelfSigned){
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
	}
	let tests = preProcessTests(chosenTestSet);
	totalTests = tests.length;

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
	if (index >= tests.length || stopAfterFailure){
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
				handleResponse(testStartTime, body, test, expectedResponse, statusCode, tests, index, callbackFunction);
			},
			// failFunction
			function(body, statusCode){
				handleResponse(testStartTime, body, test, expectedResponse, statusCode, tests, index, callbackFunction);
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
				handleResponse(testStartTime, body, test, expectedResponse, statusCode, tests, index, callbackFunction);
			},
			// failFunction
			function(body, statusCode){
				handleResponse(testStartTime, body, test, expectedResponse, statusCode, tests, index, callbackFunction);
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

function handleResponse(testStartTime, body, test, expectedResponse, statusCode, tests, index, callbackFunction){
	let responseTime = Date.now() - testStartTime;
	test['responseTime'] = responseTime;

	if (expectedResponse.code == null){
		recordFailure(test, null, 0, "No expected status code provided");
	}
	else if (expectedResponse.code == statusCode){
		if (expectedResponse.content != null){

			if (!validateMatchType(expectedResponse)){
				recordFailure(test, null, 0, "Invalid matchType: " + expectedResponse.matchType);
				recursivelyRunTests(tests, index + 1, callbackFunction);
				return;
			}

			test.response = body;

			if (expectedResponse.type == TYPE_JSON){
				matchJson(body, test, expectedResponse, statusCode);
			}
			else {
				matchText(body, test, expectedResponse, statusCode);
			}
		}
		else {
			recordSuccess(test);
		}
	}
	else {
		recordFailure(test, null, null, "Unexpected status code: " + statusCode);
	}

	if (expectedResponse.type == TYPE_JSON){
		let responseJson;
		try {
			responseJson = JSON.parse(body);
		}
		catch (error){
			responseJson = body;
		}
		storeResponseValues(test, responseJson);
	}
	else {
		storeTextResponse(test, body);
	}

	recursivelyRunTests(tests, index + 1, callbackFunction);
}

function matchJson(body, test, expectedResponse, statusCode){
	let jsonObject
	try {
		jsonObject = JSON.parse(body);
	}
	catch (error){
		recordFailure(test, body, null, "Response not valid JSON");
		return;
	}
	if (MATCH_TYPE_PARTIAL == expectedResponse.matchType){
		let mismatchFound = false;
		let expectedResponseKeys = Object.keys(expectedResponse.content);
		for (let index = 0; index < expectedResponseKeys.length; index++){
			let expectedResponseKey = expectedResponseKeys[index];
			let expectedResponseValue = expectedResponse.content[expectedResponseKey];
			let actualResponseValue = jsonObject[expectedResponseKey];
			if (!actualResponseValue || actualResponseValue != expectedResponseValue){
				mismatchFound = true;
				break;
			}
		}
		if (mismatchFound){
			recordFailure(test, body, null, "Expected content does not match");
		}
		else {
			recordSuccess(test);
		}
	}
	else if (JSON.stringify(expectedResponse.content) == body){
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

function matchText(body, test, expectedResponse, statusCode){
	if ((MATCH_TYPE_PARTIAL == expectedResponse.matchType && body.includes(expectedResponse.content)) 
		  || expectedResponse.content == body){
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

function validateMatchType(expectedResponse){
	return expectedResponse.matchType == null || [MATCH_TYPE_FULL, MATCH_TYPE_PARTIAL].indexOf(expectedResponse.matchType) > -1;
}

function storeResponseValues(test, responseJson){
	if (test.responseValues == null){
		return;
	}
	let responseValueKeys = Object.keys(test.responseValues);
	for (let index = 0; index < responseValueKeys.length; index++){
		let key = responseValueKeys[index];
		let value = test.responseValues[key];
		if (responseJson[key]){
			responseValues[value] = responseJson[key];
		}
	}
}

function storeTextResponse(test, body){
	if (test.responseValues == null){
		return;
	}
	let responseValueKeys = Object.keys(test.responseValues);
	if (responseValueKeys > 1){
		Logger.log("    🟥 Cannot capture multiple values for a TEXT response: " + test.responseValues.toString());
		return;
	}
	let key = responseValueKeys[0];
	let value = test.responseValues[key];
	responseValues[value] = body;
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
	if (errorCode == 0){
		Logger.log("⛔️ [" + (test.type ? test.type : "?") + " " + test.url + "] " + test.title + 
			" [INVALID TEST]" + 
			(customMessage ? " - " + customMessage : ""));
		return;
	}
	Logger.log("🔴 [" + (test.type ? test.type : "?") + " " + test.url + "] " + test.title + 
		(errorCode ? " [ERROR " + errorCode + "]" : "") + 
		(customMessage ? " - " + customMessage : "") + 
		(test.responseTime ? "   " + test.responseTime + "ms" : ""));
	failedTests.push(test);
	if (test.response != null && test.expected.content != test.response){
		Logger.log("  Expected ---> " + test.expected.content);
		Logger.log("  Actual ---> " + test.response);
	}
	if (test.stopOnFail){
		stopAfterFailure = true;
		Logger.log("  ---> Stopping tests after failure", "FgRed");
	}
}

function displayTestResults(){
	let totalCompletedTests = passedTests.length + failedTests.length;
	let skippedTests = totalTests - totalCompletedTests;
	if (skippedTests == 0){
		Logger.log("\nAll tests run\n");
	}
	else {
		Logger.log("\n" + totalCompletedTests + " test" + (totalCompletedTests != 1 ? "s" : "") + " run");
		Logger.log("(" + skippedTests + " test" + (skippedTests != 1 ? "s" : "") + " skipped)\n");
	}

	let percentagePassed = parseInt((passedTests.length / (passedTests.length + failedTests.length)) * 100);
	let resultReadoutColour = percentagePassed == 100 ? "FgGreen" : "FgRed";
	Logger.log("Tests passed: " + passedTests.length + " / " + (passedTests.length + failedTests.length) + " (" + percentagePassed + "%)\n", resultReadoutColour);

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
		}
	}
}

function handleStartup(){
	if (testFilePath){
		try {
			chosenTestSet = JSON.parse(fs.readFileSync(testFilePath, 'utf8'));
			beginTests(chosenTestSet, testFilePath);
		}
		catch (error){
			Logger.log("Invalid test file");
			process.exit(0);
		}
		return;
	}
	chooseTests();
}

loadStoredInputValues();
handleStartup();
