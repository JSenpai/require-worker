/* global module,process,require,__filename,Function */
"use strict";

var childProcess = require('child_process');
//var eventEmitter = require('events');
module.exports = {};

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
};
workerChild.prototype = {
	call : function(method){
		var args = Array.prototype.slice.call(arguments,1);
		return this._dataHandler.createDirectCall(this._proxyObject.refID,method,args);
	},
	kill : function(killCode){
		this._child.kill(killCode);
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
	this.funcsIndex = 0;
	this.funcs = {};
	this.callbacksIndex = 0;
	this.callbacks = {};
	this.io.on('message',function(data){
		//console.log('parent -> child :',data);
		self.handleIncoming(data);
	});
};
dataHandler.prototype = {
	createProxyObject: function(refID){
		var self = this;
		var proxyID = self.proxyIndex++;
		var proxy = new Proxy(Object.create(null),{
			get: function(target, name){
				return function(){
					var args = Array.prototype.slice.call(arguments);
					return self.createDirectCall(proxyID,name,args);
				};
			},
			set: function(target, name, value){
				return self.createDirectCall(proxyID,name,[value]);
			}
		});
		self.proxies[proxyID] = proxy;
		return { id:proxyID, proxy:proxy, refID:refID };
	},
	createDirectCall: function(proxyID,method,args){
		var self = this;
		var proxyObject = self.proxies[proxyID];
		if(self.type!=='host') throw Error("createDirectCall can only be done on host");
		if(method===void 0) method = null;
		var callID = self.funcsIndex++;
		var hasCallbacks = false;
		for(var i=0,l=args.length; i<l; i++){
			if(typeof(args[i])==='function'){ hasCallbacks = true; break; }
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
			var p = new Promise(function(finish,reject){
				self.funcs[callID] = [finish,reject,{}];
				self.io.send({ call:{ method:method, args:args, id:callID, callbacks:cbAssoc } });
			});
			p.options = function(options){
				self.funcs[callID][2] = options;
				return p;
			};
			return p;
		} else {
			var p = new Promise(function(finish,reject){
				self.funcs[callID] = [finish,reject,{}];
				self.io.send({ call:{ method:method, args:args, id:callID } });
			});
			p.options = function(options){
				self.funcs[callID][2] = options;
				return p;
			};
			return p;
		}
	},
	createCallCallback: function(callbackID,obj){
		var self = this;
		return function(){
			if(!obj.done) self.io.send({ callbackReply:{ id:callbackID, args:Array.prototype.slice.call(arguments) } });
		};
	},
	handleCallResponseIn: function(data){
		var result = void 0;
		if(data.type===1) result = data.data; // Basic Data Types
		else if(data.type===2){ // Object
			result = data.data;
			// todo: fill in callback, promise and other data
		}
		else if(data.type===3){ // Normal Function
			// todo
		}
		else if(data.type===4){ // 'new' Function
			// todo
		}
		else if(data.type===5){ // Promise
			// todo
		}
		return result;
	},
	handleCallResponseOut: function(callID,result,success){
		var sendData = {};
		if(result===void 0) sendData.type = 0;
		else if(result===null || typeof(result)==='boolean' || typeof(result)==='number' || typeof(result)==='string'){ // Basic Data Types
			sendData.type = 1;
			sendData.data = result;
		}
		else if(typeof(result)==='object' && result instanceof Promise){ // Promise
			sendData.type = 5;
			// todo
		}
		else if(typeof(result)==='function'){ // Normal Function
			sendData.type = 3;
			// todo
		}
		else if(typeof(result)==='object' && 'constructor' in result && result.constructor instanceof Function){ // 'new' Function
			sendData.type = 4;
			// todo
		}
		else if(typeof(result)==='object'){
			sendData.type = 2;
			// todo: replace callback, promise and other data with filler data, and specify id's in other sendData fields
			sendData.data = result;
		}
		this.io.send({ callReply:{ id:callID, success:success, data:sendData } });
	},
	handleIncoming: function(data){
		var self = this;
		var call = (self.type==='worker' && 'call' in data) ? data.call : false;
		if(call && 'method' in call && 'id' in call){
			var method = call.method;
			if(method===null) return self.io.send({ callReply:{ id:call.id, success:true, result:call.args } });
			if(self.workerModule && self.workerExports!==self.workerModule.exports) self.workerExports = self.workerModule.exports;
			var methodExists = (method in self.workerExports), methodIsFunction = (typeof(self.workerExports[method])==='function');
			if(methodExists && methodIsFunction){
				// Call the function
				var obj = { done:false };
				var callOptions = ('callOptions' in call)?call.options:{};
				new Promise(function(finish,reject){
					var args = ('args' in call)?call.args:[];
					if('callbacks' in call) for(var i in call.callbacks){
						args[parseInt(i)] = self.createCallCallback(call.callbacks[i],obj); 
					}
					var r = self.workerExports[method].apply({ finish:finish, reject:reject },args);
					if(r===void 0 && 'allowUndefined' in callOptions && callOptions.allowUndefined!==false) finish(callOptions.allowUndefined);
					else if(r!==void 0) finish(r);
				}).then(function(result){
					obj.done = true;
					self.handleCallResponseOut(call.id,result,true);
				},function(result){
					obj.done = true;
					self.handleCallResponseOut(call.id,result,false);
				});
			} else if(methodExists && !methodIsFunction){
				// Get the property
				if(!('args' in call) || call.args.length===0){
					self.io.send({ callReply:{ id:call.id, success:true, result:self.workerExports[method] } });
				}
				// Set the property
				else if('args' in call && call.args.length===1 && 'callbacks' in call){
					self.workerExports[method] = function(){
						self.io.send({ callbackReply:{ id:call.callbacks['0'], args:Array.prototype.slice.call(arguments) } });
						return true;
					};
					self.io.send({ callReply:{ id:call.id, success:true, keepCallbacks:true, result:null } });
				} else if('args' in call && call.args.length===1) {
					self.workerExports[method] = call.args[0];
					self.io.send({ callReply:{ id:call.id, success:true, result:self.workerExports[method] } });
				} else {
					self.io.send({ callReply:{ id:call.id, errCode:2 } });
				}
			} else {
				self.io.send({ callReply:{ id:call.id, errCode:1 } });
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
