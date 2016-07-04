"use strict";

// This example requires existing nodejs modules
// Note: For internal modules, wrapRequire:true must be used as a require option
// Some of these examples are from the Nodejs documentation
var rw = require('../index.js');

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

// require-worker is *currently* incompatible with the modules: http, crypto, eventemitter and etc, since the functions return objects with other functions on them.
// * one day..
