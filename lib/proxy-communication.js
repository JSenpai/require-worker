/* global exports, Promise */
"use strict";

const eventEmitter = require('events');
const _ = require('./underscore-with-mixins');
const dataHandler = require('./proxy-data-handler');

const noOp = ()=>{};
const frozenNullObject = Object.freeze(Object.create(null));

exports.create = (...args)=>{
	return new proxyCom(...args);
};

const proxyHandlerDefaults = {
	
	set(target, property, value, receiver) {
		var err = Error("Use requireWorker(module).property(newValue).configure({ setProperty:true })");
		err.code = "INVALID_OPERATION";
		throw err;
	},
	
	has(target, property) {
		if (property === 'constructor') return true;
		if (property === 'prototype') return true;
		else return false;
	},
	
	deleteProperty(target, property) {
		var err = Error("Use requireWorker(module).property().configure({ deleteProperty:true })");
		err.code = "INVALID_OPERATION";
		throw err;
	},
	
	defineProperty(target, property, descriptor) {
		var err = Error("Use requireWorker(module).property().configure({ deleteProperty:true })");
		err.code = "INVALID_OPERATION";
		throw err;
	},
	
	ownKeys(target) {
		return ['constructor', 'prototype'];
	},
	
	getPrototypeOf(target) {
		return null;
	},
	
	getOwnPropertyDescriptor(target, property) {
		if (property === 'constructor')
			return {value: frozenNullObject, writable: false, configurable: true, enumerable: false};
		if (property === 'prototype')
			return {value: frozenNullObject, writable: false, configurable: false, enumerable: false};
		return {value: void 0, writable: false, configurable: false, enumerable: false};
	}
	
};

const proxyTargetDefaults = {
	
	prototype: frozenNullObject,
	
	toJSON() {
		return frozenNullObject;
	},
	
	inspect() {
		return frozenNullObject;
	},
	
	valueOf() {
		return this;
	},
	
	toString() {
		return '[object Object]';
	}
	
};

