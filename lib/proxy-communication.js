/* global exports, Promise */
"use strict";

const eventEmitter = require('events');
const _ = require('./underscore-with-mixins');
const dataHandler = require('./proxy-data-handler');

const noOp = ()=>{};

exports.create = (...args)=>{
	return new proxyCom(...args);
};

const proxyCom = exports.proxyCom = function(options={}){
	if(!('transport' in options)) throw Error("transport option is required");
	if(options.transport.type!=='ipcTransport') throw Error("Invalid transport, only ipcTransport is currently implemented");
	if(!('instance' in options.transport)) throw Error("transport instance option is required");
	if('requireWorkerClient' in options) this.requireWorkerClient = options.requireWorkerClient;
	if('requireWorkerHost' in options) this.requireWorkerHost = options.requireWorkerHost;
	this.setTransport(options.transport.type,options.transport.instance);
	this.events = new eventEmitter();
	this.proxyMainInterfaceReady = false;
	this.proxyTargetReady = false;
	this.promiseActionID = 0;
	this.proxyMap = new Map();
	this.dataHandler = dataHandler.create(this);
	return this;
};

proxyCom.prototype = {
	_preDestroy: function(){
		if(this._preDestroyed) return;
		for(var [key1,interfaceObj] of this.proxyMap){
			if(interfaceObj.promiseMap) for(var [key2,promiseObj] of interfaceObj.promiseMap){
				if(promiseObj.reject && !promiseObj.resolved && !promiseObj.rejected) try{
					promiseObj.reject(this.dataHandler.proxyInterfaceHandleResultError(promiseObj,{
						code: 'DESTROYED',
						message: "requireWorker client proxyCom has been destroyed"
					}));
				}catch(err){}
			}
		}
		this._preDestroyed = true;
	},
	_destroy: function(){
		if(this._destroyed) return;
		this._preDestroy();
		this.dataHandler._destroy();
		this.events.removeAllListeners();
		if(this.transport && this.transport.send) this.transport.send('proxyCom._destroy');
		if(this.transportType==='ipcTransport') this.transportInstance._destroy();
		for(var [key1,interfaceObj] of this.proxyMap){
			if(interfaceObj.promiseMap) interfaceObj.promiseMap.clear();
		}
		this.proxyMap.clear();
		for(var key in ['events','proxyMap','dataHandler']){
			try{ delete this[key]; }catch(err){}
		}
		this.createMainProxyInterface = this.proxyInterfaceGet = this.proxyInterfaceGetPromiseAction = ()=>{ throw Error("proxyCom has been destroyed"); };
		this._destroyed = true;
	},
	setTransport: function(type,transport){
		this.transportType = type;
		if(type==='ipcTransport'){
			this.transportInstance = transport;
			this.transport = transport.createMessageEventEmitter();
			this.transport.once('proxyCom._destroy',()=>{
				this._destroy();
			});
		}
	},
	connectTransportClient: function(onReady){
		this.connectTransportClientQueue = [];
		if(onReady && _.isFunction(onReady)) this.connectTransportClientQueue.push(onReady);
		this.connectTransportClientPromise = new Promise((resolve,reject)=>{
			this.connectTransportClientQueue.push(resolve);
		}).catch(noOp);
		this.transport.once('isReady!',()=>this.connectTransportClientReady());
		this.transport.once('isReady?',()=>this.transport.send('isReady!'));
		this.transport.send('isReady?');
	},
	createMainProxyInterface: function(){
		var self = this;
		return self.createProxyInterface({ basePromise:self.connectTransportClientPromise });
	},
	connectTransportHost: function(onReady){
		this.proxyTargetReadyQueue = [];
		var sendIsReady = ()=>this.transport.send('isReady!');
		this.transport.once('isReady!',()=>{
			sendIsReady();
			this.transport.removeAllListeners('isReady?');
			this.transport.removeAllListeners('isReady!');
			onReady();
		});
		this.transport.once('isReady?',sendIsReady);
		this.transport.send('isReady?');
		this.proxyTargetReadyPromise = new Promise((resolve,reject)=>{
			this.proxyTargetReadyQueue.push(resolve);
		}).catch(noOp);
		this.initProxyTargetListener();
	},
	setProxyTarget: function(target){
		this.proxyTarget = target;
		this.setProxyTargetReady();
	},
	connectTransportClientReady: function(){
		if(this.proxyMainInterfaceReady) return;
		this.proxyMainInterfaceReady = true;
		this.transport.removeAllListeners('isReady?');
		this.transport.removeAllListeners('isReady!');
		var queue = this.connectTransportClientQueue;
		this.connectTransportClientQueue = null;
		for(var i=0,l=queue.length; i<l; i++) queue[i]();
	},
	setProxyTargetReady: function(){
		if(this.proxyTargetReady) return;
		this.proxyTargetReady = true;
		var queue = this.proxyTargetReadyQueue;
		this.proxyTargetReadyQueue = null;
		for(var i=0,l=queue.length; i<l; i++) queue[i]();
	},
	_proxyHandlerDefaults: {
		set: (target,property,value,receiver)=>{ throw Error("Use requireWorker(module).setProperty(name,value)"); },
		has: (target,property)=>false,
		deleteProperty: (target,property)=>{ throw Error("Use requireWorker(module).deleteProperty(name)"); },
		defineProperty: (target,property,descriptor)=>false,
		//construct: (target,argumentsList,newTarget)=>false,
		ownKeys: (target)=>[],
		getPrototypeOf: (target)=>null,
		getOwnPropertyDescriptor: function(target,property){
			return { value:void 0, writable:false, configurable:false, enumerable:false, get:()=>this.get(target,property) };
		}
	},
	_proxyTargetDefaults: {
		toJSON(){ return '{}'; },
		inspect(){ return '{}'; },
		valueOf(){ return '{}'; }
	},
	createProxyInterface: function(interfaceOptions={}){
		var self = this, iObj = { options:interfaceOptions, timestamp:Date.now() };
		var proxyHandler = Object.create(self._proxyHandlerDefaults);
		iObj.promiseMap = new Map();
		proxyHandler.get = (...getArgs)=>self.proxyInterfaceGet({ getArgs, interfaceObj:iObj, timestamp:Date.now() });
		iObj.proxyTarget = function(...args){
			var newOperator = _.isConstructed(this,iObj.proxyTarget);
			return self.proxyInterfaceGet({ getArgs:[iObj.proxyTarget,null], funcArgs:args, newOperator, interfaceObj:iObj, timestamp:Date.now() });
		};
		Object.assign(iObj.proxyTarget,self._proxyTargetDefaults);
		iObj.proxy = new Proxy(iObj.proxyTarget,proxyHandler);
		self.proxyMap.set(iObj.proxy,iObj);
		return iObj.proxy;
	},
	proxyInterfaceGet: function(getObj){
		var { getArgs:[target,property], funcArgs=[], newOperator=false, interfaceObj } = getObj;
		var self = this;
		if(property==='constructor'){
			getObj.newOperator = true;
			var boundConstructor = self.proxyInterfaceGet.bind(self,getObj);
			boundConstructor.client = self;
			return boundConstructor;
		}
		if(_.has(target,property)) return target[property];
		if(typeof property==='symbol') return void 0;
		if(typeof property!=='string' && property!==null) return void 0;
		var resultFunc = function requireWorkerProxyInvoker(...args){
			var newOperator2 = !!newOperator;
			if(!newOperator2) newOperator2 = _.isConstructed(this,resultFunc);
			var promiseObj = { getObj, newOperator:newOperator2, property, args, configObj:{}, timestamp:Date.now() };
			promiseObj.promise = new Promise((resolve2,reject2)=>{
				var resolve = (...rArgs)=>{ self.proxyInterfaceGetEndPromise(promiseObj,{ resolve:true }); resolve2(...rArgs); };
				var reject = (...rArgs)=>{ self.proxyInterfaceGetEndPromise(promiseObj,{ reject:true }); reject2(...rArgs); };
				promiseObj.resolve = resolve;
				promiseObj.reject = reject;
				promiseObj.resolveReal = resolve2;
				promiseObj.rejectReal = reject2;
				var action = ()=>self.proxyInterfaceGetPromiseAction(promiseObj);
				if(interfaceObj.options.basePromise) interfaceObj.options.basePromise.then(action);
				else Promise.resolve().then(action);
			});
			interfaceObj.promiseMap.set(promiseObj.promise,promiseObj);
			promiseObj.promise.configure = (...options)=>{
				if(options.length>0) _.extend(promiseObj.configObj,...options);
				return promiseObj.promise;
			};
			return promiseObj.promise;
		};
		if(property===null) return resultFunc(...funcArgs);
		else return resultFunc;
	},
	proxyInterfaceGetEndPromise: function(promiseObj,options={}){
		var interfaceObj = promiseObj.getObj.interfaceObj;
		if(options.timeout){
			delete promiseObj.timeout;
			var timeoutMs = promiseObj.configObj.timeout>1?promiseObj.configObj.timeout:1;
			var rejectError = this.dataHandler.proxyInterfaceHandleResultError(promiseObj,{
				code: 'TIMEOUT',
				message: "proxyInterface promise timeout after "+timeoutMs+"ms"
			});
			if(!promiseObj.resolved && !promiseObj.rejected) promiseObj.reject(rejectError); // calls proxyInterfaceGetEndPromise again
		} else if(promiseObj.timeout){
			clearTimeout(promiseObj.timeout);
			delete promiseObj.timeout;
		}
		if(options.resolve) promiseObj.resolved = true;
		if(options.reject) promiseObj.rejected = true;
		if(options.resolve || options.reject){
			if(interfaceObj.promiseMap.has(promiseObj.promise)) interfaceObj.promiseMap.delete(promiseObj.promise);
		}
	},
	proxyInterfaceGetLateConfigureError: function(){
		throw Error(".configure must be called straight after promise creation");
	},
	proxyInterfaceGetPromiseAction: function(promiseObj){
		var { getObj:{ interfaceObj }, configObj, property, newOperator, args, resolve, reject } = promiseObj;
		promiseObj.promise.configure = this.proxyInterfaceGetLateConfigureError;
		var interfaceID = interfaceObj.options.id || 0;
		var actionID = ++this.promiseActionID;
		var returnEventName = 'proxyInterfaceGetActionReply:'+interfaceID+':'+actionID;
		var actionConfig = {};
		if(_.has(configObj,'deleteProperty') && configObj.deleteProperty) actionConfig.deleteProperty = !!configObj.deleteProperty;
		if(_.has(configObj,'setProperty') && configObj.setProperty) actionConfig.setProperty = !!configObj.setProperty;
		if(_.has(configObj,'hasProperty') && configObj.hasProperty) actionConfig.hasProperty = true;
		if(_.has(configObj,'hasOwnProperty') && configObj.hasOwnProperty) actionConfig.hasOwnProperty = true;
		if(_.has(configObj,'newOperator')) newOperator = !!configObj.newOperator;
		if(_.has(configObj,'timeout')) promiseObj.timeout = setTimeout(()=>{ this.proxyInterfaceGetEndPromise(promiseObj,{ timeout:true }); },configObj.timeout>1?configObj.timeout:1);
		if(property===null){
			if(_.has(configObj,'property') && _.isString(configObj.property)) property = configObj.property;
			if(_.has(configObj,'args') && _.isArray(configObj.args)) args = configObj.args;
		}
		_.each(_.pick(actionConfig,['deleteProperty','setProperty','hasProperty','hasOwnProperty']),(value,key)=>{
			if(value===false) delete actionConfig[key];
		});
		//console.log("proxyInterfaceGetAction",{ property, newOperator, args });
		this.transport.send("proxyInterfaceGetAction",{
			returnEventName, interfaceID, actionID, property, newOperator, args, actionConfig
		});
		this.transport.once(returnEventName,(...args)=>this.dataHandler.proxyInterfaceHandleResult(promiseObj,...args));
	},
	initProxyTargetListener: function(){
		this.transport.on('proxyInterfaceGetAction',(...args)=>this.dataHandler.proxyTargetAction(...args));
	}
};
