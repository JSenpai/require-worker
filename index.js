/* global module,process,require,__filename,Function,Promise */
"use strict";

var childProcess = require('child_process');
//var eventEmitter = require('events');
module.exports.options = { 'verboseIO':false };

module.exports.errorList = {
	'1' : 'Called method does not exist',
	'2' : 'Called method could not be created',
	'3' : 'Failed to call method?'
};

// require code
module.exports.require = function(path,options){
	return new workerChild(path,options);
};

var workerChild = function(path,options){
	var child, forkOptions = {};
	if(!options) options = {};
	if('cwd' in options) forkOptions.cwd = options.cwd;
	if('wrapRequire' in options && options['wrapRequire']){
		child = childProcess.fork(__filename,['-wrapRequire',path],forkOptions);
	} else {
		child = childProcess.fork(path,[],forkOptions);
	}
	this._child = child;
	this._dataHandler = new dataHandler({ io:child, type:'host' });
	this._proxyObject = this._dataHandler.createProxyObject(null);
	this.methods = this._proxyObject.proxy;
	this.call = this._proxyObject.call;
};
workerChild.prototype = {
	kill : function(killCode){
		this._child.kill(killCode);
	},
	callOptionsObject: function(options){
		var obj = new dataHandler._funcObjTpl();
		obj.callOptions = options;
		return obj;
	}
};

// module code
var initModuleList = [];
module.exports.initModule = function(module){
	var moduleObj = (module && 'exports' in module) ? module : null;
	var exportsObj = moduleObj ? module.exports : (module?module:{});
	if(initModuleList.indexOf(exportsObj)!==-1) return exportsObj;
	else initModuleList.push(exportsObj);
	this.dataHandler = new dataHandler({ io:process, type:'worker', module:moduleObj, exports:exportsObj });
	return exportsObj;
};