const proxyCom = exports.proxyCom = class proxyCom {
	
	constructor(options = {}) {
		if (!('transport' in options)) throw Error("transport option is required");
		if (options.transport.type !== 'ipcTransport') throw Error("Invalid transport, only ipcTransport is currently implemented");
		if (!('instance' in options.transport)) throw Error("transport instance option is required");
		if ('requireWorkerClient' in options) this.requireWorkerClient = options.requireWorkerClient;
		if ('requireWorkerHost' in options) this.requireWorkerHost = options.requireWorkerHost;
		this.setTransport(options.transport.type, options.transport.instance);
		this.events = new eventEmitter();
		this.proxyMainInterfaceReady = false;
		this.proxyTargetReady = false;
		this.promiseActionID = 0;
		this.proxyMap = new Map();
		this.dataHandler = dataHandler.create(this);
	}
	
	_preDestroy() {
		if (this._preDestroyed) return;
		for (var [key1, proxyInterface] of this.proxyMap) {
			if (proxyInterface.promiseMap) {
				for (var [key2, promiseObj] of proxyInterface.promiseMap) {
					if (promiseObj.reject && !promiseObj.resolved && !promiseObj.rejected) {
						try {
							promiseObj.reject(this.dataHandler.proxyInterfaceHandleResultError({
								code: 'DESTROYED',
								message: "requireWorker client proxyCom has been destroyed"
							}));
						} catch (err) {}
					}
				}
			}
		}
		var destroyError = ()=>{
			var err = Error("proxyCom has been destroyed");
			err.code = 'DESTROYED';
			throw err;
		};
		this.createProxy = this._proxyPromiseAct = destroyError;
		var destroyErrorPromise = ()=>{
			var p = new Promise(destroyError);
			p.configure = ()=>p;
			return p;
		};
		this._proxyTargetConstructor = ()=>destroyErrorPromise;
		this._preDestroyed = true;
	}
	
	_destroy() {
		if (this._destroyed || this._destroying) return;
		this._destroying = true;
		if (this.transport && this.transport.send) this.transport.send('proxyCom._destroy');
		this._preDestroy();
		setImmediate(()=>{
			this.dataHandler._destroy();
			this.events.removeAllListeners();
			if (this.transportType === 'ipcTransport') this.transportInstance._destroy();
			for (var [key1, proxyInterface] of this.proxyMap) {
				if (proxyInterface.promiseMap) proxyInterface.promiseMap.clear();
			}
			this.proxyMap.clear();
			for (var key in ['events', 'proxyMap', 'dataHandler', 'client']) {
				try { delete this[key]; } catch (err) {}
			}
			this._destroyed = true;
		});
	}
	
	setTransport(type, transport) {
		this.transportType = type;
		if (type === 'ipcTransport') {
			this.transportInstance = transport;
			this.transport = transport.createMessageEventEmitter();
			this.transport.once('proxyCom._destroy', ()=>{
				this._destroy();
			});
		}
	}
	
	initClientConnectionToHost(onReady) {
		return this.clientConnectionToHostPromise = new Promise((resolve, reject)=>{
			this.transport.once('isReady!', ()=>this.events.emit('clientConnectionToHost:ready'));
			this.transport.once('isReady?', ()=>this.transport.send('isReady!'));
			this.events.once('clientConnectionToHost:ready', ()=>{
				if (this.proxyMainInterfaceReady) return;
				this.proxyMainInterfaceReady = true;
				this.transport.removeAllListeners('isReady?');
				this.transport.removeAllListeners('isReady!');
				resolve();
			});
			this.transport.send('isReady?');
		});
	}
	
	initHostConnectionToClient() {
		var isReady = false;
		this.transport.once('isReady!', ()=>{
			this.transport.send('isReady!');
			this.transport.removeAllListeners('isReady?');
			this.transport.removeAllListeners('isReady!');
			isReady = true;
			this.events.emit('hostConnectionToClient:connection:ready');
		});
		this.transport.once('isReady?',()=>this.transport.send('isReady!'));
		this.transport.send('isReady?');
		this.transport.on('proxyAction', (...args)=>this.dataHandler.proxyTargetAction(...args));
		this.proxyTargetReadyPromise = new Promise((resolve, reject)=>{
			if (this.proxyTargetReady) return resolve();
			this.events.once('hostConnectionToClient:proxyTarget:ready',resolve);
		});
		return new Promise((resolve,reject)=>{
			if (isReady) return resolve();
			this.events.once('hostConnectionToClient:connection:ready',resolve);
		});
	}
	
	setProxyTarget(target) {
		if (this.proxyTargetReady) return;
		this.proxyTargetReady = true;
		this.proxyTarget = target;
		this.events.emit('hostConnectionToClient:proxyTarget:ready');
	}
	
	createProxy(options = {}){
		return this._createProxyInterface(_.extend(_.deepExtend({}, options), { basePromise: this.clientConnectionToHostPromise }));
	}
	
	_createProxyInterface(options = { id:0 }){
		var proxyInterface = {options, timestamp: Date.now()};
		var proxyHandler = Object.create(proxyHandlerDefaults);
		proxyInterface.promiseMap = new Map();
		proxyHandler.get = (...getArgs)=>this._proxyTargetConstructor({getArgs, proxyInterface, timestamp: Date.now()});
		var self = this;
		proxyInterface.proxyTarget = function (...args) {
			var newOperator = _.isConstructed(this, proxyInterface.proxyTarget);
			return self._proxyTargetConstructor({getArgs: [proxyInterface.proxyTarget, null], funcArgs: args, newOperator, proxyInterface, timestamp: Date.now()});
		};
		Object.assign(proxyInterface.proxyTarget, proxyTargetDefaults);
		Object.defineProperty(proxyInterface.proxyTarget, 'prototype', {value: frozenNullObject, writable: false, configurable: false, enumerable: false});
		proxyInterface.proxy = new Proxy(proxyInterface.proxyTarget, proxyHandler);
		this.proxyMap.set(proxyInterface.proxy, proxyInterface);
		return proxyInterface.proxy;
	}
	
	_proxyTargetConstructor(constructorOptions) {
		var {getArgs: [target, property], funcArgs = [], newOperator = false, proxyInterface} = constructorOptions;
		var self = this;
		if (property === 'constructor') {
			constructorOptions.newOperator = true;
			var boundConstructor = this._proxyTargetConstructor.bind(this, constructorOptions);
			boundConstructor.client = this.client;
			boundConstructor.preConfiguredProxy = this.client.requireWorker.preConfiguredProxy.bind(this.client.requireWorker, {proxyInterface, client: this.client});
			return Object.freeze(boundConstructor);
		}
		if (_.has(target, property)) return target[property];
		if (typeof property === 'symbol') return void 0;
		if (typeof property !== 'string' && property !== null) return void 0;
		var constructorResult = function _proxyTargetConstructorResult(...args) {
			var newOperator2 = !!newOperator;
			if (!newOperator2) newOperator2 = _.isConstructed(this, _proxyTargetConstructorResult);
			var proxyPromise = {constructorOptions, newOperator: newOperator2, property, args, proxyOptions: {}, timestamp: Date.now()};
			if ('preConfigure' in proxyInterface.options && _.isObject(proxyInterface.options.preConfigure))
				_.deepExtend(proxyPromise.proxyOptions, proxyInterface.options.preConfigure);
			proxyPromise.promise = new Promise((resolve2, reject2)=>{
				var resolve = (...rArgs)=>{
					self._endProxyPromise(proxyPromise, {resolve: true});
					resolve2(...rArgs);
				};
				var reject = (...rArgs)=>{
					self._endProxyPromise(proxyPromise, {reject: true});
					reject2(...rArgs);
				};
				proxyPromise.resolve = resolve;
				proxyPromise.reject = reject;
				proxyPromise.resolveReal = resolve2;
				proxyPromise.rejectReal = reject2;
				var action = ()=>self._proxyPromiseAct(proxyPromise);
				if (proxyInterface.options.basePromise) proxyInterface.options.basePromise.then(action);
				else Promise.resolve().then(action);
			});
			proxyInterface.promiseMap.set(proxyPromise.promise, proxyPromise);
			proxyPromise.promise.configure = (...options)=>{
				if (options.length > 0) _.deepExtend(proxyPromise.proxyOptions, ...options);
				return proxyPromise.promise;
			};
			return proxyPromise.promise;
		};
		if (property === null) return constructorResult(...funcArgs);
		else return constructorResult;
	}
	
	_endProxyPromise(proxyPromise, options = {}){
		var proxyInterface = proxyPromise.constructorOptions.proxyInterface;
		if (options.timeout) {
			delete proxyPromise.timeout;
			var timeoutMs = proxyPromise.proxyOptions.timeout > 1 ? proxyPromise.proxyOptions.timeout : 1;
			var rejectError = this.dataHandler.proxyInterfaceHandleResultError({
				code: 'TIMEOUT',
				message: "proxyInterface promise timeout after " + timeoutMs + "ms"
			});
			if (!proxyPromise.resolved && !proxyPromise.rejected) proxyPromise.reject(rejectError); // calls _endProxyPromise again
		} else if (proxyPromise.timeout) {
			clearTimeout(proxyPromise.timeout);
			delete proxyPromise.timeout;
		}
		if (options.resolve) proxyPromise.resolved = true;
		if (options.reject) proxyPromise.rejected = true;
		if ((options.resolve || options.reject) && proxyInterface.promiseMap.has(proxyPromise.promise))
			proxyInterface.promiseMap.delete(proxyPromise.promise);
	}
	
	_proxyPromiseAct_lateConfigureError() {
		var err = Error(".configure must be called straight after promise creation");
		err.code = "LATE_CONFIGURE";
		throw err;
	}
	
	_proxyPromiseAct(proxyPromise) {
		var {constructorOptions: {proxyInterface}, proxyOptions, property, newOperator, args, resolve, reject} = proxyPromise;
		proxyPromise.promise.configure = this._proxyPromiseAct_lateConfigureError;
		var interfaceID = proxyInterface.options.id || 0;
		var actionID = ++this.promiseActionID;
		var returnEventName = 'proxyActionReply:' + interfaceID + ':' + actionID;
		var actionConfig = {};
		if (_.has(proxyOptions,'deleteProperty') && proxyOptions.deleteProperty) actionConfig.deleteProperty = !!proxyOptions.deleteProperty;
		if (_.has(proxyOptions,'setProperty') && proxyOptions.setProperty) actionConfig.setProperty = !!proxyOptions.setProperty;
		if (_.has(proxyOptions,'hasProperty') && proxyOptions.hasProperty) actionConfig.hasProperty = true;
		if (_.has(proxyOptions,'hasOwnProperty') && proxyOptions.hasOwnProperty) actionConfig.hasOwnProperty = true;
		if (_.has(proxyOptions,'resolveError') && proxyOptions.resolveError) actionConfig.resolveError = true;
		if (_.has(proxyOptions,'forceProxy') && proxyOptions.forceProxy) actionConfig.forceProxy = true;
		if (_.has(proxyOptions,'objectPath') && _.isString(proxyOptions.objectPath) && proxyOptions.objectPath.length > 0) actionConfig.objectPath = proxyOptions.objectPath;
		if (_.has(proxyOptions,'returnKey') && _.isString(proxyOptions.returnKey) && proxyOptions.returnKey.length > 0) actionConfig.returnKey = proxyOptions.returnKey;
		if (_.has(proxyOptions,'promiseResult') && proxyOptions.promiseResult) actionConfig.promiseResult = true;
		if (_.has(proxyOptions,'newOperator')) newOperator = !!proxyOptions.newOperator;
		if (_.has(proxyOptions,'timeout')) proxyPromise.timeout = setTimeout(()=>this._endProxyPromise(proxyPromise, {timeout: true}), proxyOptions.timeout > 1 ? proxyOptions.timeout : 1);
		if (_.has(proxyOptions,'eventEmitter') && proxyOptions.eventEmitter) actionConfig.eventEmitter = true;
		//if(_.has(proxyOptions,'promisify') && proxyOptions.promisify) actionConfig.promisify = !!proxyOptions.promisify;
		if (property === null) {
			if (_.has(proxyOptions,'property') && _.isString(proxyOptions.property)) property = proxyOptions.property;
			if (_.has(proxyOptions,'args') && _.isArray(proxyOptions.args)) args = proxyOptions.args;
		}
		_.each(_.pick(actionConfig, ['deleteProperty', 'setProperty', 'hasProperty', 'hasOwnProperty']), (value, key)=>{
			if (value === false) delete actionConfig[key];
		});
		var actionData = {returnEventName, interfaceID, actionID, property, newOperator, args, actionConfig};
		// todo: parse/handle actionData.args (functions, promises, etc)
		this.transport.once(returnEventName, (...args)=>this.dataHandler.proxyInterfaceHandleResult(proxyPromise, actionData, ...args));
		this.transport.send("proxyAction", actionData);
	}
	
};
