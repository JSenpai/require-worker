/* global exports, Promise */
"use strict";

const eventEmitter = require('events');
const _ = require('./underscore-with-mixins');

const noOp = ()=>{};

exports.create = (...args)=>{
	return new dataHandler(...args);
};

const dataHandler = exports.dataHandler = function(proxyCom){
	this.proxyCom = proxyCom;
	this.proxyTargetActionMap = new Map();
	return this;
};

dataHandler.prototype = {
	_preDestroy: function(){
		if(this._preDestroyed) return;
		if(this.proxyTargetActionMap){
			for(var [key,handleData] of this.proxyTargetActionMap){
				var { actionData } = handleData;
				if(!actionData.sentMainReply) try{ this.proxyTargetActionReply(actionData,{
					error: { code: 'DESTROYED', message:"requireWorker host dataHandler has been destroyed" }
				}); }catch(err){}
			}
		}
		this.proxyTargetAction = ()=>{}; // Silently ignore this
		this._preDestroyed = true;
	},
	_destroy: function(destroyNow){
		if(this._destroyed || this._destroying) return;
		this._destroying = true;
		this._preDestroy();
		setImmediate(()=>{
			for(var key in ['proxyCom']){
				try{ delete this[key]; }catch(err){}
			}
			this._destroyed = true;
		});
	},
	proxyInterfaceHandleResult: function(promiseObj,actionData,resultObj){
		var { resolve, reject } = promiseObj;
		var { error, type, result } = resultObj;
		if(actionData.handledResult) return;
		actionData.handledResult = true;
		if(actionData.actionConfig && actionData.actionConfig.returnKey){
			resolve = (obj)=>{
				if(actionData.actionConfig.returnKey in obj) promiseObj.resolve(obj[actionData.actionConfig.returnKey]);
				else promiseObj.resolve(void 0);
			};
		}
		if(error){
			var errorResult = this.proxyInterfaceHandleResultError(promiseObj,error);
			if(actionData.actionConfig && actionData.actionConfig.resolveError){
				return resolve({ error:errorResult });
			} else {
				return reject(errorResult);
			}
		}
		if(type==='value') return resolve({ type:'value', value:result });
		else if(type==='valueDate') return resolve({ type:'value', value:new Date(result) });
		else if(type==='valueRegex') return resolve({ type:'value', value:new RegExp(result.source,result.flags) });
		else if(type==='valueNaN') return resolve({ type:'value', value:global.NaN });
		else reject(Error("Invalid result type"));
	},
	proxyInterfaceHandleResultError: function(promiseObj,error){
		var errObj = Error('message' in error?error.message:error);
		delete errObj.stack;
		_.extend(errObj,_.omit(error,['message']));
		return errObj;
	},
	proxyTargetActionReply: function(actionData,resultObj){
		if(this.proxyTargetActionMap.has(actionData.returnEventName)) this.proxyTargetActionMap.delete(actionData.returnEventName);
		if(actionData.sentMainReply) return;
		actionData.sentMainReply = true;
		this.proxyCom.transport.send(actionData.returnEventName,resultObj);
	},
	proxyTargetAction: function(actionData){
		var { returnEventName } = actionData;
		var handleData = { actionData };
		this.proxyTargetActionMap.set(returnEventName,handleData);
		this.actionResolveTarget(handleData)
		.then((resultObj)=>{
			if('type' in resultObj) this.proxyTargetActionReply(actionData,resultObj);
			else return Promise.reject({ error: { code: 'INVALID_ACTION', message:"Failed to perform action on proxy target" } });
		})
		.catch((errorObj)=>{
			this.proxyTargetActionReply(actionData,errorObj);
		});
	},
	actionResolveTarget: function(handleData){
		var { interfaceID } = handleData.actionData, self = this;
		var p = new Promise((resolve,reject)=>{
			if(interfaceID===0){
				self.proxyCom.proxyTargetReadyPromise.then(()=>{
					handleData.target = self.proxyCom.proxyTarget;
					resolve();
				},()=>{
					reject({ error: { code: 'NO_MAIN_PROXY_TARGET', message:"No main proxy target?" } });
				});
			} else {
				reject({ error: { code: 'NOT_YET_IMPLEMENTED', message:"Different interfaces feature not yet implemented" } });
			}
		});
		return p.then(()=>this.actionHandleOperation(handleData));
	},
	actionHandleOperation: function(handleData){
		var { actionData, target } = handleData;
		var { returnEventName, interfaceID, actionID, property, newOperator, args, actionConfig } = actionData;
		var targetItself = (property===null);
		var targetPropertyExists = !targetItself && !!(property in target);
		var targetPropertyIsFunction = targetPropertyExists && _.isFunction(target[property]);
		// Delete Property
		if('deleteProperty' in actionConfig && actionConfig.deleteProperty){
			try{
				delete target[property];
				return Promise.resolve({ type:'value', result:true });
			}catch(err){
				return Promise.reject({ error:{ code:'FAILED_DELETE', message:err.message } });
			}
		}
		// Has Own Property
		else if(_.has(actionConfig,'hasOwnProperty') && actionConfig.hasOwnProperty){
			let result = target.hasOwnProperty(property);
			return Promise.resolve({ type:'value', result:result });
		}
		// Has Property
		else if(_.has(actionConfig,'hasProperty') && actionConfig.hasProperty){
			return Promise.resolve({ type:'value', result:targetPropertyExists });
		}
		// Set Property
		else if('setProperty' in actionConfig && actionConfig.setProperty){
			if(targetItself){
				return Promise.reject({ error: { code: 'INVALID_TARGET', message:"proxyTarget itself can not be set to a value" } });
			} else {
				// todo: parse special argument(s) and create a function callback, interface, etc?
				target[property] = (args.length>1?args:args[0]);
				return Promise.resolve({ type:'value', result:true });
			}
		}
		// Set Property Via New Operator (if property on target does not exist)
		else if(newOperator && !targetPropertyExists){
			actionData.actionConfig = { setProperty:true };
			return this.actionHandleOperation(handleData);
		}
		// Limit options on target itself
		else if(!newOperator && targetItself){
			return Promise.reject({ error: { code: 'INVALID_TARGET', message:"proxyTarget itself can not be called" } });
			//return Promise.reject({ error: { code: 'NOT_YET_IMPLEMENTED', message:"Normal calls to proxyTarget itself, are not yet implemented" } });
		}
		// Error if property does not exist on target
		else if(!targetPropertyExists){
			return Promise.reject({ error: { code: 'PROPERTY_NOT_FOUND', message:"Property '"+property+"' does not exist on proxyTarget" } });
		}
		// Set Property Via New Operator (if property on target is not a function)
		else if(newOperator && !targetPropertyIsFunction){
			actionData.actionConfig = { setProperty:true };
			return this.actionHandleOperation(handleData);
		}
		// Get
		else {
			return this.actionHandleDataType(handleData);
		}
	},
	actionHandleDataType: function(handleData){
		var hasResult = ('result' in handleData);
		var { actionData, target, result } = handleData;
		var { returnEventName, interfaceID, actionID, property, newOperator, args, actionConfig } = actionData;
		var resultTarget = hasResult ? result : target[property];
		// Basic data types
		if(_.isNaN(resultTarget)){
			return Promise.resolve({ type:'valueNaN' });
		}
		else if(resultTarget===null || resultTarget===true || resultTarget===false || resultTarget===void 0 || _.isString(resultTarget) || _.isNumber(resultTarget)){
			return Promise.resolve({ type:'value', result:resultTarget });
		}
		else if(_.isDate(resultTarget)){
			return Promise.resolve({ type:'valueDate', result:resultTarget.toISOString() });
		}
		else if(_.isRegExp(resultTarget)){
			return Promise.resolve({ type:'valueRegex', result:{ source:resultTarget.source, flags:resultTarget.flags } });
		}
		// Handle function call
		else if(!hasResult && _.isFunction(resultTarget)){
			let r;
			if(newOperator) r = new target[property](...args);
			else r = target[property](...args);
			handleData.result = r;
			return this.actionHandleDataType(handleData);
		}
		// Handle function result
		else if(_.isFunction(resultTarget)){
			// create function callback
			return Promise.reject({ error: { code: 'NOT_YET_IMPLEMENTED', message:"Function callback feature not yet implemented" } });
		}
		else if(_.isPromise(resultTarget)){
			// similar to function callback, but promise resolve/reject with handled argument
			return Promise.reject({ error: { code: 'NOT_YET_IMPLEMENTED', message:"Promise feature not yet implemented" } });
		}
		// Handle get object properties
		else if(args.length>0 && _.isObject(resultTarget)){
			let r = Object.create(null);
			for(var i=0,l=args.length; i<l; i++){
				if(_.has(resultTarget,args[i])){
					r[args[i]] = resultTarget[args[i]];
				}
			}
			actionData.args = [];
			handleData.result = r;
			return this.actionHandleDataType(handleData);
		}
		// Handle object and instance creation
		else if(_.isObject(resultTarget)){
			// todo: deep search through object: if any value is a function, instance of a function, promise, and etc, create instance, otherwise just return the object
			return Promise.reject({ error: { code: 'NOT_YET_IMPLEMENTED', message:"Target object proxy interface feature not yet implemented" } });
		}
		// Error with unknown data type
		else{
			return Promise.reject({ error: { code: 'UNKNOWN_DATA_TYPE', message:"typeof = "+(typeof resultTarget) } });
		}
	},
	//actionCreateArgumentFunctionCallbackInterface: function(){}, // need a dataHandler method to parse through proxyCom.proxyInterfaceGetPromiseAction actionData.args before sending over transport. Have recursive parsing? or whitelist what's allowed? (maybe for now)
	actionCreateFunctionCallbackInterface: function(){},
	actionCreatePromiseInterface: function(){},
	actionCreateObjectInterface: function(){}
};
