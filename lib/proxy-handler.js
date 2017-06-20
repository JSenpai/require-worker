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
		var {returnEventName} = actionData;
		var handleData = {actionData};
		this.proxyTargetActionMap.set(returnEventName, handleData);
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
		var {interfaceID} = handleData.actionData;
		var p = new Promise((resolve, reject)=>{
			if (interfaceID === 0) {
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
		var {actionData, target} = handleData;
		var {returnEventName, interfaceID, actionID, property, newOperator, args, actionConfig} = actionData;
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
		var {actionData, target} = handleData;
		var {returnEventName, interfaceID, actionID, property, newOperator, args, actionConfig} = actionData;
		var targetItself = (property === null);
		var targetPropertyExists = !targetItself && !!(property in target);
		// Operations
		switch (handleData.actionOperation) {
			// Get Property
			case actionOperations.propertyGet:
				return this.resolveTarget(handleData);
			break;
			// Has Property
			case actionOperations.propertyHas:
				return Promise.resolve({ type: 'value', result: targetPropertyExists });
			break;
			// Has Own Property
			case actionOperations.propertyHasOwn:
				let result = target.hasOwnProperty(property);
				return Promise.resolve({ type: 'value', result: result });
			break;
			// Set Property
			case actionOperations.propertySet:
				if (targetItself) {
					return Promise.reject(createErrorResponse('INVALID_TARGET',"proxyTarget itself can not be set to a value"));
				} else {
					// todo: parse special argument(s) and create a function callback, interface, etc?
					target[property] = (args.length > 1 ? args : args[0]);
					return Promise.resolve({type: 'value', result: true});
				}
			break;
			// Delete Property
			case actionOperations.propertyDelete:
				try {
					var deleted = delete target[property];
					return Promise.resolve({ type: 'value', result: (deleted!==false) });
				} catch (err) {
					return Promise.reject(createErrorResponse('FAILED_DELETE',err.message));
				}
			break;
			// Other
			default:
				Promise.reject(createErrorResponse('NO_OPERATION',"No operation can be done for this target"));
			break;
		}
	}
	
	resolveTarget(handleData) {
		var hasResult = ('result' in handleData);
		var {actionData, target, result} = handleData;
		var {returnEventName, interfaceID, actionID, property, newOperator, args, actionConfig} = actionData;
		var resultTarget = hasResult ? result : target[property];
		var forceProxy = !!(actionConfig && 'forceProxy' in actionConfig && actionConfig.forceProxy);
		var tryPromisify = !!(actionConfig && 'promisify' in actionConfig && actionConfig.promisify && promisify && promisify.custom);
		// Promisify function
		if(!hasResult && _.isFunction(resultTarget) && (tryPromisify || (!newOperator && promisify && promisify.custom && resultTarget[promisify.custom]))){
			resultTarget = promisify(target[property])(...args);
		}
		// Basic data types
		if (_.isNaN(resultTarget)) {
			return Promise.resolve({type: 'valueNaN'});
		} else if (resultTarget === null || resultTarget === true || resultTarget === false || resultTarget === void 0 || _.isString(resultTarget) || _.isNumber(resultTarget)) {
			return Promise.resolve({type: 'value', result: resultTarget});
		} else if (_.isDate(resultTarget)) {
			return Promise.resolve({type: 'valueDate', result: resultTarget.toISOString()});
		} else if (_.isRegExp(resultTarget)) {
			return Promise.resolve({type: 'valueRegex', result: {source: resultTarget.source, flags: resultTarget.flags}});
		}
		// Handle function call
		else if (!hasResult && _.isFunction(resultTarget)) {
			let r;
			if (newOperator) r = new target[property](...args);
			else r = target[property](...args);
			handleData.result = r;
			return this.resolveTarget(handleData);
		}
		// Handle function result
		else if (!forceProxy && _.isFunction(resultTarget)) {
			// create function callback
			return Promise.reject(createErrorResponse('NOT_YET_IMPLEMENTED',"Function callback feature not yet implemented"));
		// Handle promise
		} else if (!forceProxy && _.isPromise(resultTarget)) {
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
		} else if (!forceProxy && 'eventEmitter' in actionConfig && actionConfig.eventEmitter && _.isEventEmitter(resultTarget)) {
			// create interface to relay events
			return Promise.reject(createErrorResponse('NOT_YET_IMPLEMENTED',"eventEmitter feature not yet implemented"));
		}
		// Handle get object properties
		else if (args.length > 0 && _.isObject(resultTarget)) {
			let r = Object.create(null);
			for (var i = 0, l = args.length; i < l; i++) {
				if (_.has(resultTarget, args[i])) {
					r[args[i]] = resultTarget[args[i]];
				}
			}
			actionData.args = [];
			handleData.result = r;
			return this.resolveTarget(handleData);
		}
		// Handle get object objectPath option
		else if (_.isObject(resultTarget) && actionConfig && _.isString(actionConfig.objectPath) && actionConfig.objectPath.length > 0) {
			var path = actionConfig.objectPath; // eg: some.path.to[some.thing].which().should.work.fine
			return Promise.reject(createErrorResponse('NOT_YET_IMPLEMENTED',"objectPath feature not yet implemented"));
		}
		// Handle object and interface creation
		else if (_.isObject(resultTarget) || _.isArray(resultTarget)) {
			// todo: deep search through object: if any value is a function, instance of a function, promise, and etc, create interface, otherwise just return the object
			var isSafe = false;
			if (!forceProxy) {
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
		}
		// Error with unknown data type
		else {
			return Promise.reject(createErrorResponse('UNKNOWN_DATA_TYPE',"typeof = " + (typeof resultTarget)));
		}
	}
	
};
