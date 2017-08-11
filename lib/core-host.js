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
		var requireError;
		this.proxyCom.transport.once('client._destroy',()=>{
			this._destroy();
		});
		this.proxyCom.initHostConnectionToClient()
		.then(()=>{
			if (requireError) return Promise.reject(requireError);
			this.proxyCom.transport.send("requireState");
			this.proxyCom.setProxyTarget(this.exports);
		})
		.catch((err)=>{
			this.proxyCom.transport.send("requireState", _.pick(err, ['message', 'stack']));
		});
		try {
			this.file = require.resolve(file);
			hostsMap.set(require.resolve(file), this);
		} catch (err) {}
		try {
			this.exports = require(file);
			hostsMap.set(this.exports, this);
		} catch (err) {
			requireError = err;
		}
	}
	
	_destroy(){
		if (this._destroyed || this._destroying) return;
		this._destroying = true;
		this.proxyCom.proxyConstructor._preDestroy();
		this.proxyCom.proxyHandler._preDestroy();
		this.proxyCom._preDestroy();
		if (this.proxyCom && this.proxyCom.transport && this.proxyCom.transport.send) this.proxyCom.transport.send('host._destroy'); // after preDestroy
		setImmediate(()=>{
			if (hostsMap.has(this.exports) && requireWorkerObj.coreClient.clientsMap.get(this.exports) === this) requireWorkerObj.coreClient.clientsMap.delete(this.exports);
			if (this.file && requireWorkerObj.coreClient.clientsMap.has(this.file) && requireWorkerObj.coreClient.clientsMap.get(this.file) === this) requireWorkerObj.coreClient.clientsMap.delete(this.file);
			var proxyCom = this.proxyCom;
			this.events.removeAllListeners();
			this.proxyCom._destroy(true);
			for (var key in ['events', 'ipcTransport', 'proxyCom', 'exports']) {
				try { this[key] = void 0; } catch (err) {}
			}
			this._destroyed = true;
		});
	}
	
	destroy(){
		this._destroy();
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
};
