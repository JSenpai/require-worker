"use strict";

// This example requires existing nodejs modules
// Note: For internal modules, wrapRequire:true must be used as a require option
// Some of these examples are from the Nodejs documentation
var rw = require('../index.js');
//rw.options.verboseIO = true;

// The OS module
var osWorker = rw.require('os',{ wrapRequire:true }), os = osWorker.methods;
os.arch().then(function(result){
	console.log('os.arch result:',result);
	osWorker.kill();
});

// The Path module
var pathWorker = rw.require('path',{ wrapRequire:true }), path = pathWorker.methods;
// Lets chain some promises
path.normalize('/foo/bar//baz/asdf/quux/..').then(function(result){
	console.log('path.normalize result:',result);
	return path.resolve(result, '../hello/world')
}).then(function(result){
	console.log('path.resolve result:',result);
	pathWorker.kill();
});

// The Events module
var eventsWorker = rw.require('events',{ wrapRequire:true });
// Create a shortcut for callOptions
var callOptions = eventsWorker.callOptionsObject.bind(eventsWorker);
// Call a 'new' eventEmiiter
//var newEventEmitterPromise = eventsWorker.call(null,eventsWorker.callOptionsObject({ newInstance:true }));
var newEventEmitterPromise = new eventsWorker.call(null);
newEventEmitterPromise.then(function(result){
	// since this was a 'new' call, it returns a proxy. so use result.methods like we do above for the rw.require(). result.call() is also available.
	var events = result.methods;
	events.once('test',function(arg1,arg2){
		console.log('eventEmitter .once .emit - test:',arg1,arg2);
		eventsWorker.kill();
	},callOptions({ ignoreResult:true })).then(function(){});
	// Pass ignoreResult so undefined returns can finish the promise, and so callbacks continue to work.
	events.emit('test','foo','bar',callOptions({ ignoreResult:true })).then(function(){});
});

// The Crypto module
// Not yet implemented: requires work on normal object handling
/*
var cryptoWorker = rw.require('crypto',{ wrapRequire:true }), crypto = cryptoWorker.methods;
crypto.createHmac('sha256','abcdefg',cryptoWorker.callOptionsObject({ useReturnOnly:null })).then(function(c){
	console.log('crypto.createHash');
	return c.update('I love cupcakes');
}).then(function(c){
	console.log('crypto.createHash .update');
	return c.digest('hex');
}).then(function(result){
	console.log('crypto.createHash .update .digest');
	console.log('crypto result:',result);
	pathWorker.kill();
});
*/