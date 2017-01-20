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
			for(var [key,actionData] of this.proxyTargetActionMap){
				if(!actionData.sentMainReply) try{ this.proxyTargetActionReply(actionData,{
					error: { code: 'DESTROYED', message:"requireWorker host dataHandler has been destroyed" }
				}); }catch(err){}
			}
		}
		this._preDestroyed = true;
	},
	_destroy: function(){
		if(this._destroyed) return;
		this._preDestroy();
		for(var key in ['proxyCom']){
			try{ delete this[key]; }catch(err){}
		}
		this.proxyTargetAction = ()=>{ throw Error("dataHandler has been destroyed"); };
		this._destroyed = true;
	},
	proxyInterfaceHandleResult: function(promiseObj,actionData,resultObj){
		var { resolve, reject } = promiseObj;
		var { error, resultType, result } = resultObj;
		if(actionData.handledResult) return;
		actionData.handledResult = true;
		if(error){
			var errorResult = this.proxyInterfaceHandleResultError(promiseObj,error);
			if(actionData.actionConfig && actionData.actionConfig.resolveError){
				return resolve({ error:errorResult });
			} else {
				return reject(errorResult);
			}
		}
		if(resultType==='value') return resolve({ resultType:'value', value:result });
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
		var { returnEventName, interfaceID, actionID, property, newOperator, args, actionConfig } = actionData;
		this.proxyTargetActionMap.set(returnEventName,actionData);
		var basePromise = this.proxyCom.proxyTargetReadyPromise;
		if(interfaceID===0){
			basePromise.then(()=>{
				var proxyTarget = this.proxyCom.proxyTarget;
				var result = null;
				if(actionConfig.deleteProperty){
					try{
						delete proxyTarget[property];
						result = true;
					}catch(err){
						return this.proxyTargetActionReply(actionData,{ error:err });
					}
				}
				else if(_.has(actionConfig,'hasOwnProperty') && actionConfig.hasOwnProperty){
					result = proxyTarget.hasOwnProperty(property);
				}
				else if(_.has(actionConfig,'hasProperty') && actionConfig.hasProperty){
					result = !!(property in proxyTarget);
				}
				else if(actionConfig.setProperty){
					if(property===null) return this.proxyTargetActionReply(actionData,{
						error: { code: 'INVALID_TARGET', message:"proxyTarget can not be set to a value" }
					});
					proxyTarget[property] = (args.length>1?args:args[0]);
					result = true;
				}
				else if(property===null){
					if(_.isFunction(proxyTarget)){
						if(newOperator) result = new proxyTarget(...args);
						else result = proxyTarget(...args);
						// do same checks for 'result' as we are doing below
					} else {
						return this.proxyTargetActionReply(actionData,{
							error: { code: 'INVALID_TARGET', message:"proxyTarget is not a function" }
						});
					}
				}
				else if(newOperator && !(property in proxyTarget)){
					if(property===null) return this.proxyTargetActionReply(actionData,{
						error: { code: 'INVALID_TARGET', message:"proxyTarget can not be set to a value" }
					});
					proxyTarget[property] = (args.length>1?args:args[0]);
					result = true;
				} else {
					// todo: implement eventemitter (create proxy with target as an eventemitter? or only 'on', 'once', 'emit', etc in target?)
					// todo: implement streams (create proxy with target as a stream?) https://nodejs.org/api/stream.html#stream_api_for_stream_implementers
					if(!(property in proxyTarget)) return this.proxyTargetActionReply(actionData,{
						error: { code: 'PROPERTY_NOT_FOUND', message:"Property '"+property+"' does not exist on proxyTarget" }
					});
					if(_.isFunction(proxyTarget[property])){
						if(newOperator) result = new proxyTarget[property](...args);
						else result = proxyTarget[property](...args);
						// do same checks for 'result' as we are doing below
					}
					else if(newOperator){ proxyTarget[property] = (args.length>1?args:args[0]); result = true; } // set property value using new keyword
					else if(_.isString(proxyTarget[property])) result = proxyTarget[property];
					else if(_.isNumber(proxyTarget[property])) result = proxyTarget[property];
					else if(proxyTarget[property]===null) result = proxyTarget[property];
					else if(proxyTarget[property]===void 0) result = proxyTarget[property];
					else if(_.isObject(proxyTarget[property])){
						if(args.length>0){
							result = {};
							var targetObj = proxyTarget[property];
							for(var i=0,l=args.length; i<l; i++){
								if(_.has(targetObj,args[i])){
									result[args[i]] = targetObj[args[i]];
								}
							}
							// scan through results and etc. proxy target a result index if needed. see below.
						} else {
							// do scan for non-basic values. if all basic (such that it can be JSON stringified and parsed without any data loss), then simply have result as the object. otherwise, create a new proxy interface on client, and a new proxy target here on host
							result = proxyTarget[property];
						}
					}
					else return this.proxyTargetActionReply(actionData,{
						error: { code: 'INVALID_PROPERTY', message:"Invalid property '"+property+"' on proxyTarget" }
					});
				}
				this.proxyTargetActionReply(actionData,{
					resultType: 'value',
					result: result
				});
			});
		}
	}
};
