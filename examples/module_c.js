"use strict";

// Initialise the worker
require('../index.js').initModule(module);

// Return a promise that will resolve in 1 second
module.exports.timedHello1 = function(name){
	return new Promise(function(resolve,reject){
		setTimeout(function(){
			resolve('Hello '+name+'!');
		},1000);
	});
};

// Reject with a promise that will resolve in 1 second
module.exports.timedHello2 = function(name){
	// Javascipt promises are sneaky. To truely pass a promise to the other side, use .reject
	// If you pass a promise into .resolve instead, it will act exactly the same as the example above
	this.reject(new Promise(function(resolve,reject){
		setTimeout(function(){
			resolve('Hello '+name+'!');
		},1000);
	}));
};
