/* global exports, Promise */
"use strict";

const eventEmitter = require('events');
const _ = require('./underscore-with-mixins');
const promisify = require('util').promisify;

exports.create = (...args)=>{
	return new dataHandler(...args);
};

// Alternative is to do: try{ return _.isEqual(JSON.parse(JSON.stringify(obj)),obj); }catch(err){return false;}
const deepObjectValueCheck = (...obj)=>{
	for (var i = 0, l = obj.length; i < l; i++) {
		if (_.isArray(obj[i])) {
			for (var j = 0, k = obj[i].length; j < k; j++) {
				var val = obj[i][j];
				if (_.isConstructed(val) || _.isFunction(val) || _.isDate(val) || _.isPromise(val)) return false;
				if ((_.isArray(val) || _.isObject(val)) && !deepObjectValueCheck(val)) return false;
			}
		}
		else if (_.isObject(obj[i])) {
			for (var key in obj[i]) {
				var val = obj[i][key];
				if (_.isConstructed(val) || _.isFunction(val) || _.isDate(val) || _.isPromise(val)) return false;
				if ((_.isArray(val) || _.isObject(val)) && !deepObjectValueCheck(val)) return false;
			}
		}
	}
	return true;
};

const createErrorResponse = (code,message)=>({ error: { code, message } });

const actionOperations = {
	propertyGet: 1,
	propertyHas: 2,
	propertyHasOwn: 3,
	propertySet: 4,
	propertyDelete: 5
};

const targetMethods = {
	valueSafe: 1,
	valueNaN: 2,
	valueDate: 3,
	valueRegex: 4,
	'function': 5,
	promisifyFunction: 6,
	promise: 7,
	objectProperties: 8,
	objectPath: 9,
	miscObject: 10,
	eventEmitter: 11
};

