"use strict";

// Initialise the worker
// If the 'module' object is passed, then the host calls will use the methods on module.exports
// If 'exports' does not exist in the object passed, then the object itself will be where the methods are called on.
// This initModule call is not needed if required with option: wrapRequire:true
require('../index.js').initModule(module);

// Some non-function properties
module.exports.someValue = 'Foo Bar';
module.exports.onTest = null;

// Declare some methods
// hello method (always return)
module.exports.hello = function(name){
	// Simply return the result (finishes promise internally)
	return 'Hello '+(name||'World')+'!';
};

// hai method (always finish)
module.exports.hai = function(name){
	// Finish the promise (async method) with the result
	this.finish('Hello '+(name||'World')+'!');
	// If the function returns something (that is not undefined), it will use that as the result instead and all future promise finishes/rejects are ignored
};

// returnTest method (return undefined)
module.exports.returnTest = function(logText){
	console.log(logText);
	return; // Optional
};

// rejectMe method (always reject)
module.exports.rejectMe = function(){
	// Always reject
	this.reject('Rejected');
};

// intervalTest method. This creates a timer which calls a callback.
module.exports.intervalTest = function(text,callback1,callback2){
	var self = this;
	var count = 0;
	// Set an interval to call a callback every x seconds
	var tmr = setInterval(function(){
		callback1(text,new Date().toLocaleString());
		count++;
		if(count>=3){
			// Stop the timer and finish the promise
			callback2();
			self.finish();
			clearInterval(tmr);
		}
	},1000);
};

// Require yet another worker within this worker
var someOtherModule = require('../index.js').require('./module_b.js',{ cwd:__dirname });

// Map 'yo' to the new worker
module.exports.yo = function(name,cb1){
	var self = this;
	someOtherModule.methods.yo(name,cb1).then(function(result){
		self.finish('Sub-Worker Result: '+result);
	},function(err){
		self.rehect('Sub-Worker Error: '+err);
	});
};

module.exports.giveMeAFunction = function(someText){
	return function(prefixText){
		console.log('giveMeAFunction: returned function was called.',prefixText+' '+someText+'.');
	};
};
