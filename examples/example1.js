"use strict";

var requireWorker = require('../requireWorker.js');

//var someModule = requireWorker.require('./aModule.js');
//var someModule = requireWorker.require('./aModule.js',{ cwd:__dirname });
var someModule = requireWorker.require(require.resolve('./aModule.js'));

// The call method return a Promise for success & failure
// Call the 'hello' method on the module (module.exports.hello)
someModule.call('hello','Foo').then(function(result){
	console.log('hello: Result:',result);
});

// The call method return a Promise for success & failure
// Call the 'hello' method on the module (module.exports.hello)
someModule.call('hai','Bar').then(function(result){
	console.log('hai: Result:',result);
});

// Call a null method, which only exists within the requireWorker code (handy to test if worker is still alive)
someModule.call(null).then(function(){
	console.log('Worker is still alive');
},function(err){
	console.log('Worker may not be alive? '+err);
});

// Create an object of the specified methods, so they can be called directly instead of using .call()
var theModule = someModule.shortMethods('rejectMe','intervalTest','yo');

// This method will always fail
theModule.rejectMe().then(function(result){
	console.log('rejectMe: Then Result:',result);
},function(result){
	// On the requireWorker, there is a list of error codes which have a string representation of the error (handy for debugging)
	if(result in requireWorker.errorList) console.log('rejectMe: Catch Error:',result,requireWorker.errorList[result]);
	else console.log('rejectMe: Catch Error:',result);
});

// This method lets you use callbacks
var intervalCount = 0;
theModule.intervalTest('Foo',function(arg1,arg2){
	console.log('intervalTest:',arg1,arg2);
	intervalCount++;
	//if(intervalCount>=2) this.finish(); // This can be done. It will then internally ignore future callback calls
},function(){
	console.log('intervalTest:','second callback');
}).then(function(){
	// The callbacks will no longer be called
	console.log('intervalTest:','promise done');
});

// Call the 'yo' method that is actually on a worker within the main worker
theModule.yo('John',function(msg){
	console.log('yo: CB Result:',msg);
}).then(function(result){
	console.log('yo: Func Result:',result);
},function(err){
	console.log('yo: Func Error:',err);
});
