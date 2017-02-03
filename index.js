/* global process, require, __filename, __dirname, Promise */
"use strict";

const path = require('path');
const childProcess = require('child_process');
const eventEmitter = require('events');

const _ = require(path.resolve(__dirname,'./lib/underscore-with-mixins'));
const proxyCom = require(path.resolve(__dirname,'./lib/proxy-communication'));
const ipcTransport = require(path.resolve(__dirname,'./lib/ipc-transport'));

module.exports = exports = (target)=>{
	if(_.isString(target))try{ target = require.resolve(target); }catch(err){}
	if(hostsMap.has(target)) return hostsMap.get(target);
	if(clientsMap.size===0 && hostsMap.size>0) throw Error("first argument must be a valid require-worker host or file path");
	if(!clientsMap.has(target)) throw Error("first argument must be a valid require-worker client or file path");
	return clientsMap.get(target);
};

exports.require = (path,options)=>new client(path,options);

const getStackFiles = function getStackFiles(){
	let opst = Error.prepareStackTrace, thisError, result = [];
	Error.prepareStackTrace = (errStackStr,cssfArr)=>cssfArr;
	thisError = new Error();
	Error.captureStackTrace(thisError,getStackFiles); // https://nodejs.org/api/errors.html#errors_new_error_message
	let cssfArr = thisError.stack;
	Error.prepareStackTrace = opst;
	for(let i=0,l=cssfArr.length; i<l; i++){
		let cssf = cssfArr[i]; // https://github.com/v8/v8/wiki/Stack-Trace-API
		let file = cssf.getFileName();
		if(file===__filename) continue;
		result.push(file);
	}
	return result; 
};

var clientIndex = 0;
const clientsMap = exports.clientsMap = new Map();
const client = exports.requireWorkerClient = function requireWorkerClient(file,options={ ownProcess:false, shareProcess:false, parentModule:false, returnClient:false }){
	if(!_.isString(file)) throw Error("first argument must be a string (require path)");
	if(!_.isObject(options)) throw Error("second argument must be an object (options) or undefined");
	var self = this;
	self.id = 'require-worker:'+(++clientIndex)+':'+_.uniqueId()+':'+Date.now();//+':'+file;
	self.options = options;
	var hostOptions = {
		transport: 'ipcTransport',
		ipcTransportID: self.id
	};
	self.file = file;
	if(path.isAbsolute(file)) hostOptions.file = file;
	else {
		if(options.parentModule && options.parentModule.require) try{ hostOptions.file = options.parentModule.require.resolve(file); }catch(err){}
		if(!hostOptions.file) try{
			var prevStackDir = path.dirname(getStackFiles()[0]);
			try{ // file relative to the directory
				hostOptions.file = require.resolve(path.resolve(prevStackDir,file));
			}catch(err1){
				try{ // file itself (eg, nodejs module), on local require
					hostOptions.file = require.resolve(file);
				}catch(err2){ // fallback to setting cwd of fork
					hostOptions.file = file;
					if(!('forkOptions' in options)) options.forkOptions = {};
					options.forkOptions.cwd = prevStackDir;
					options.ownProcess = true;
				}
			}
		}catch(err){}
		if(!hostOptions.file) hostOptions.file = file;
	}
	if(!options.ownProcess && !options.shareProcess && clientsMap.has(hostOptions.file)){
		var existingClient = clientsMap.get(hostOptions.file);
		if(options.returnClient) return existingClient;
		else return existingClient.proxy;
	}
	self.events = new eventEmitter();
	self.ipcTransport = ipcTransport.create({
		id: self.id
	});
	self.hostOptions = hostOptions;
	var rwPObj = self.rwProcess = rwProcess({ client:self });
	self.ipcTransport.setChild(self.child);
	var rwPTransport = rwPObj.ipcTransport.createMessageEventEmitter();
	rwPTransport.once('processReady!',()=>{
		rwPTransport.send('requireHost',hostOptions);
	});
	rwPTransport.send('processReady?');
	if(!clientsMap.has(file)) clientsMap.set(file,self);
	try{ clientsMap.set(hostOptions.file,self); }catch(err){}
	self.proxyCom = proxyCom.create({
		transport: { type:'ipcTransport', instance:self.ipcTransport },
		requireWorkerClient: self
	});
	self.proxyCom.client = self;
	self.proxyCom.transport.once('requireState',({message,stack}={})=>{
		if(stack){
			var e = new Error(message);
			e.code = 'REQUIRE_FILE_NOT_FOUND';
			e.stack = stack;
			self.events.emit('error',e); //throw e;
			self._destroy();
		} else {
			self.events.emit('requireSuccess');
			self.events.on('newListener',(eventName,listener)=>{
				if(eventName==='requireSuccess') setImmediate(()=>self.events.emit('requireSuccess'));
			});
		}
	});
	self.proxyCom.transport.once('host._destroy',()=>{
		self._destroy();
	});
	self.proxyCom.connectTransportClient();
	self.proxy = self.proxyCom.createMainProxyInterface();
	clientsMap.set(self.proxy,self);
	if(options.returnClient) return self;
	else return self.proxy;
};

