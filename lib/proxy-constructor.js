/* global exports, Promise */
"use strict";

const _ = require('./underscore-with-mixins');

exports.create = (...args)=>{
	return new proxyConstructor(...args);
};

const frozenNullObject = Object.freeze(Object.create(null));

const proxyOptionsDefaults = {
	
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

const proxyConstructor = exports.proxyConstructor = class proxyConstructor {
	
	constructor(proxyCom){
		this.proxyCom = proxyCom;
	}
	
	_preDestroy() {
		if (this._preDestroyed) return;
		for (var [key1, proxyInterface] of this.proxyCom.proxyMap) {
			if (proxyInterface.promiseMap) {
				for (var [key2, promiseObj] of proxyInterface.promiseMap) {
					if (promiseObj.reject && !promiseObj.resolved && !promiseObj.rejected) {
						try {
							promiseObj.reject(this.proxyPromiseResult_error({
								code: 'DESTROYED',
								message: "requireWorker client proxy constructor has been destroyed"
							}));
						} catch (err) {}
					}
				}
			}
		}
		var destroyError = ()=>{
			var err = Error("proxy constructor has been destroyed");
			err.code = 'DESTROYED';
			throw err;
		};
		this.proxyPromiseAct = destroyError;
		var destroyErrorPromise = ()=>{
			var p = new Promise(destroyError);
			p.configure = ()=>p;
			return p;
		};
		this.proxyTargetConstructor = ()=>destroyErrorPromise;
		this.preDestroyed = true;
	}
	
	_destroy() {
		if (this._destroyed || this._destroying) return;
		this._destroying = true;
		this._preDestroy();
		setImmediate(()=>{
			for (var [key1, proxyInterface] of this.proxyCom.proxyMap) {
				if (proxyInterface.promiseMap) proxyInterface.promiseMap.clear();
			}
			this.proxyCom.proxyMap.clear();
			this._destroyed = true;
		});
	}
	
	createProxyInterface(options = { id:0 }){
		var proxyInterface = {options, timestamp: Date.now()};
		var proxyOptions = Object.create(proxyOptionsDefaults);
		proxyInterface.promiseMap = new Map();
		proxyOptions.get = (...getArgs)=>this.proxyTargetConstructor({getArgs, proxyInterface, timestamp: Date.now()});
		var self = this;
		proxyInterface.proxyTarget = function (...args) {
			var newOperator = _.isConstructed(this, proxyInterface.proxyTarget);
			return self.proxyTargetConstructor({getArgs: [proxyInterface.proxyTarget, null], funcArgs: args, newOperator, proxyInterface, timestamp: Date.now()});
		};
		Object.assign(proxyInterface.proxyTarget, proxyTargetDefaults);
		Object.defineProperty(proxyInterface.proxyTarget, 'prototype', {value: frozenNullObject, writable: false, configurable: false, enumerable: false});
		proxyInterface.proxy = new Proxy(proxyInterface.proxyTarget, proxyOptions);
		this.proxyCom.proxyMap.set(proxyInterface.proxy, proxyInterface);
		return proxyInterface.proxy;
	}
	
	proxyTargetConstructor(constructorOptions) {
		var {getArgs: [target, property], funcArgs = [], newOperator = false, proxyInterface} = constructorOptions;
		var self = this;
		if (property === 'constructor') {
			//constructorOptions.newOperator = true;
			var boundConstructor = this.proxyTargetConstructor.bind(this, constructorOptions);
			boundConstructor.client = this.proxyCom.client;
			boundConstructor.preConfiguredProxy = boundConstructor.client.requireWorker.preConfiguredProxy.bind(boundConstructor.client.requireWorker, {proxyInterface, client: boundConstructor.client});
			return Object.freeze(boundConstructor);
		}
		if (_.has(target, property)) return target[property];
		if (typeof property === 'symbol') return void 0;
		if (typeof property !== 'string' && property !== null) return void 0;
		var constructorResult = function proxyTargetConstructorResult(...args) {
			var newOperator2 = !!newOperator;
			if (!newOperator2) newOperator2 = _.isConstructed(this, proxyTargetConstructorResult);
			var proxyPromise = { constructorOptions, newOperator: newOperator2, property, args, argsActionID:0, proxyOptions: {}, timestamp: Date.now() };
			if ('preConfigure' in proxyInterface.options && _.isObject(proxyInterface.options.preConfigure))
				_.extend(proxyPromise.proxyOptions, proxyInterface.options.preConfigure);
			proxyPromise.promise = new Promise((resolve2, reject2)=>{
				var resolve = (...rArgs)=>{
					self.endProxyPromise(proxyPromise, {resolve: true});
					resolve2(...rArgs);
				};
				var reject = (...rArgs)=>{
					self.endProxyPromise(proxyPromise, {reject: true});
					reject2(...rArgs);
				};
				proxyPromise.resolve = resolve;
				proxyPromise.reject = reject;
				proxyPromise.resolveReal = resolve2;
				proxyPromise.rejectReal = reject2;
				var action = ()=>self.proxyPromiseAct(proxyPromise);
				if (proxyInterface.options.basePromise) proxyInterface.options.basePromise.then(action);
				else Promise.resolve().then(action);
			});
			proxyInterface.promiseMap.set(proxyPromise.promise, proxyPromise);
			proxyPromise.promise.configure = (...options)=>{
				if (options.length > 0) _.extend(proxyPromise.proxyOptions, ...options);
				return proxyPromise.promise;
			};
			return proxyPromise.promise;
		};
		if (property === null) return constructorResult(...funcArgs);
		else return constructorResult;
	}
	
	endProxyPromise(proxyPromise, options = {}){
		var proxyInterface = proxyPromise.constructorOptions.proxyInterface;
		if (options.timeout) {
			delete proxyPromise.timeout;
			var timeoutMs = proxyPromise.proxyOptions.timeout > 1 ? proxyPromise.proxyOptions.timeout : 1;
			var rejectError = this.proxyPromiseResult_error({
				code: 'TIMEOUT',
				message: "proxyInterface promise timeout after " + timeoutMs + "ms"
			});
			if (!proxyPromise.resolved && !proxyPromise.rejected) proxyPromise.reject(rejectError); // calls endProxyPromise again
		} else if (proxyPromise.timeout) {
			clearTimeout(proxyPromise.timeout);
			delete proxyPromise.timeout;
		}
		if (options.resolve) proxyPromise.resolved = true;
		if (options.reject) proxyPromise.rejected = true;
		if ((options.resolve || options.reject) && proxyInterface.promiseMap.has(proxyPromise.promise))
			proxyInterface.promiseMap.delete(proxyPromise.promise);
	}
	
	proxyPromiseAct_lateConfigureError() {
		var err = Error(".configure must be called straight after promise creation");
		err.code = "LATE_CONFIGURE";
		throw err;
	}
	
	proxyPromiseAct(proxyPromise) {
		var { constructorOptions: {proxyInterface}, proxyOptions, property, newOperator, args, resolve, reject } = proxyPromise;
		proxyPromise.promise.configure = this.proxyPromiseAct_lateConfigureError;
		var interfaceID = proxyInterface.options.id || 0;
		var actionID = ++this.proxyCom.promiseActionID;
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
		if (_.has(proxyOptions,'timeout')) proxyPromise.timeout = setTimeout(()=>this.endProxyPromise(proxyPromise, {timeout: true}), proxyOptions.timeout > 1 ? proxyOptions.timeout : 1);
		if (_.has(proxyOptions,'eventEmitter') && proxyOptions.eventEmitter) actionConfig.eventEmitter = true;
		if (_.has(proxyOptions,'promisify') && proxyOptions.promisify) actionConfig.promisify = !!proxyOptions.promisify;
		if (_.has(proxyOptions,'followPromise') && proxyOptions.followPromise) actionConfig.followPromise = !!proxyOptions.followPromise;
		if (property === null) {
			if (_.has(proxyOptions,'property') && _.isString(proxyOptions.property)) property = proxyOptions.property;
			if (_.has(proxyOptions,'args') && _.isArray(proxyOptions.args)) args = proxyOptions.args;
		}
		_.each(_.pick(actionConfig, ['deleteProperty', 'setProperty', 'hasProperty', 'hasOwnProperty']), (value, key)=>{
			if (value === false) delete actionConfig[key];
		});
		var actionData = { returnEventName, interfaceID, actionID, property, newOperator, args, argsConfig:{}, actionConfig };
		this.handlePromiseArguments(proxyPromise,actionData);
		this.proxyCom.transport.once(returnEventName, (...args)=>this.proxyPromiseResult(proxyPromise, actionData, ...args));
		this.proxyCom.transport.send("proxyAction", actionData);
	}
	
	handlePromiseArguments(proxyPromise,actionData){
		var { proxyOptions } = proxyPromise;
		var { interfaceID, actionID, args, argsConfig } = actionData;
		var callbackLimit = _.has(proxyOptions,'callbackLimit') ? proxyOptions.callbackLimit*1 : 1;
		var callbackTimeout = _.has(proxyOptions,'callbackTimeout') ? proxyOptions.callbackTimeout*1 : 0;
		var callbackStopPromise = _.has(proxyOptions,'callbackStopPromise') && _.isPromise(proxyOptions.callbackStopPromise) && proxyOptions.callbackStopPromise;
		var callbackOnRemove = _.has(proxyOptions,'callbackOnRemove') && _.isFunction(proxyOptions.callbackOnRemove) && (()=>{
			try{ proxyOptions.callbackOnRemove(); }catch(err){};
		});
		args.forEach((arg,i)=>{
			if(_.isFunction(arg)){
				var argumentActionID = proxyPromise.argsActionID++;
				var returnEventName = 'proxyActionArgument:' + interfaceID + ':' + actionID + ':' + argumentActionID;
				args[i] = null;
				argsConfig[i] = { type:'function', returnEventName };
				var onListener = null, onceListener = null;
				var callArg = (funcArgs)=>{
					try{ arg(...funcArgs); }catch(err){}
				};
				var cancelListener = ()=>{
					cancelListener = ()=>{};
					proxyPromise.removeArgumentCallbackListeners();
				};
				this.proxyCom.transport.once(returnEventName+':cancel',cancelListener);
				var removeCancelListener = ()=>{
					removeCancelListener = ()=>{};
					this.proxyCom.transport.removeListener(returnEventName+':cancel',cancelListener);
				};	
				if(callbackLimit>1) {
					var callCount = 0;
					onListener = (...funcArgs)=>{
						if(callCount>callbackLimit) return;
						callCount++;
						callArg(...funcArgs);
						if(callCount>=callbackLimit) proxyPromise.removeArgumentCallbackListeners();
					};
				}
				else if(callbackLimit===0) onListener = callArg;
				else onceListener = (...funcArgs)=>{
					callArg(...funcArgs);
					removeCancelListener();
					if(callbackOnRemove) callbackOnRemove();
				};
				if(onListener!==null) this.proxyCom.transport.on(returnEventName,onListener);
				else if(onceListener!==null) this.proxyCom.transport.once(returnEventName,onceListener);
				var tmr = null;
				proxyPromise.removeArgumentCallbackListeners = ()=>{
					proxyPromise.removeArgumentCallbackListeners = ()=>{};
					if(tmr){ clearTimeout(tmr); tmr = null; }
					if(onListener!==null) this.proxyCom.transport.removeListener(returnEventName,onListener);
					else if(onceListener!==null) this.proxyCom.transport.removeListener(returnEventName,onceListener);
					if(callbackOnRemove) callbackOnRemove();
					removeCancelListener();
				};
				if(callbackTimeout>0){
					tmr = setTimeout(()=>proxyPromise.removeArgumentCallbackListeners(),callbackTimeout);
				}
				if(callbackStopPromise){
					callbackStopPromise.then(()=>proxyPromise.removeArgumentCallbackListeners());
				}
			}
		});
	}
	
	proxyPromiseResult(proxyPromise, actionData, resultObj) {
		var {resolve: resolveOriginal, reject: rejectOriginal} = proxyPromise;
		var { error, type, result } = resultObj;
		if (actionData.handledResult) return;
		actionData.handledResult = true;
		var resolve = (obj)=>this.proxyPromiseResult_parseObject(actionData, obj, resolveOriginal);
		var reject = (obj)=>{
			if('removeArgumentCallbackListeners' in proxyPromise) proxyPromise.removeArgumentCallbackListeners();
			return this.proxyPromiseResult_parseObject(actionData, obj, rejectOriginal);
		};
		if (error) {
			var errorResult = this.proxyPromiseResult_error(error);
			if (actionData.actionConfig && actionData.actionConfig.resolveError) return resolve({error: errorResult});
			else return reject(errorResult);
		}
		if (type === 'value') return resolve({value: result});
		else if (type === 'valueDate') return resolve({value: new Date(result)});
		else if (type === 'valueRegex') return resolve({value: new RegExp(result.source, result.flags)});
		else if (type === 'valueNaN') return resolve({value: global.NaN});
		else if (type === 'promise') {
			if(actionData.actionConfig.followPromise) return result ? resolve({ value: resultObj.value }) : reject(this.proxyPromiseResult_error({ value: resultObj.value }));
			else return resolve({ value: (result ? Promise.resolve(resultObj.value) : Promise.reject(resultObj.value)) });
		}
		else reject(this.proxyPromiseResult_error({code: 'INVALID_RESULT_TYPE', message: "Invalid result type"}));
	}
	
	_proxyPromiseResult_parseObject_promiseGet() {
		if (this.type === 'value') return Promise.resolve(this.value);
		else if (this.type === 'error' && this.errorType === 'resolve') return Promise.resolve(this.error);
		else if (this.type === 'error') return Promise.reject(this.error);
		else return Promise.resolve(this);
	}
	
	proxyPromiseResult_parseObject(actionData, obj, next) {
		if ('error' in obj || obj instanceof Error) obj.type = 'error';
		else if ('value' in obj) obj.type = 'value';
		if (actionData.actionConfig && actionData.actionConfig.resolveError) obj.errorType = 'resolve';
		Object.defineProperty(obj, 'promise', {get: this._proxyPromiseResult_parseObject_promiseGet});
		if (actionData.actionConfig && (actionData.actionConfig.returnKey || actionData.actionConfig.promiseResult)) {
			let key = actionData.actionConfig.promiseResult ? 'promise' : actionData.actionConfig.returnKey;
			if (key in obj) return next(obj[key]);
			else return next(void 0);
		} else {
			return next(obj);
		}
	}
	
	proxyPromiseResult_error(error) {
		var errObj = Error('message' in error ? error.message : ('value' in error ? error.value : error));
		delete errObj.stack;
		_.extend(errObj, _.omit(error, ['message']));
		return errObj;
	}
	
};
