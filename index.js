/* global process, require, __filename, __dirname, Promise */
"use strict";

const path = require('path');
const childProcess = require('child_process');
const eventEmitter = require('events');
const _ = require('underscore');

const proxyCom = require(path.resolve(__dirname,'./lib/proxy-communication'));
const ipcTransport = require(path.resolve(__dirname,'./lib/ipc-transport'));

module.exports = (target)=>{
	if(hostObject!==null){
		if(target) throw Error("first argument should be undefined, as this is currently in host mode");
		return hostObject;
	}
	if(!clientsMap.has(target)) throw Error("first argument must be a valid require-worker client or path");
	return clientsMap.get(target);
};

module.exports.require = (path,options)=>new client(path,options);

var getStackFiles = function getStackFiles(){
	let opst = Error.prepareStackTrace, thisError, result = [];
	Error.prepareStackTrace = (errStackStr,cssfArr)=>cssfArr;
	thisError = new Error();
	Error.captureStackTrace(thisError,getStackFiles); // https://nodejs.org/api/errors.html#errors_new_error_message
	let cssfArr = thisError.stack;
	Error.prepareStackTrace = opst;
	for(let i=0,l=cssfArr.length; i<l; i++){
		let cssf = cssfArr[i]; // https://github.com/v8/v8/wiki/Stack-Trace-API
		let file=cssf.getFileName();
		if(file===__filename) continue;
		//let type=cssf.getTypeName(), fn=cssf.getFunctionName();
		//if(file==='module.js' && (type==='Module' || type==='Object' || type==='Function' || type===null) && fn.indexOf('Module')!==-1) continue;
		//if(file==='bootstrap_node.js' && type===null && fn==='run') continue;
		result.push(file);
	}
	return result; 
};

var clientsMap = new Map(), clientIndex = 0;
var client = function requireWorkerClient(file,options={ forkOptions:{ unref:false } }){
	if(!_.isString(file)) throw Error("first argument must be a string (require path)");
	if(!_.isObject(options)) throw Error("second argument must be an object (options) or undefined");
	var self = this;
	self.id = (++clientIndex)+':'+_.uniqueId()+':'+Date.now();//+':'+file;
	self.options = options;
	self.events = new eventEmitter();
	self.ipcTransport = ipcTransport.create({
		id: 'require-worker:'+self.id
	});
	var hostOptions = {
		transport: 'ipcTransport',
		ipcTransportID: self.ipcTransport.id
	};
	self.file = file;
	if(path.isAbsolute(file)) hostOptions.file = file;
	else {
		try{
			var prevStackDir = path.dirname(getStackFiles()[0]);
			try{ // file relative to the directory
				hostOptions.file = require.resolve(path.resolve(prevStackDir,file));
			}catch(err1){
				try{ // file itself (eg, nodejs module)
					hostOptions.file = require.resolve(file);
				}catch(err2){ // fallback to setting cwd of fork
					hostOptions.file = file;
					options.forkOptions.cwd = prevStackDir;
				}
			}
		}catch(err3){
			hostOptions.file = file;
		}
	}
	self.hostOptions = hostOptions;
	self.child = childProcess.fork(__filename,['--requireHost',JSON.stringify(hostOptions)],options.forkOptions);
	self.setChildReferenced(!options.unref);
	self.ipcTransport.setChild(self.child);
	clientsMap.set(self.file,self);
	self.proxyCom = proxyCom.create({
		transport: { type:'ipcTransport', instance:self.ipcTransport },
		requireWorkerClient: self
	});
	self.proxyCom.transport.once('requireState',({message,stack}={})=>{
		if(stack){
			self.child.kill();
			var e = new Error(message);
			e.stack = stack;
			self.events.emit('error',e); //throw e;
		}
	});
	self.proxyCom.connectTransportClient();
	self.proxy = self.proxyCom.createMainProxyInterface();
	clientsMap.set(self.proxy,self);
	return self.proxy;
};

client.prototype = {
	setChildReferenced: function(bool){
		if(bool) this.child.ref();
		else this.child.unref();
	},
	hasProperty: function(property){
		
	},
	deleteProperty: function(property){
		
	},
	setProperty: function(property,value){
		
	},
	getProperty: function(property){
		// use case: requireWorker(test).getProperty('foo').then((value)=>{ /* value='bar' */ });
		// use case: requireWorker(test).getProperty('someObject').then((value)=>{ /* value=ProxyInterface */ });
	}
};

var checkRequireHost = ()=>{
	if(require.main===module && process.argv.length===4 && process.argv[2]==='--requireHost'){
		var hostOptions = JSON.parse(process.argv[3]);
		if(!_.isObject(hostOptions)) throw Error("JSON.parse of hostOptions failed");
		module.exports = new host(hostOptions);
	}
};

var hostExports = null, hostObject = null;
var host = function requireWorkerHost({ transport, ipcTransportID, file }){
	var self = hostObject = this;
	if(transport!=='ipcTransport') throw Error("Invalid transport, only ipcTransport is currently implemented");
	self.events = new eventEmitter();
	self.ipcTransport = ipcTransport.create({
		id: ipcTransportID,
		parent: true
	});
	self.proxyCom = proxyCom.create({
		transport: { type:'ipcTransport', instance:self.ipcTransport },
		requireWorkerHost: self
	});
	var requireError;
	self.proxyCom.connectTransportHost(()=>{
		if(requireError){
			self.proxyCom.transport.send("requireState",_.pick(requireError,['message','stack']));
		} else {
			self.proxyCom.transport.send("requireState");
			self.proxyCom.setProxyTarget(self.exports);
		}
	});
	try{
		self.exports = hostExports = require(file);
	}catch(err){
		requireError = err;
	}
	return this;
};

host.prototype = {
	
};

checkRequireHost();
