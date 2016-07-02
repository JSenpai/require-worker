"use strict";

// Initialise the worker
// If the 'module' object is passed, then the host calls will use the methods on module.exports
// If 'exports' does not exist in the object passed, then the object itself will be where the methods are called on.
require('../requireWorker.js').initModule(module);

module.exports.hello = function(name){
	// Simply return the result (finishes promise internally)
	return 'Hello '+(name||'World')+'!';
};

module.exports.hai = function(name){
	// Finish the promise (async method) with the result
	this.finish('Hello '+(name||'World')+'!');
	// If the function returns something (that is not undefined), it will use that as the result instead and all future promise finishes/rejects are ignored
};

module.exports.rejectMe = function(){
	// Always reject
	this.reject('Rejected');
};

module.exports.intervalTest = function(arg1,cb,cb2){
	var self = this;
	var count = 0;
	// Set an interval to call a callback every x seconds
	var tmr = setInterval(function(){
		cb(arg1,new Date().toLocaleString());
		count++;
		if(count>=5){
			// Stop the timer and finish the promise
			cb2();
			self.finish();
			clearInterval(tmr);
		}
	},1000);
};

// Require yet another worker within this worker
var someOtherModule = require('../requireWorker.js').require('./module_b.js',{ cwd:__dirname }).shortMethods('yo');

// Map 'yo' to the new worker
module.exports.yo = function(name,cb1){
	var self = this;
	someOtherModule.yo(name,cb1).then(function(result){
		self.finish('Sub-Worker Result: '+result);
	},function(err){
		self.rehect('Sub-Worker Error: '+err);
	});
};
