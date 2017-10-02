/* global exports, Promise */
"use strict";

const eventEmitter = require('events');

const _ = require('./underscore-with-mixins');
const proxyCom = require('./proxy-communication');
const ipcTransport = require('./ipc-transport');

exports.__filename = __filename;

var requireWorkerObj = null;
exports.setRequireWorker = (obj)=>{
	requireWorkerObj = obj;
};

const hostsMap = exports.hostsMap = new Map();

const requireWorkerHost = exports.requireWorkerHost = class requireWorkerHost {
	
	constructor({ transport, ipcTransportID, file }) {
		if (transport !== 'ipcTransport') throw Error("Invalid transport, only ipcTransport is currently implemented");
		this.events = new eventEmitter();
		this.ipcTransport = ipcTransport.create({
			id: ipcTransportID,
			parent: true
		});
		this.proxyCom = proxyCom.create({
			transport: {type: 'ipcTransport', instance: this.ipcTransport},
			requireWorkerHost: this
		});
		this.proxyCom.transport.once('client._destroy',()=>this._destroy());
		try {
			this.file = require.resolve(file);
			hostsMap.set(require.resolve(file), this);
		} catch (err) {}
		this.proxyCom.initHostConnectionToClient()
		.then(()=>{
			return Promise.resolve()
			.then(function requireWorkerHost_require(){
				return require(file);
			})
			.catch((err)=>{
				let pos = err.stack.indexOf('at requireWorkerHost_require');
				if(pos!==-1) err.stack = err.stack.substr(0,pos)+'at requireWorker';
				if(err.message.indexOf('Cannot find module')===0) err.code = 'MODULE_NOT_FOUND';
				return Promise.reject(err);
			})
			.then((requireExports)=>{
				this.exports = requireExports;
				hostsMap.set(this.exports, this);
			});
		})
		.then(()=>{
			this.proxyCom.transport.send("requireState");
			this.proxyCom.setProxyTarget(this.exports);
		})
		.catch((err)=>{
			this.proxyCom.transport.send("requireState", _.pick(err, ['message', 'stack', 'code']));
		});
	}
	
	_destroy(){
		if (this._destroyed || this._destroying) return;
		this.events.emit('destroy');
		this._destroying = true;
		this.proxyCom.proxyConstructor._preDestroy();
		this.proxyCom.proxyHandler._preDestroy();
		this.proxyCom._preDestroy();
		if (this.proxyCom && this.proxyCom.transport && this.proxyCom.transport.send) this.proxyCom.transport.send('host._destroy'); // after preDestroy
		setImmediate(()=>{
			if (hostsMap.has(this.exports) && requireWorkerObj.coreClient.clientsMap.get(this.exports) === this) requireWorkerObj.coreClient.clientsMap.delete(this.exports);
			if (this.file && requireWorkerObj.coreClient.clientsMap.has(this.file) && requireWorkerObj.coreClient.clientsMap.get(this.file) === this) requireWorkerObj.coreClient.clientsMap.delete(this.file);
			this.proxyCom._destroy(true);
			let oldEvents = this.events;
			let clearKeys = ['events', 'ipcTransport', 'proxyCom', 'exports'];
			for (var i in clearKeys) try { this[clearKeys[i]] = void 0; } catch (err) {}
			this._destroyed = true;
			this._destroying = false;
			let destroyedListeners = oldEvents.listeners('destroyed');
			oldEvents.removeAllListeners();
			for(var i=0,l=destroyedListeners.length; i<l; i++) destroyedListeners[i].call(oldEvents);
		});
	}
	
	destroy() {
		return new Promise((resolve,reject)=>{
			this.events.once('destroyed',resolve);
			this._destroy();
		});
	}
	
};

exports.initHostProcess = ({ ipcTransportID })=>{
	process.setMaxListeners(1000);
	var transport = ipcTransport.create({
		id: ipcTransportID,
		parent: true
	});
	var transportEvents = transport.createMessageEventEmitter();
	transportEvents.on('processReady?', ()=>{
		transportEvents.send('processReady!');
	});
	transportEvents.on('requireHost', (hostOptions)=>{
		new requireWorkerHost(hostOptions);
	});
	transportEvents.send('processReady!');
	process.on('uncaughtException', (err) => {
		try{
			for(var host of hostsMap.values()){
				try{
					if(host.proxyCom && host.proxyCom.transport){
						host.proxyCom.transport.send("uncaughtException", _.pick(err, ['message', 'stack', 'code']));
					}
				}catch(err3){}
			}
		}catch(err2){
			console.error('Error during uncaughtException listener:',err2);
			console.error('requireWorkerHost Uncaught Exception:',err);
		}
		process.exit(1);
	});
	process.on('SIGHUP',()=>{});
	process.on('SIGINT',()=>{});
	process.on('SIGTERM',()=>{});
};
