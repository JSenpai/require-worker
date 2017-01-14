/* global exports, Promise */
"use strict";

const _ = require('underscore');
const eventEmitter = require('events');

exports.create = (...args)=>{
	return new proxyCom(...args);
};

var proxyCom = function(options={}){
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
	this.dataHandler = new dataHandler(this);
	return this;
};

proxyCom.prototype = {
	setTransport: function(type,transport){
		this.transport = new eventEmitter();
		if(type==='ipcTransport'){
			this.transportInstance = transport;
			transport.events.on('message',(eventName,...data)=>{
				this.transport.emit(eventName,...data);
			});
			this.transport.send = (eventName,...data)=>transport.send(eventName,...data);
		}
	},
	connectTransportClient: function(onReady){
		this.connectTransportClientQueue = [];
		if(onReady && _.isFunction(onReady)) this.connectTransportClientQueue.push(onReady);
		this.connectTransportClientPromise = new Promise((resolve,reject)=>{
			this.connectTransportClientQueue.push(resolve);
		}).catch(()=>{});
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
			console.log('connectTransportHost Ready');
			onReady();
		});
		this.transport.once('isReady?',sendIsReady);
		this.transport.send('isReady?');
		this.proxyTargetReadyPromise = new Promise((resolve,reject)=>{
			this.proxyTargetReadyQueue.push(resolve);
		}).catch(()=>{});
		this.dataHandler.initProxyTargetListener();
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
		console.log('connectTransportClientReady');
	},
	setProxyTargetReady: function(){
		if(this.proxyTargetReady) return;
		this.proxyTargetReady = true;
		var queue = this.proxyTargetReadyQueue;
		this.proxyTargetReadyQueue = null;
		for(var i=0,l=queue.length; i<l; i++) queue[i]();
		console.log('setProxyTargetReady');
	},
	createProxyInterface: function(interfaceOptions={}){
		return this.dataHandler.createProxyInterface(interfaceOptions);
	}
};

var dataHandler = function(proxyCom){
	this.proxyCom = proxyCom;
	this.proxyMap = new Map();
	return this;
};

