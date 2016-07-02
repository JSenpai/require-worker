
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
	var forkOpts = {};
	if(!options) options = {};
	if('cwd' in options) forkOpts.cwd = options.cwd;
	this.child = require('child_process').fork(path,[],forkOpts);
	this.funcsIndex = 0;
	this.funcs = {};
	this.callbacksIndex = 0;
	this.callbacks = {};
	var callbackFinish = function(){ delete this.workerChild.callbacks[this.callbackID]; };
	this.child.on('message',function(data){
		//console.log('child -> parent :',data);
		if('rwc' in data && 'id' in data.rwc){
			if(data.rwc.id in this.funcs){
				var c = this.funcs[data.rwc.id];
				if('errCode' in data.rwc) c[1](data.rwc.errCode);
				else if('result' in data.rwc && 'success' in data.rwc && data.rwc.success) c[0](data.rwc.result);
				else if('result' in data.rwc && 'success' in data.rwc && !data.rwc.success) c[1](data.rwc.result);
				else c[1](3);
				delete this.funcs[data.rwc.id];
				if(!('keepCallbacks' in data.rwc) || !data.rwc.keepCallbacks){
					for(var cbID in this.callbacks){
						if(this.callbacks[cbID][0]===data.rwc.id) delete this.callbacks[cbID];
					}
				}
			}
		}
		if('rwcb' in data && 'id' in data.rwcb){
			if(data.rwcb.id in this.callbacks){
				var cb = this.callbacks[data.rwcb.id];
				var args = data.rwcb.args;
				cb[1].apply({ workerChild:this, callbackID:data.rwcb.id, finish:callbackFinish },args);
			}
		}
	}.bind(this));
	var self = this;
	this.methods = new Proxy(Object.create(null),{
		get: function(target, name){
			return function(){
				var args = Array.prototype.slice.call(arguments);
				args.unshift(name);
				return self.call.apply(self,args);
			};
		},
		set: function(target, name, value){
			self.call(name,value);
			return true;
		}
	});
};

workerChild.prototype = {
	call : function(method){
		var self = this;
		var args = Array.prototype.slice.call(arguments,1);
		if(method===void 0) method = null;
		var funcID = this.funcsIndex++;
		var hasCallbacks = false;
		for(var i=0,l=args.length; i<l; i++){
			if(typeof(args[i])==='function'){ hasCallbacks = true; break; }
		}
		if(hasCallbacks){
			var callbacks = {}, cbAssoc = {};
			for(var i=0,l=args.length; i<l; i++){
				if(typeof(args[i])!=='function') continue;
				hasCallbacks = true;
				var cbID = this.callbacksIndex++;
				callbacks[cbID] = this.callbacks[cbID] = [funcID,args[i]];
				args[i] = 0;
				cbAssoc[i] = cbID;
			}
			var p = new Promise(function(finish,reject){
				self.funcs[funcID] = [finish,reject];
				self.child.send({ rwc:{ method:method, args:args, id:funcID, callbacks:cbAssoc } });
			});
			return p;
		} else {
			var p = new Promise(function(finish,reject){
				self.funcs[funcID] = [finish,reject];
				self.child.send({ rwc:{ method:method, args:args, id:funcID } });
			});
			return p;
		}
	},
	kill : function(killCode){
		this.child.kill(killCode);
	}
};

// module code
module.exports.initModule = function(module){
	var moduleObj = (module && 'exports' in module) ? module : null;
	var classObj = moduleObj ? module.exports : (module?module:{});
	process.on('message',function(data){
		//console.log('parent -> child :',data);
		if('rwc' in data && 'method' in data.rwc && 'id' in data.rwc){
			var method = data.rwc.method;
			if(method===null) return process.send({ rwc:{ id:data.rwc.id, success:true, result:data.rwc.args } });
			if(moduleObj && classObj!==moduleObj.exports) classObj = moduleObj.exports;
			var methodExists = (method in classObj), methodIsFunction = (typeof(classObj[method])==='function');
			if(methodExists && methodIsFunction){
				// Call the function
				var obj = { funcID:data.rwc.id, done:false };
				new Promise(function(finish,reject){
					var args = ('args' in data.rwc)?data.rwc.args:[];
					moduleHandleInData(obj,args,data.rwc);
					var r = classObj[method].apply({ finish:finish, reject:reject },args);
					if(r!==void 0) finish(r);
				}).then(function(result){
					moduleHandleOutData(this,result,true);
				}.bind(obj),function(result){
					moduleHandleOutData(this,result,false);
				}.bind(obj));
			} else if(methodExists && !methodIsFunction){
				// Get the property
				if(!('args' in data.rwc) || data.rwc.args.length===0){
					process.send({ rwc:{ id:data.rwc.id, success:true, result:classObj[method] } });
				}
				// Set the property
				else if('args' in data.rwc && data.rwc.args.length===1 && 'callbacks' in data.rwc){
					classObj[method] = function(){
						process.send({ rwcb:{ id:data.rwc.callbacks['0'], args:Array.prototype.slice.call(arguments) } });
						return true;
					};
					process.send({ rwc:{ id:data.rwc.id, success:true, keepCallbacks:true, result:null } });
				} else if('args' in data.rwc && data.rwc.args.length===1) {
					classObj[method] = data.rwc.args[0];
					process.send({ rwc:{ id:data.rwc.id, success:true, result:classObj[method] } });
				} else {
					process.send({ rwc:{ id:data.rwc.id, errCode:2 } });
				}
			} else {
				process.send({ rwc:{ id:data.rwc.id, errCode:1 } });
			}
		}
	});
	return classObj;
};

var moduleHandleInData = function(mngObj,args,callData){
	if('callbacks' in callData) for(var i in callData.callbacks){
		args[parseInt(i)] = moduleHandleInData.argumentCallback.bind({ cbID:callData.callbacks[i], obj:mngObj });
	}
};
moduleHandleInData.argumentCallback = function(){
	if(!this.obj.done) process.send({ rwcb:{ id:this.cbID, args:Array.prototype.slice.call(arguments) } });
};

var moduleHandleOutData = function(mngObj,result,success){
	if(result===void 0) result = null;
	mngObj.done = true;
	process.send({ rwc:{ id:mngObj.funcID, success:success, result:result } });
};
