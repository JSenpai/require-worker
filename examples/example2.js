"use strict";

// This example requires existing nodejs modules
// Note: For internal modules, wrapRequire:true must be used as a require option
// Some of these examples are from the Nodejs documentation
var rw = require('../index.js');
rw.options.verboseIO = false;

// The OS module
var osWorker = rw.require('os',{ wrapRequire:true }), os = osWorker.methods;
os.arch().then(function(result){
	console.log('os.arch result:',result);
	osWorker.kill();
}).catch(function(err){
	console.error('osWorker: Something went wrong.',err);
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
}).catch(function(err){
	console.error('pathWorker: Something went wrong.',err);
	pathWorker.kill();
});

// The Events module
var eventsWorker = rw.require('events',{ wrapRequire:true });
var eTemp = eventsWorker.devObj; // Safe object for developers to store stuff on
// Call a 'new' eventEmiiter
//var newEventEmitterPromise = eventsWorker.call(null,eventsWorker.callOptionsObject({ newInstance:true }));
var newEventEmitterPromise = new eventsWorker.call(null);
newEventEmitterPromise.then(function(result){
	console.log('new eventEmitter');
	// since this was a 'new' call, it returns a proxy. so use result.methods like we do above for the rw.require(). result.call() is also available.
	eTemp.events = result.methods;
	// setup an event listener
	return eTemp.events.once('test',function(arg1,arg2){
		console.log('eventEmitter .once .emit - test event callback:',arg1,arg2);
		//eventsWorker.kill();
	},rw.callOptions({ ignoreResult:true }));
}).then(function(){
	// Pass ignoreResult so undefined returns can finish the promise, and so callbacks continue to work.
	return eTemp.events.emit('test','foo','bar',rw.callOptions({ ignoreResult:true }));
}).then(function(){
	console.log('events.emit complete');
	eventsWorker.kill();
}).catch(function(err){
	console.error('eventsWorker: Something went wrong.',err);
	eventsWorker.kill();
});

// The Crypto module
var cryptoWorker = rw.require('crypto',{ wrapRequire:true }), crypto = cryptoWorker.methods;
var cTemp = cryptoWorker.devObj; // Safe object for developers to store stuff on
crypto.createHmac('sha256','abcdefg',rw.callOptions({ forceProxy:true })).then(function(result){
	console.log('crypto.createHash');
	cTemp.hashObj = result.methods;
	return cTemp.hashObj.update('I love cupcakes',rw.callOptions({ ignoreResult:true }));
}).then(function(){
	console.log('crypto.createHash .update');
	return cTemp.hashObj.digest('hex',rw.callOptions({ useReturnOnly:true }));
}).then(function(hash){
	console.log('crypto.createHash .update .digest');
	console.log('crypto result:',hash);
	cryptoWorker.kill();
}).catch(function(err){
	console.error('cryptoWorker: Something went wrong.',err);
	cryptoWorker.kill();
});
