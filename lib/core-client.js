/* global exports, Promise */
"use strict";

const path = require('path');
const eventEmitter = require('events');

const _ = require('./underscore-with-mixins');
const proxyCom = require('./proxy-communication');
const ipcTransport = require('./ipc-transport');

exports.__filename = __filename;

var requireWorkerObj = null;
exports.setRequireWorker = (obj)=>{
	requireWorkerObj = obj;
};

var clientIndex = 0;
const clientsMap = exports.clientsMap = new Map();

const requireWorkerClient = exports.requireWorkerClient = class requireWorkerClient {
	
	constructor(file, options = { ownProcess:false, shareProcess:null, parentModule:null, returnClient:false, returnClientPromise:false, forkOptions: null }) {
		if (!_.isString(file)) throw Error("first argument must be a string (require path)");
		if (!_.isObject(options)) throw Error("second argument must be an object (options) or undefined");
		var self = this;
		self.requireWorker = requireWorkerObj.exports;
		self.client = self;
		self.id = 'require-worker:' + (++clientIndex) + ':' + _.uniqueId() + ':' + Date.now();//+':'+file;
		self.options = options;
		var hostOptions = {
			transport: 'ipcTransport',
			ipcTransportID: self.id
		};
		self.file = file;
		if (path.isAbsolute(file)) {
			hostOptions.file = file;
		} else {
			if (options.parentModule && options.parentModule.require) {
				try {
					hostOptions.file = options.parentModule.require.resolve(file);
				} catch (err) {}
			}
			if (!hostOptions.file) {
				try {
					var prevStackDir = path.dirname(requireWorkerObj.getStackFiles()[0]);
					try { // file relative to the directory
						hostOptions.file = require.resolve(path.resolve(prevStackDir, file));
					} catch (err1) {
						try { // file itself (eg, nodejs module), on local require
							hostOptions.file = require.resolve(file);
						} catch (err2) { // fallback to setting cwd of fork
							hostOptions.file = file;
							if (!options.forkOptions || !_.isObject(options.forkOptions))
								options.forkOptions = {};
							options.forkOptions.cwd = prevStackDir;
							options.ownProcess = true;
						}
					}
				} catch (err) {}
			}
			if (!hostOptions.file) hostOptions.file = file;
		}
		if (!options.ownProcess && !options.shareProcess && clientsMap.has(hostOptions.file)) {
			var existingClient = clientsMap.get(hostOptions.file);
			if (options.returnClientPromise) return Promise.resolve(existingClient);
			else if (options.returnClient) return existingClient;
			else return existingClient.proxy;
		}
		self.events = new eventEmitter();
		self.ipcTransport = ipcTransport.create({
			id: self.id
		});
		self.hostOptions = hostOptions;
		var rwPObj = self.rwProcess = requireWorkerObj.coreProcessManager.rwProcess({client: self});
		self.ipcTransport.setChild(self.child);
		self.child.once('close',(...args)=>this.events.emit('workerClose',...args));
		self.child.once('disconnect',(...args)=>this.events.emit('workerDisconnect',...args));
		self.child.once('error',(...args)=>this.events.emit('workerError',...args));
		self.child.once('exit',(...args)=>this.events.emit('workerExit',...args));
		var rwPTransport = rwPObj.ipcTransport.createMessageEventEmitter();
		rwPTransport.once('processReady!', ()=>{
			rwPTransport.send('requireHost', hostOptions);
		});
		rwPTransport.send('processReady?');
		if (!clientsMap.has(file)) clientsMap.set(file, self);
		try {
			clientsMap.set(hostOptions.file, self);
		} catch (err) {}
		self.proxyCom = proxyCom.create({
			transport: {type: 'ipcTransport', instance: self.ipcTransport},
			requireWorkerClient: self,
			requireWorker: requireWorkerObj.exports
		});
		self.proxyCom.client = self;
		self.proxyCom.transport.once('requireState', ({message, stack, code} = {})=>{
			if (stack) {
				var e = new Error(message);
				e.code = code || 'REQUIRE_FAILED';
				e.stack = stack;
				self.events.emit('error', e); //throw e;
				self._destroy();
			} else {
				self.events.emit('requireSuccess');
				self.events.on('newListener', (eventName, listener)=>{
					if (eventName === 'requireSuccess')
						setImmediate(()=>self.events.emit('requireSuccess'));
				});
			}
		});
		self.proxyCom.transport.once('uncaughtException', ({message, stack, code} = {})=>{
			var e = new Error(message);
			e.code = code || 'UNCAUGHT_EXCEPTION';
			e.stack = stack;
			if(self.events.listenerCount('error')===0){
				console.error('requireWorkerHost Uncaught Exception:',e);
			}
			self.events.emit('error', e);
			self._destroy();
		});
		self.proxyCom.transport.once('host._destroy', ()=>{
			self._destroy();
		});
		self.proxyCom.initClientConnectionToHost();
		self.proxy = self.proxyCom.createProxy();
		clientsMap.set(self.proxy, self);
		if (options.returnClientPromise){
			var p = new Promise((resolve,reject)=>{
				self.events.once('requireSuccess',()=>resolve(self));
				self.events.once('error',reject);
			});
			p.client = self;
			return p;
		}
		else return options.returnClient ? self : self.proxy;
	}
	
	_destroy() {
		if (this._destroyed || this._destroying) return;
		this.events.emit('destroy');
		this._destroying = true;
		this.proxyCom.proxyConstructor._preDestroy();
		this.proxyCom.proxyHandler._preDestroy();
		this.proxyCom._preDestroy();
		if (this.proxyCom && this.proxyCom.transport && this.proxyCom.transport.send) this.proxyCom.transport.send('client._destroy'); // After preDestroy
		setImmediate(()=>{
			if (clientsMap.has(this.proxy) && clientsMap.get(this.proxy) === this)
				clientsMap.delete(this.proxy);
			if (clientsMap.has(this.file) && clientsMap.get(this.file) === this)
				clientsMap.delete(this.file);
			if (clientsMap.has(this.hostOptions.file) && clientsMap.get(this.hostOptions.file) === this)
				clientsMap.delete(this.hostOptions.file);
			var proxyCom = this.proxyCom;
			this.events.removeAllListeners();
			this.proxyCom._destroy();
			if (this.rwProcess) {
				var removedObjects = [];
				for (var [key, obj] of requireWorkerObj.coreProcessManager.processMap) {
					if (key !== obj.child && (key === this || obj.client === this)) {
						if (removedObjects.indexOf(obj.child) === -1)
							removedObjects.push(obj);
						requireWorkerObj.coreProcessManager.processMap.delete(key);
					}
				}
				var hasChilds = [];
				for (var [key, obj] of requireWorkerObj.coreProcessManager.processMap) {
					if (key !== obj.child)
						hasChilds.push(obj.child);
				}
				for (var i = 0, l = removedObjects.length; i < l; i++) {
					let obj = removedObjects[i];
					if (hasChilds.indexOf(obj.child) === -1) {
						if (requireWorkerObj.coreProcessManager.processMap.has(obj.child))
							requireWorkerObj.coreProcessManager.processMap.delete(obj.child);
						if (obj.ipcTransport)
							obj.ipcTransport._destroy();
						obj.child.unref();
						obj.child.kill();
						obj.child = void 0;
						obj.ipcTransport = void 0;
					}
				}
			}
			for (var key in ['events', 'ipcTransport', 'proxyCom', 'proxy', 'child', 'rwProcess']) {
				try { this[key] = void 0; } catch (err) {}
			}
			this.setChildReferenced = ()=>{
				var err = Error("requireWorker client has been destroyed");
				err.code = 'DESTROYED';
				throw err;
			};
			proxyCom._proxyTargetConstructor = function () {
				var err = Error("requireWorker client has been destroyed, proxy methods are not available");
				err.code = 'DESTROYED';
				throw err;
			};
			this._destroyed = true;
		});
	}
	
	setChildReferenced(bool) {
		if (bool) this.child.ref();
		else this.child.unref();
	}
	
	preConfiguredProxy(options = {}){
		return this.proxyCom.createProxy({preConfigure: options});
	}
	
	isClientProxy(...args) {
		for (var i = 0, l = args.length; i < l; i++) {
			var a = args[i];
			if (!_.isObject(a) || !('constructor' in a)) return false;
			var c = a.constructor;
			if (!_.isFunction(c) || !('name' in c) || c.name !== this.proxy.constructor.name) return false;
			if (!('client' in c)) return false;
			if (c.client !== this) return false;
		}
		return true;
	}
	
	destroy() {
		this._destroy();
	}
	
};

