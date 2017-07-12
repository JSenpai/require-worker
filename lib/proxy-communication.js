/* global exports, Promise */
"use strict";

const eventEmitter = require('events');
const _ = require('./underscore-with-mixins');
const proxyConstructor = require('./proxy-constructor');
const proxyHandler = require('./proxy-handler');

const noOp = ()=>{};
const frozenNullObject = Object.freeze(Object.create(null));

exports.create = (...args)=>{
	return new proxyCom(...args);
};

const proxyCom = exports.proxyCom = class proxyCom {
	
	constructor(options = {}) {
		if (!('transport' in options)) throw Error("transport option is required");
		if (options.transport.type !== 'ipcTransport') throw Error("Invalid transport, only ipcTransport is currently implemented");
		if (!('instance' in options.transport)) throw Error("transport instance option is required");
		if ('requireWorkerClient' in options) this.requireWorkerClient = options.requireWorkerClient;
		if ('requireWorkerHost' in options) this.requireWorkerHost = options.requireWorkerHost;
		this.setTransport(options.transport.type, options.transport.instance);
		this.events = new eventEmitter();
		this.proxyMainInterfaceReady = false;
		this.proxyTargetReady = false;
		this.promiseActionID = 0;
		this.proxyMap = new Map();
		this.proxyConstructor = proxyConstructor.create(this);
		this.proxyHandler = proxyHandler.create(this);
	}
	
	_preDestroy() {
		if (this._preDestroyed) return;
		var destroyError = ()=>{
			var err = Error("proxyCom has been destroyed");
			err.code = 'DESTROYED';
			throw err;
		};
		this.createProxy = destroyError;
		this._preDestroyed = true;
	}
	
	_destroy() {
		if (this._destroyed || this._destroying) return;
		this._destroying = true;
		if (this.transport && this.transport.send) this.transport.send('proxyCom._destroy');
		this.proxyConstructor._preDestroy();
		this.proxyHandler._preDestroy();
		this._preDestroy();
		setImmediate(()=>{
			this.proxyConstructor._destroy();
			this.proxyHandler._destroy();
			this.events.removeAllListeners();
			if (this.transportType === 'ipcTransport') this.transportInstance._destroy();
			this.proxyMap.clear();
			for (var key in ['events', 'proxyMap', 'proxyConstructor', 'proxyHandler', 'client']) {
				try { delete this[key]; } catch (err) {}
			}
			this._destroyed = true;
		});
	}
	
	setTransport(type, transport) {
		this.transportType = type;
		if (type === 'ipcTransport') {
			this.transportInstance = transport;
			this.transport = transport.createMessageEventEmitter();
			this.transport.once('proxyCom._destroy', ()=>{
				this._destroy();
			});
		}
	}
	
	initClientConnectionToHost(onReady) {
		return this.clientConnectionToHostPromise = new Promise((resolve, reject)=>{
			this.transport.once('isReady!', ()=>this.events.emit('clientConnectionToHost:ready'));
			this.transport.once('isReady?', ()=>this.transport.send('isReady!'));
			this.events.once('clientConnectionToHost:ready', ()=>{
				if (this.proxyMainInterfaceReady) return;
				this.proxyMainInterfaceReady = true;
				this.transport.removeAllListeners('isReady?');
				this.transport.removeAllListeners('isReady!');
				resolve();
			});
			this.transport.send('isReady?');
		});
	}
	
	initHostConnectionToClient() {
		var isReady = false;
		this.transport.once('isReady!', ()=>{
			this.transport.send('isReady!');
			this.transport.removeAllListeners('isReady?');
			this.transport.removeAllListeners('isReady!');
			isReady = true;
			this.events.emit('hostConnectionToClient:connection:ready');
		});
		this.transport.once('isReady?',()=>this.transport.send('isReady!'));
		this.transport.send('isReady?');
		this.transport.on('proxyAction', (...args)=>this.proxyHandler.onProxyAction(...args));
		this.proxyTargetReadyPromise = new Promise((resolve, reject)=>{
			if (this.proxyTargetReady) return resolve();
			this.events.once('hostConnectionToClient:proxyTarget:ready',resolve);
		});
		return new Promise((resolve,reject)=>{
			if (isReady) return resolve();
			this.events.once('hostConnectionToClient:connection:ready',resolve);
		});
	}
	
	setProxyTarget(target) {
		if (this.proxyTargetReady) return;
		this.proxyTargetReady = true;
		this.proxyTarget = target;
		this.events.emit('hostConnectionToClient:proxyTarget:ready');
	}
	
	createProxy(options = {}){
		return this.proxyConstructor.createProxyInterface(_.extend(_.extend({}, options), { basePromise: this.clientConnectionToHostPromise }));
	}
	
};