// Data Handler
var dataHandler = function(options){
	var self = this;
	this.io = options.io;
	this.type = options.type;
	if(this.type==='worker'){
		this.workerModule = options.module;
		this.workerExports = options.exports;
	}
	this.proxyIndex = 0;
	this.proxies = {};
	this.proxiesByRefs = {};
	this.proxyRefIndex = 0;
	this.proxyRefs = {};
	this.funcsIndex = 0;
	this.funcs = {};
	this.callbacksIndex = 0;
	this.callbacks = {};
	if(this.type==='host'){
		this.io.send({ options:module.exports.options });
	}
	this.io.on('message',function(data){
		if(typeof(data)==='object' && 'options' in data){
			module.exports.options = data.options;
		}
		if(module.exports.options.verboseIO) console.log((self.type==='host'?'worker':'host')+' -> '+self.type+' :',data);
		self.handleIncoming(data);
	});
	this._funcObjTpl = function(){};
};
dataHandler._funcObjTpl = function(){};
dataHandler.prototype = {
	createProxyRef: function(exportsObj){
		var self = this;
		for(var i in self.proxyRefs){
			if(self.proxyRefs[i].exports===exportsObj) return i;
		}
		var refID = self.proxyRefIndex++;
		self.proxyRefs[refID] = { exports:exportsObj };
		return refID;
	},
	createProxyObject: function(proxyRefID,targetObject){
		var self = this;
		if(proxyRefID in self.proxiesByRefs) return self.proxiesByRefs[proxyRefID];
		var proxyID = self.proxyIndex++;
		if(!targetObject) targetObject = Object.create(null);
		var call = function(method){
			var args = Array.prototype.slice.call(arguments,1);
			if(this && 'constructor' in this && (this.constructor===call || this.constructor instanceof call)){
				if(args.length>0 && typeof(args[args.length-1])==='object' && args[args.length-1] instanceof dataHandler._funcObjTpl){
					args[args.length-1].callOptions.newInstance = true;
				} else {
					var obj = new dataHandler._funcObjTpl();
					obj.callOptions = { newInstance:true };
					args.push(obj);
				}
			}
			return self.createDirectCall(proxyID,method,args);
		};
		var proxy = new Proxy(targetObject,{
			get: function(target, name){
				//console.log('proxy '+proxyID+':'+proxyRefID+' get '+name+' on',target);
				if(name==='constructor') return void 0;
				if(name in target) return target[name];
				return call.bind(null,name);
			},
			set: function(target, name, value){
				return call(name,value);
				//return self.createDirectCall(proxyID,name,[value]);
			}
		});
		var proxyObj = { id:proxyID, proxy:proxy, refID:proxyRefID, call:call };
		self.proxies[proxyID] = proxyObj;
		self.proxiesByRefs[proxyRefID] = proxyObj;
		return proxyObj;
	},
	createDirectCall: function(proxyID,method,args){
		var self = this;
		var proxyObject = self.proxies[proxyID];
		if(self.type!=='host') throw Error("createDirectCall can only be done on host");
		if(method===void 0) method = null;
		var callID = self.funcsIndex++;
		var hasCallbacks = false, callOptions;
		for(var i=0,l=args.length; i<l; i++){
			if(typeof(args[i])==='function'){ hasCallbacks = true; continue; }
			if(i===l-1 && typeof(args[i])==='object' && args[i] instanceof dataHandler._funcObjTpl){
				if('callOptions' in args[i]) callOptions = args[i].callOptions;
				args.splice(i,1);
			}
		}
		if(hasCallbacks){
			var callbacks = {}, cbAssoc = {};
			for(var i=0,l=args.length; i<l; i++){
				if(typeof(args[i])!=='function') continue;
				hasCallbacks = true;
				var cbID = self.callbacksIndex++;
				callbacks[cbID] = self.callbacks[cbID] = [callID,args[i]];
				args[i] = 0;
				cbAssoc[i] = cbID;
			}
			var callObj = { id:callID, method:method, args:args, proxyRefID:proxyObject.refID, callbacks:cbAssoc };
		} else {
			var callObj = { id:callID, method:method, args:args, proxyRefID:proxyObject.refID };
		}
		if(typeof(callOptions)==='object') callObj.co = callOptions;
		var p = new Promise(function(finish,reject){
			self.funcs[callID] = [finish,reject];
			self.io.send({ call:callObj });
		});
		return p;
	},
	createCallCallback: function(callbackID,obj){
		var self = this;
		return function(){
			if(!obj.done) self.io.send({ callbackReply:{ id:callbackID, args:Array.prototype.slice.call(arguments) } });
		};
	},
	handleCallResponseIn: function(resultData){
		var self = this;
		var result = void 0;
		if(resultData.type===1) result = resultData.data; // Basic Data Types
		else if(resultData.type===2){ // Object
			result = resultData.data;
			// todo: fill in callback, promise and other resultData
		}
		else if(resultData.type===3){ // Normal Function
			result = this.createCallCallback(resultData.callbackID,{});
		}
		else if(resultData.type===4){ // 'new' Function
			var proxy = this.createProxyObject(resultData.proxyRefID,{ toJSON:function(){ return '{}'; }, inspect:function(){ return '{}'; } });
			result = { methods:proxy.proxy, call:proxy.call }; 
		}
		else if(resultData.type===5){ // Promise - Not yet tested!
			var proxy = this.createProxyObject(resultData.proxyRefID);
			result = proxy.proxy;
		}
		return result;
	},
	handleCallResponseOut: function(callID,result,success,crObj){
		var resultData = {};
		if(result===void 0) resultData.type = 0;
		else if(result===null || typeof(result)==='boolean' || typeof(result)==='number' || typeof(result)==='string'){ // Basic Data Types
			resultData.type = 1;
			resultData.data = result;
		}
		else if(typeof(result)==='object' && result instanceof Promise){ // Promise - Not yet tested!
			resultData.type = 5;
			resultData.proxyRefID = this.createProxyRef(result);
		}
		else if(typeof(result)==='function'){ // Normal Function
			resultData.type = 3;
			var cbID = this.callbacksIndex++;
			this.callbacks[cbID] = [callID,result];
			resultData.callbackID = cbID;
		}
		else if(typeof(result)==='object' && 'constructor' in result && result.constructor instanceof Function){ // 'new' Function
			resultData.type = 4;
			resultData.proxyRefID = this.createProxyRef(result);
		}
		else if(typeof(result)==='object'){ // Normal Object
			resultData.type = 2;
			// todo: replace callback, promise and other data with filler data, and specify id's in other resultData fields
			resultData.data = result;
		} else { // Fallback to 'Basic Data'
			resultData.type = 1;
			resultData.data = result;
		}
		crObj = (typeof(crObj)==='object')?crObj:{};
		crObj.id = callID;
		crObj.success = success;
		crObj.data = resultData;
		this.io.send({ callReply:crObj });
	},
	handleIncoming: function(data){
		var self = this;
		var call = (self.type==='worker' && 'call' in data) ? data.call : false;
		if(call && 'method' in call && 'id' in call){
			var method = call.method;
			var callOptions = ('co' in call) ? call.co : {};
			var newInstance = ('newInstance' in callOptions && callOptions.newInstance);
			var useReturnOnly = ('useReturnOnly' in callOptions && callOptions.useReturnOnly);
			var ignoreResult = ('ignoreResult' in callOptions && callOptions.ignoreResult);
			if(method===null && !newInstance) return self.handleCallResponseOut(call.id,call.args,true);
			var exportsObj;
			if(call.proxyRefID!==null && call.proxyRefID in self.proxyRefs){
				exportsObj = self.proxyRefs[call.proxyRefID].exports;
			} else {
				if(self.workerModule && self.workerExports!==self.workerModule.exports) self.workerExports = self.workerModule.exports;
				exportsObj = self.workerExports;
			}
			var methodExists = (method in exportsObj), methodIsFunction = (typeof(exportsObj[method])==='function');
			if(!method && newInstance){
				result = new (Function.prototype.bind.apply(exportsObj,args));
				self.handleCallResponseOut(call.id,result,true);
			} else if(methodExists && methodIsFunction){
				// Call the function
				var obj = { done:false };
				new Promise(function(finish,reject){
					var result, args = ('args' in call)?call.args:[];
					if('callbacks' in call) for(var i in call.callbacks){
						args[parseInt(i)] = self.createCallCallback(call.callbacks[i],obj); 
					}
					if(newInstance){
						result = new exportsObj[method].apply(exportsObj,args);
					} else if(useReturnOnly || ignoreResult){
						result = exportsObj[method].apply(exportsObj,args);
					} else {
						// todo: have 'finish' and 'reject' method names configurable using callOptions
						result = exportsObj[method].apply({ finish:finish, reject:reject },args);
						if(result===exportsObj) result = null; // could possibly return something that says it's the same as the proxy
					}
					//console.log('call '+method+' result',result,'callOptions',callOptions);
					if(ignoreResult) result = null;
					if(result===void 0 && 'allowUndefined' in callOptions && callOptions.allowUndefined!==false) finish(callOptions.allowUndefined);
					else if(result!==void 0) finish(result);
				}).then(function(result){
					var keepCallbacks = ignoreResult;
					if(!keepCallbacks) obj.done = true;
					self.handleCallResponseOut(call.id,result,true,{ keepCallbacks:keepCallbacks });
				},function(result){
					var keepCallbacks = ignoreResult;
					if(!keepCallbacks) obj.done = true;
					self.handleCallResponseOut(call.id,result,false,{ keepCallbacks:keepCallbacks });
				});
			} else if(methodExists && !methodIsFunction){
				// Get the property
				if(!('args' in call) || call.args.length===0){
					self.handleCallResponseOut(call.id,exportsObj[method],true);
				}
				// Set the property
				else if('args' in call && call.args.length===1 && 'callbacks' in call){
					exportsObj[method] = function(){
						self.io.send({ callbackReply:{ id:call.callbacks['0'], args:Array.prototype.slice.call(arguments) } });
						return true;
					};
					self.handleCallResponseOut(call.id,null,true,{ keepCallbacks:true });
				} else if('args' in call && call.args.length===1) {
					exportsObj[method] = call.args[0];
					self.handleCallResponseOut(call.id,exportsObj[method],true);
				} else {
					self.io.send({ callReply:{ id:call.id, errCode:2 } });
				}
			} else {
				self.io.send({ callReply:{ id:call.id, errCode:1, method:method } });
			}
		}
		var callReply = (self.type==='host' && 'callReply' in data) ? data.callReply : false;
		if(callReply && 'id' in callReply){
			if(callReply.id in self.funcs){
				var result = ('data' in callReply) ? self.handleCallResponseIn(callReply.data) : void 0;
				var success = ('success' in callReply) ? callReply.success : void 0;
				var c = self.funcs[callReply.id];
				if('errCode' in callReply) c[1](callReply.errCode);
				else if(success) c[0](result);
				else if(success===void 0) c[1](3);
				else c[1](result);
				delete self.funcs[callReply.id];
				if(!('keepCallbacks' in callReply) || !callReply.keepCallbacks){
					for(var cbID in self.callbacks){
						if(self.callbacks[cbID][0]===callReply.id) delete self.callbacks[cbID];
					}
				}
			}
		}
		var callbackReply = ('callbackReply' in data) ? data.callbackReply : false;
		if(callbackReply && 'id' in callbackReply){
			if(callbackReply.id in self.callbacks){
				var cb = self.callbacks[callbackReply.id];
				var args = callbackReply.args;
				cb[1].apply({ workerChild:self, callbackID:callbackReply.id, finish:dataHandler._callbackFinish },args);
			}
		}
	}
};
dataHandler._callbackFinish = function(){ delete this.workerChild.callbacks[this.callbackID]; };

if(require.main===module && process.argv.length===4 && process.argv[2]==='-wrapRequire'){
	var moduleToRequire = require.resolve(process.argv[3]);
	module.exports.initModule(require(moduleToRequire));
}