const dataHandler = exports.dataHandler = class dataHandler {
	
	constructor(proxyCom) {
		this.proxyCom = proxyCom;
		this.proxyTargetActionMap = new Map();
	};
	
	_preDestroy() {
		if (this._preDestroyed) return;
		if (this.proxyTargetActionMap) {
			for (var [key, handleData] of this.proxyTargetActionMap) {
				if (!handleData.actionData.sentMainReply) try { this.sendActionResponse(handleData.actionData, createErrorResponse('DESTROYED',"requireWorker host dataHandler has been destroyed")); } catch (err) {}
			}
		}
		this.proxyTargetAction = ()=>{}; // Silently ignore this
		this._preDestroyed = true;
	}
	
	_destroy() {
		if (this._destroyed || this._destroying) return;
		this._destroying = true;
		this._preDestroy();
		setImmediate(()=>{
			for (var key in ['proxyCom']) {
				try { delete this[key]; } catch (err) {}
			}
			this._destroyed = true;
		});
	}
	
	onProxyAction(actionData) {
		var handleData = { actionData };
		this.proxyTargetActionMap.set(actionData.returnEventName, handleData);
		this.resolveActionTarget(handleData)
		.then(()=>this.decideActionOperation(handleData))
		.then(()=>this.actionOperationController(handleData))
		.then((resultObj)=>{
			if (resultObj === false) return;
			else if ('type' in resultObj) this.sendActionResponse(actionData, resultObj);
			else return Promise.reject(createErrorResponse('INVALID_ACTION',"Failed to perform action on proxy target"));
		})
		.catch((errorObj)=>{
			if (errorObj === false) return;
			else this.sendActionResponse(actionData, errorObj);
		});
	}
	
	resolveActionTarget(handleData) {
		var p = new Promise((resolve, reject)=>{
			if (handleData.actionData.interfaceID === 0) {
				this.proxyCom.proxyTargetReadyPromise.then(()=>{
					handleData.target = this.proxyCom.proxyTarget;
					resolve();
				}, ()=>{
					reject(createErrorResponse('NO_MAIN_PROXY_TARGET',"No main proxy target?"));
				});
			} else {
				reject(createErrorResponse('NOT_YET_IMPLEMENTED',"Different interfaces feature not yet implemented"));
			}
		});
		return p;
	}
	
	sendActionResponse(actionData, resultObj) {
		if (this.proxyTargetActionMap.has(actionData.returnEventName)) this.proxyTargetActionMap.delete(actionData.returnEventName);
		if (actionData.sentMainReply) return;
		actionData.sentMainReply = true;
		this.proxyCom.transport.send(actionData.returnEventName, resultObj);
	}
	
	decideActionOperation(handleData) {
		var { actionData, target } = handleData;
		var { property, newOperator, actionConfig } = actionData;
		var targetItself = (property === null);
		var targetPropertyExists = !targetItself && !!(property in target);
		var targetPropertyIsFunction = targetPropertyExists && _.isFunction(target[property]);
		// Default Operator
		var operation = actionOperations.propertyGet;
		// Delete Property
		if ('deleteProperty' in actionConfig && actionConfig.deleteProperty) {
			operation = actionOperations.propertyDelete;
		}
		// Has Own Property
		else if (_.has(actionConfig, 'hasOwnProperty') && actionConfig.hasOwnProperty) {
			operation = actionOperations.propertyHasOwn;
		}
		// Has Property
		else if (_.has(actionConfig, 'hasProperty') && actionConfig.hasProperty) {
			operation = actionOperations.propertyHas;
		}
		// Set Property
		else if ('setProperty' in actionConfig && actionConfig.setProperty) {
			operation = actionOperations.propertySet;
		}
		// Set Property Via New Operator (if property on target does not exist)
		else if (newOperator && !targetPropertyExists) {
			operation = actionOperations.propertySet;
		}
		// Limit options on target itself
		else if (!newOperator && targetItself) {
			return Promise.reject(createErrorResponse('INVALID_TARGET',"proxyTarget itself can not be called"));
		}
		// Error if property does not exist on target
		else if (!targetPropertyExists) {
			return Promise.reject(createErrorResponse('PROPERTY_NOT_FOUND',"Property '" + property + "' does not exist on proxyTarget"));
		}
		// Set Property Via New Operator (if property on target is not a function)
		else if (newOperator && !targetPropertyIsFunction) {
			operation = actionOperations.propertySet;
		}
		handleData.actionOperation = operation;
	}
	
	actionOperationController(handleData){
		var { actionData, target, actionOperation } = handleData;
		var { property, args } = actionData;
		var targetItself = (property === null);
		var targetPropertyExists = !targetItself && !!(property in target);
		// Operations
		switch (actionOperation) {
			// Get Property
			case actionOperations.propertyGet:
				return this.handleActionTarget(handleData);
			// Has Property
			case actionOperations.propertyHas:
				return Promise.resolve({ type: 'value', result: targetPropertyExists });
			// Has Own Property
			case actionOperations.propertyHasOwn:
				let result = target.hasOwnProperty(property);
				return Promise.resolve({ type: 'value', result: result });
			// Set Property
			case actionOperations.propertySet:
				if (targetItself) {
					return Promise.reject(createErrorResponse('INVALID_TARGET',"proxyTarget itself can not be set to a value"));
				} else {
					// todo: parse special argument(s) and create a function callback, interface, etc?
					target[property] = (args.length > 1 ? args : args[0]);
					return Promise.resolve({type: 'value', result: true});
				}
			// Delete Property
			case actionOperations.propertyDelete:
				try {
					var deleted = delete target[property];
					return Promise.resolve({ type: 'value', result: (deleted!==false) });
				} catch (err) {
					return Promise.reject(createErrorResponse('FAILED_DELETE',err.message));
				}
			// Other
			default:
				return Promise.reject(createErrorResponse('NO_OPERATION',"No operation can be done for this target"));
		}
	}
	
	handleActionTarget(handleData) {
		var hasResult = ('result' in handleData);
		var { actionData, target, result } = handleData;
		var { property, newOperator, args, actionConfig } = actionData;
		var resultTarget = hasResult ? result : target[property];
		var forceProxy = !!(actionConfig && 'forceProxy' in actionConfig && actionConfig.forceProxy);
		var targetMethod = null;
		// Basic Data Types
		if (resultTarget===null || resultTarget===true || resultTarget===false || resultTarget===void 0) {
			targetMethod = targetMethods.valueSafe;
		}
		else if (_.isNaN(resultTarget)) {
			targetMethod = targetMethods.valueNaN;
		}
		else if(_.isString(resultTarget) || _.isNumber(resultTarget)) {
			targetMethod = targetMethods.valueSafe;
		}
		else if (_.isDate(resultTarget)) {
			targetMethod = targetMethods.valueDate;
		}
		else if (_.isRegExp(resultTarget)) {
			targetMethod = targetMethods.valueRegex;
		}
		// Function
		else if (_.isFunction(resultTarget)) {
			var tryPromisify = !!(actionConfig && 'promisify' in actionConfig && actionConfig.promisify && promisify && promisify.custom);
			if(tryPromisify || (!newOperator && promisify && promisify.custom && resultTarget[promisify.custom])){
				targetMethod = targetMethods.promisifyFunction;
			} else {
				targetMethod = targetMethods.function;
			}
		}
		// Promise
		else if (!forceProxy && _.isPromise(resultTarget)) {
			targetMethod = targetMethods.promise;
		}
		// Event Emitter
		else if (!forceProxy && 'eventEmitter' in actionConfig && actionConfig.eventEmitter && _.isEventEmitter(resultTarget)) {
			targetMethod = targetMethods.eventEmitter;
		}
		// Object
		else if ((_.isObject(resultTarget) || _.isArray(resultTarget)) || forceProxy){
			// Get object properties
			if (args.length>0 && _.isObject(resultTarget)) {
				targetMethod = targetMethods.objectProperties;
			}
			// Get object property via path
			else if (_.isObject(resultTarget) && 'objectPath' in actionConfig && _.isString(actionConfig.objectPath) && actionConfig.objectPath.length>0) {
				targetMethod = targetMethods.objectPath;
			}
			// Object & Proxy Creation
			else {
				targetMethod = targetMethods.miscObject;
			}
		}
		handleData.targetMethod = targetMethod;
		return this.actionTargetController(handleData);
	}
	
	actionTargetController(handleData) {
		var hasResult = ('result' in handleData);
		var { actionData, target, result, targetMethod } = handleData;
		var { returnEventName, interfaceID, actionID, property, newOperator, args, argsConfig, actionConfig } = actionData;
		var resultTarget = hasResult ? result : target[property];
		// Target Methods
		switch (targetMethod) {
			// Promisify Function
			case targetMethods.promisifyFunction:
				handleData.result = promisify(target[property])(...args);
				return this.handleActionTarget(handleData);
			// NaN Value
			case targetMethods.valueNaN:
				return Promise.resolve({type: 'valueNaN'});
			// Safe Value
			case targetMethods.valueSafe:
				return Promise.resolve({type: 'value', result: resultTarget});
			// Date Value
			case targetMethods.valueDate:
				return Promise.resolve({type: 'valueDate', result: resultTarget.toISOString()});
			// Regex Value
			case targetMethods.valueRegex:
				return Promise.resolve({type: 'valueRegex', result: {source: resultTarget.source, flags: resultTarget.flags}});
			// Function
			case targetMethods.function:
				if (!hasResult){
					// Handle arguments
					_.each(argsConfig,(config,i)=>{
						if(config.type==='function'){
							args[i] = (...funcArgs)=>{
								this.proxyCom.transport.send(config.returnEventName, funcArgs);
							}
						}
					});
					// Call function
					let r;
					if (newOperator) r = new target[property](...args);
					else r = target[property](...args);
					handleData.result = r;
					return this.handleActionTarget(handleData);
				} else {
					// create function callback
					return Promise.reject(createErrorResponse('NOT_YET_IMPLEMENTED',"Function callback feature not yet implemented"));
				}
			// Promise
			case targetMethods.promise:
				new Promise((resolve, reject)=>{
					var checkVal = {}; // todo: change to symbol
					Promise.race([resultTarget, Promise.resolve(checkVal)]).then((value)=>{
						if (value === checkVal) resolve();
						else reject({resolve: value});
					}, (value)=>{
						reject({reject: value});
					});
				}).then(()=>{
					return new Promise((resolve, reject)=>{
						resultTarget.then((value)=>{
							reject({resolve: value});
						}, (value)=>{
							reject({reject: value});
						});
					});
				}).catch((promiseResult)=>{
					var resultObj = {type: 'promise'};
					if ('resolve' in promiseResult) {
						resultObj.result = true;
						resultObj.value = promiseResult.resolve;
					}
					if ('reject' in promiseResult) {
						resultObj.result = false;
						resultObj.value = promiseResult.reject;
					}
					// handle resultObj.value
					this.sendActionResponse(actionData, resultObj);
				});
				return false;
			// Event Emitter
			case targetMethods.eventEmitter:
				// create interface to relay events
				return Promise.reject(createErrorResponse('NOT_YET_IMPLEMENTED',"eventEmitter feature not yet implemented"));
			// Handle get object properties
			case targetMethods.objectProperties:
				let r = Object.create(null);
				for (var i = 0, l = args.length; i < l; i++) {
					if (_.has(resultTarget, args[i])) {
						r[args[i]] = resultTarget[args[i]];
					}
				}
				actionData.args = [];
				handleData.result = r;
				return this.handleActionTarget(handleData);
			// Get object property via path
			case targetMethods.objectPath:
				var path = actionConfig.objectPath; // eg: some.path.to[some.thing].which().should.work.fine
				return Promise.reject(createErrorResponse('NOT_YET_IMPLEMENTED',"objectPath feature not yet implemented"));
			// Object & Proxy Creation
			case targetMethods.miscObject:
				// todo: deep search through object: if any value is a function, instance of a function, promise, and etc, create interface, otherwise just return the object
				var isSafe = false;
				var forceProxy = !!(actionConfig && 'forceProxy' in actionConfig && actionConfig.forceProxy);
				if (!forceProxy && (_.isObject(resultTarget) || _.isArray(resultTarget))) {
					try {
						isSafe = deepObjectValueCheck(resultTarget);
					} catch (err) {
						isSafe = false;
					}
				}
				if (!forceProxy && isSafe) {
					return Promise.resolve({type: 'value', result: resultTarget});
				} else {
					// interfaces/proxies should also have isInterface in resultObj
					return Promise.reject(createErrorResponse('NOT_YET_IMPLEMENTED',"Target object proxy interface feature not yet implemented"));
				}
			// Error with unknown data type
			default:
				return Promise.reject(createErrorResponse('UNKNOWN_DATA_TYPE',"typeof = " + (typeof resultTarget)));
		}
	}
	
};