exports.preConfiguredProxy = (target, options)=>{
	var proxyInterface = null, client = null;
	var targetIsProxy = false;
	if (_.isObject(target) && 'constructor' in target && 'client' in target.constructor && target.constructor.client instanceof exports.requireWorkerClient)
		targetIsProxy = true;
	if (!targetIsProxy && _.isObject(target) && 'proxyInterface' in target && 'client' in target) {
		proxyInterface = target.proxyInterface;
		client = target.client;
	} else {
		var targetIsPromise = !targetIsProxy && _.isPromise(target);
		for (var [key, val] of clientsMap) {
			if ('proxyCom' in val && 'proxyMap' in val.proxyCom) {
				if (val.proxyCom.proxyMap.has(target)) {
					proxyInterface = val.proxyCom.proxyMap.get(target);
					client = val;
					break;
				} else if (targetIsPromise) {
					for (var [key2, val2] of val.proxyCom.proxyMap) {
						if ('promiseMap' in val2) {
							if (val2.promiseMap.has(target)) {
								proxyInterface = val2; break;
							}
						}
					}
					if (proxyInterface) {
						client = val;
						break;
					}
				}
			}
		}
	}
	if (!proxyInterface || !client) throw Error("Target not found");
	return client.proxyCom.createProxy(_.extend(_.extend({}, proxyInterface.options), {preConfigure: _.extend({},options)}));
};
