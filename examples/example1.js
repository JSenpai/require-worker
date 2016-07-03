"use strict";

var requireWorker = require('../requireWorker.js');

//var someModule = requireWorker.require('./aModule.js');
//var someModule = requireWorker.require('./aModule.js',{ cwd:__dirname });
var someModule = requireWorker.require(require.resolve('./module_a.js'));

// Call the 'hello' method on the module (module.exports.hello)
// The call method returns a Promise for success & failure
someModule.call('hello','Foo').then(function(result){
	// The promise will resolve when the module method returns a value other than undefined, or when they called this.finish()
	console.log('hello: Result:',result);
},function(err){
	// On Error, if the error is generated internally, it will return a string number that will exist in .errorList. Otherwise the error message (or the reject message) will show.
	if(err in requireWorker.errorList) console.log('hello: Error:',result,requireWorker.errorList[err]);
	else console.warn('hello: Error:',err);
});

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

// Above methods were done via .call
// Below methods are done via a Proxy object at .methods (each property returns a function that does .call automatically)

// This method will always fail
someModule.methods.rejectMe().then(function(result){
	console.log('rejectMe: Then Result:',result);
},function(result){
	// On the requireWorker, there is a list of error codes which have a string representation of the error (handy for debugging)
	if(result in requireWorker.errorList) console.log('rejectMe: Catch Error:',result,requireWorker.errorList[result]);
	else console.log('rejectMe: Catch Error:',result);
});

// This method lets you use callbacks (anonymous function as an argument)
var intervalCount = 0;
someModule.methods.intervalTest('Foo',function(arg1,arg2){
	console.log('intervalTest:',arg1,arg2);
	intervalCount++;
	//if(intervalCount>=2) this.finish(); // If .finish is called on this side, it will internally ignore future callback calls
},function(){
	console.log('intervalTest:','second callback');
}).then(function(){
	// The callbacks will no longer be called
	console.log('intervalTest:','promise done');
});

// Call the 'yo' method that is actually on a worker within the main worker
someModule.methods.yo('John',function(msg){
	console.log('yo: CB Result:',msg);
}).then(function(result){
	console.log('yo: Func Result:',result);
},function(err){
	console.log('yo: Func Error:',err);
});

// This call promise also works with non-function properties, as if they were functions returning their own value
someModule.methods.someValue().then(function(value){
	console.log('someModule.methods.someValue:',value);
});
// Can also set the value with the first argument (results with new value)
someModule.methods.someValue('Some other value').then(function(value){
	console.log('someModule.methods.someValue has been set to:',value);
});
// It also works with functions! (only if the property exists already as a non-function type. eg: null)
// Set property onTest to a function
someModule.methods.onTest(function(a,b,c){
	console.log('onTest callback:',a+', '+b+', '+c);
}).then(function(){
	// Now all calls to onTest will work the other way
	someModule.methods.onTest('Test 123','abc','Foo Bar').then(function(value){
		// All Good
	},function(err){
		console.warn('Failed to call onTest:',requireWorker.errorList[err]);
	});
},function(err){
	console.warn('Failed to set onTest:',requireWorker.errorList[err]);
});
