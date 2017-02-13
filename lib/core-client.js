/* global exports, Promise */
"use strict";

const path = require('path');
const eventEmitter = require('events');

const _ = require('./underscore-with-mixins');
const proxyCom = require('./proxy-communication');
const ipcTransport = require('./ipc-transport');

exports.__filename = __filename;

var requireWorkerObj = null;
exports.setRequireWorker = (obj)=>{ requireWorkerObj = obj; };

var clientIndex = 0;
const clientsMap = exports.clientsMap = new Map();
const client = exports.requireWorkerClient = function requireWorkerClient(file,options={ ownProcess:false, shareProcess:false, parentModule:false, returnClient:false }){
	if(!_.isString(file)) throw Error("first argument must be a string (require path)");
	if(!_.isObject(options)) throw Error("second argument must be an object (options) or undefined");
	var self = this;
	self.requireWorker = requireWorkerObj.exports;
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
			var prevStackDir = path.dirname(requireWorkerObj.getStackFiles()[0]);
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
	var rwPObj = self.rwProcess = requireWorkerObj.coreProcessManager.rwProcess({ client:self });
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
		requireWorkerClient: self,
		requireWorker: requireWorkerObj.exports
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
	_destroy: function(){
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
				for(var [key,obj] of requireWorkerObj.rwProcessMap){
					if(key!==obj.child && (key===this || obj.client===this)){
						if(removedObjects.indexOf(obj.child)===-1) removedObjects.push(obj);
						requireWorkerObj.rwProcessMap.delete(key);
					}
				}
				var hasChilds = [];
				for(var [key,obj] of requireWorkerObj.rwProcessMap){
					if(key!==obj.child) hasChilds.push(obj.child);
				}
				for(var i=0,l=removedObjects.length; i<l; i++){
					let obj = removedObjects[i];
					if(hasChilds.indexOf(obj.child)===-1){
						if(requireWorkerObj.rwProcessMap.has(obj.child)) requireWorkerObj.rwProcessMap.delete(obj.child);
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
