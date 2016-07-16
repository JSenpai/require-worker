"use strict";

// This example requires existing nodejs modules
// Note: For internal modules, wrapRequire:true must be used as a require option
// Some of these examples are from the Nodejs documentation
var rw = require('../index.js');
rw.options.verboseIO = true;

// Require module_c.js
var moduleCWorker = rw.require(require.resolve('./module_c.js')), mc = moduleCWorker.methods;

// Call timedHello1 which itself returns a promise
console.log('timedHello1 call. waiting for result.');
mc.timedHello1('Foo').then(function(result){
	console.log('timedHello1 result:',result);
	moduleCWorker.kill();
}).catch(function(err){
	console.log('timedHello1 error:',err);
	moduleCWorker.kill();
});

// Call timedHello2 which itself returns a promise
console.log('timedHello2 call. waiting for result.');
mc.timedHello2('Bar').then(function(result){
	console.log('timedHello2 result:',result);
	moduleCWorker.kill();
}).catch(function(err){
	err.then(function(result2){
		console.log('timedHello2 result2:',result2);
		moduleCWorker.kill();
	}).catch(function(err2){
		console.log('timedHello2 error:',err2);
		moduleCWorker.kill();
	});
});