client.prototype = {
	_destroy: function(destroyNow){
		if(this._destroyed || this._destroying) return;
		this._destroying = true;
		this.proxyCom.dataHandler._preDestroy();
		this.proxyCom._preDestroy();
		if(this.proxyCom && this.proxyCom.transport && this.proxyCom.transport.send) this.proxyCom.transport.send('client._destroy'); // After preDestroy
		setImmediate(()=>{
			if(clientsMap.has(this.proxy) && clientsMap.get(this.proxy)===this) clientsMap.delete(this.proxy);
			if(clientsMap.has(this.file) && clientsMap.get(this.file)===this) clientsMap.delete(this.file);
			if(clientsMap.has(this.hostOptions.file) && clientsMap.get(this.hostOptions.file)===this) clientsMap.delete(this.hostOptions.file);
			var proxyCom = this.proxyCom;
			this.events.removeAllListeners();
			this.proxyCom._destroy();
			if(this.rwProcess){
				var removedObjects = [];
				for(var [key,obj] of rwProcessMap){
					if(key!==obj.child && (key===this || obj.client===this)){
						if(removedObjects.indexOf(obj.child)===-1) removedObjects.push(obj);
						rwProcessMap.delete(key);
					}
				}
				var hasChilds = [];
				for(var [key,obj] of rwProcessMap){
					if(key!==obj.child) hasChilds.push(obj.child);
				}
				for(var i=0,l=removedObjects.length; i<l; i++){
					let obj = removedObjects[i];
					if(hasChilds.indexOf(obj.child)===-1){
						if(rwProcessMap.has(obj.child)) rwProcessMap.delete(obj.child);
						if(obj.ipcTransport) obj.ipcTransport._destroy();
						obj.child.unref();
						obj.child.kill();
						delete obj.child;
						delete obj.ipcTransport;
					}
				}
			}
			for(var key in ['events','ipcTransport','proxyCom','proxy','child','rwProcess']){
				try{ delete this[key]; }catch(err){}
			}
			this.setChildReferenced = ()=>{
				var err = Error("requireWorker client has been destroyed");
				err.code = 'DESTROYED';
				throw err;
			};
			proxyCom.proxyInterfaceGet = function(){
				var err = Error("requireWorker client has been destroyed, proxy methods are not available");
				err.code = 'DESTROYED';
				throw err;
			};
			this._destroyed = true;
		});
	},
	setChildReferenced: function(bool){
		if(bool) this.child.ref();
		else this.child.unref();
	},
	preConfiguredProxy: function(options={}){
		return this.proxyCom.createMainProxyInterface({ preConfigure:options });
	}
};

const rwPreparedProcessMap = new Map();
exports.getPreparedProcessesCount = ()=>{
	return rwPreparedProcessMap.size;
};
exports.prepareProcesses = (options={ count:1, forkOptions:{} })=>{
	for(var i=0,l=options.count; i<l; i++){
		var rwPObj = rwCreateProcess(_.omit(options,['count']));
		rwPObj.preparedProcess = true;
		rwPreparedProcessMap.set(rwPObj.child,rwPObj);
	}
	return true;
};
exports.destroyPreparedProcesses = ()=>{
	for(var [key,obj] of rwPreparedProcessMap){
		obj.child.unref();
		obj.child.kill();
		rwPreparedProcessMap.delete(key);
	}
	return true;
};
var rwProcessIndex = 0;
const rwCreateProcess = (options={ forkOptions:{} })=>{
	var rwPObj = { id:'require-worker:process:'+(++rwProcessIndex)+':'+Date.now() };
	rwPObj.ipcTransport = ipcTransport.create({ id:rwPObj.id });
	if(!('forkOptions' in options)) options.forkOptions = {};
	if(!('cwd' in options.forkOptions)) options.forkOptions.cwd = process.cwd();
	//var processArgv = _.clone(process.execArgv);
	//if(process.execArgv.indexOf('--inspect')!==-1) process.execArgv.splice(process.execArgv.indexOf('--inspect'),1);
	rwPObj.child = childProcess.fork(__filename,['--rwProcess',rwPObj.id],options.forkOptions);
	//process.execArgv = processArgv;
	rwPObj.ipcTransport.setChild(rwPObj.child);
	return rwPObj;
};