dataHandler.prototype = {
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
	createProxyInterface: function(interfaceOptions){
		var self = this, iObj = { options:interfaceOptions, timestamp:Date.now() };
		var proxyHandler = Object.create(self._proxyHandlerDefaults);
		iObj.promiseMap = new Map();
		proxyHandler.get = (...getArgs)=>self.proxyInterfaceGet({ getArgs, interfaceObj:iObj });
		iObj.proxyTarget = function(...args){ return self.proxyInterfaceGet({ getArgs:[iObj.proxyTarget,null], funcArgs:args, funcSelf:this, interfaceObj:iObj }); };
		Object.assign(iObj.proxyTarget,{ toJSON(){ return '{}'; }, inspect(){ return '{}'; }, valueOf(){ return '{}'; } });
		iObj.proxy = new Proxy(iObj.proxyTarget,proxyHandler);
		self.proxyMap.set(iObj.proxy,iObj);
		return iObj.proxy;
	},
	proxyInterfaceGet: function(getObj){
		var { getArgs:[target,property], funcArgs=[], funcSelf=null, isConstructor=false, interfaceObj } = getObj;
		var self = this;
		if(property==='constructor'){
			getObj.isConstructor = true;
			return self.proxyInterfaceGet.bind(self,getObj);
		}
		if(property in target) return target[property];
		if(typeof property==='symbol') return void 0;
		if(typeof property!=='string' && property!==null) return void 0;
		var resultFunc = function requireWorkerProxyInvoker(...args){
			if(funcSelf) isConstructor = true;
			else if(!isConstructor) isConstructor = (this && 'constructor' in this && (this.constructor===resultFunc || this.constructor instanceof resultFunc));
			isConstructor = !!isConstructor;
			var promiseObj = { getObj, isConstructor, property, args, callConfig:{} };
			promiseObj.promise = new Promise((resolve2,reject2)=>{
				var resolve = (...rargs)=>{ removeFromMap(); resolve2(...rargs); };
				var reject = (...rargs)=>{ removeFromMap(); reject2(...rargs); };
				promiseObj.resolve = resolve;
				promiseObj.reject = reject;
				var action = ()=>self.proxyInterfaceGetPromiseAction(promiseObj);
				if(interfaceObj.options.basePromise) interfaceObj.options.basePromise.then(action);
				else Promise.resolve().then(action);
			});
			var removeFromMap = ()=>{ if(interfaceObj.promiseMap.has(promiseObj.promise)) interfaceObj.promiseMap.delete(promiseObj.promise); };
			interfaceObj.promiseMap.set(promiseObj.promise,{ promiseObj, timestamp:Date.now() });
			promiseObj.promise.configure = (...options)=>{
				if(options.length>0) _.extend(promiseObj.callConfig,...options);
				console.log('promiseObj.promise.configure');
				return promiseObj.promise;
			};
			return promiseObj.promise;
		};
		if(property===null) return resultFunc(...funcArgs);
		else return resultFunc;
	},
	actionResultTypes: {
		value: 1
	},
	proxyInterfaceGetPromiseAction: function(promiseObj){
		var { getObj:{ interfaceObj }, callConfig, property, isConstructor, args, resolve, reject } = promiseObj;
		console.log("proxyInterfaceGetPromiseAction",{ property, isConstructor, args });
		var interfaceID = interfaceObj.options.id || 0;
		var actionID = ++this.proxyCom.promiseActionID;
		var returnEventName = 'proxyInterfaceGetActionReply:'+interfaceID+':'+actionID;
		this.proxyCom.transport.send("proxyInterfaceGetAction",{
			returnEventName, interfaceID, actionID, property, isConstructor, args
		});
		this.proxyCom.transport.once(returnEventName,(actionData)=>{
			var { error, resultType, result } = actionData;
			if(error) return reject(error);
			if(resultType===this.actionResultTypes.value) return resolve({ resultType:'value', value:result });
		});
	},
	initProxyTargetListener: function(){
		this.proxyCom.transport.on('proxyInterfaceGetAction',(...args)=>this.proxyTargetAction(...args));
	},
	// TODO: maybe move most of this into proxyCom, and have data handling (such as proxyTargetAction and proxyInterfaceGetPromiseAction) in a different module
	proxyTargetAction: function(actionData){
		var { returnEventName, interfaceID, actionID, property, isConstructor, args } = actionData;
		var basePromise = this.proxyCom.proxyTargetReadyPromise;
		if(interfaceID===0){
			basePromise.then(()=>{
				var proxyTarget = this.proxyCom.proxyTarget;
				if(!(property in proxyTarget)) return this.proxyCom.transport.send(returnEventName,{
					error: "Property does not exist on proxyTarget"
				});
				var result = null;
				if(_.isFunction(proxyTarget[property])){
					if(isConstructor) result = new proxyTarget[property](...args);
					else result = proxyTarget[property](...args);
					// do same checks for 'result' as we are doing below
				}
				else if(_.isString(proxyTarget[property])) result = proxyTarget[property];
				else if(_.isNumber(proxyTarget[property])) result = proxyTarget[property];
				else if(proxyTarget[property]===null) result = proxyTarget[property];
				else if(proxyTarget[property]===void 0) result = proxyTarget[property];
				else if(_.isObject(proxyTarget[property])){
					// do scan for non-basic values. if all basic (such that it can be JSON stringified and parsed without any data loss), then simply have result as the object. otherwise, create a new proxy interface on client, and a new proxy target here on host
					result = proxyTarget[property];
				}
				else return this.proxyCom.transport.send(returnEventName,{
					error: "Invalid property on proxyTarget"
				});
				this.proxyCom.transport.send(returnEventName,{
					resultType: this.actionResultTypes.value,
					result: result
				});
			});
		}
	}
};
