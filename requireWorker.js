
module.exports = {};

module.exports.errorList = {
	'1' : 'Called method does not exist',
	'2' : 'Called method is not a function',
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
		//console.log('message from child:',data);
		if('rwc' in data && 'id' in data.rwc){
			if(data.rwc.id in this.funcs){
				var c = this.funcs[data.rwc.id];
				if('errCode' in data.rwc) c[1](data.rwc.errCode);
				else if('result' in data.rwc && 'success' in data.rwc && data.rwc.success) c[0](data.rwc.result);
				else if('result' in data.rwc && 'success' in data.rwc && !data.rwc.success) c[1](data.rwc.result);
				else c[1](3);
				delete this.funcs[data.rwc.id];
				for(var cbID in this.callbacks){
					if(this.callbacks[cbID][0]===data.rwc.id) delete this.callbacks[cbID];
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
	},
	shortMethods: function(list){
		var obj = {};
		list = typeof(list)==='object' ? list : Array.prototype.slice.call(arguments);
		for(var i=0,l=list.length; i<l; i++){
			var method = list[i];
			if(!(method in obj)) obj[method] = this.call.bind(this,method);
		}
		return obj;
	}
};

// module code
module.exports.initModule = function(module){
	var moduleObj = (module && 'exports' in module) ? module : null;
	var classObj = moduleObj ? module.exports : (module?module:{});
	process.on('message',function(data){
		//console.log('message from parent:',data);
		if('rwc' in data && 'method' in data.rwc && 'id' in data.rwc){
			var method = data.rwc.method;
			if(method===null) return process.send({ rwc:{ id:data.rwc.id, result:data.rwc.args } });
			if(moduleObj && classObj!==moduleObj.exports) classObj = moduleObj.exports;
			if(method in classObj){
				if(typeof(classObj[method])==='function'){
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