const rwProcessMap = new Map();
const rwProcess = (options={})=>{
	var client = options.client;
	var ownProcess = !!client.options.ownProcess;
	var shareProcess = client.options.shareProcess;
	if(!client) return Promise.reject();
	var createNewProcess = (rwProcessMap.size===0 || ownProcess);
	var useExistingObj = null;
	if(!createNewProcess){
		createNewProcess = true;
		for(var [key,obj] of rwProcessMap){
			if(shareProcess && (shareProcess===obj.client || shareProcess===obj.client.proxy || shareProcess===key)){
				createNewProcess = false;
				useExistingObj = obj;
				break;
			}
			if(!shareProcess && !obj.ownProcess){
				createNewProcess = false;
				useExistingObj = obj;
				break;
			}
		}
		if(shareProcess && !useExistingObj) throw Error("Existing require-worker process could not be found, set shareProcess to a client object, client proxy, or a process child");
	}
	if(createNewProcess){
		var rwPObj, preparedProcess = false;
		if(!('forkOptions' in client.options)) client.options.forkOptions = {};
		if(!('cwd' in client.options.forkOptions)){
			for(var [key,obj] of rwPreparedProcessMap){
				if(obj.preparedProcess && !preparedProcess){
					preparedProcess = obj;
					rwPreparedProcessMap.delete(key);
					break;
				}
			}
		}
		if(preparedProcess) rwPObj = preparedProcess;
		else rwPObj = rwCreateProcess({ forkOptions:client.options.forkOptions });
		rwPObj.ownProcess = ownProcess;
		rwPObj.client = client;
		client.child = rwPObj.child;
		rwProcessMap.set(rwPObj.child,rwPObj);
		rwProcessMap.set(client,rwPObj);
		return rwPObj;
	} else {
		var rwPObj = _.clone(useExistingObj);
		rwPObj.client = client;
		client.child = rwPObj.child;
		rwProcessMap.set(client,rwPObj);
		return rwPObj;
	}
};

const checkNewProcess = ()=>{
	if(require.main===module && process.argv.length===4 && process.argv[2]==='--rwProcess'){
		var ipcTransportID = process.argv[3];
		var transport = ipcTransport.create({
			id: ipcTransportID,
			parent: true
		});
		var transportEvents = transport.createMessageEventEmitter();
		transportEvents.on('processReady?',()=>{
			transportEvents.send('processReady!');
		});
		transportEvents.on('requireHost',(hostOptions)=>{
			new host(hostOptions);
		});
		transportEvents.send('processReady!');
	}
};

const hostsMap = new Map();
const host = exports.requireWorkerHost = function requireWorkerHost({ transport, ipcTransportID, file }){
	var self = this;
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
	self.proxyCom.transport.once('client._destroy',()=>{
		this._destroy();
	});
	self.proxyCom.connectTransportHost(()=>{
		if(requireError){
			self.proxyCom.transport.send("requireState",_.pick(requireError,['message','stack']));
		} else {
			self.proxyCom.transport.send("requireState");
			self.proxyCom.setProxyTarget(self.exports);
		}
	});
	try{
		self.file = require.resolve(file);
		hostsMap.set(require.resolve(file),self);
	}catch(err){}
	try{
		self.exports = require(file);
		hostsMap.set(self.exports,self);
	}catch(err){
		requireError = err;
	}
	return this;
};

host.prototype = {
	_destroy: function(destroyNow){
		if(this._destroyed || this._destroying) return;
		this._destroying = true;
		this.proxyCom.dataHandler._preDestroy();
		this.proxyCom._preDestroy();
		if(this.proxyCom && this.proxyCom.transport && this.proxyCom.transport.send) this.proxyCom.transport.send('host._destroy'); // after preDestroy
		setImmediate(()=>{
			if(hostsMap.has(this.exports) && clientsMap.get(this.exports)===this) clientsMap.delete(this.exports);
			if(this.file && clientsMap.has(this.file) && clientsMap.get(this.file)===this) clientsMap.delete(this.file);
			var proxyCom = this.proxyCom;
			this.events.removeAllListeners();
			this.proxyCom._destroy(true);
			for(var key in ['events','ipcTransport','proxyCom','exports']){
				try{ delete this[key]; }catch(err){}
			}
			this._destroyed = true;
		});
	}
};

checkNewProcess();
