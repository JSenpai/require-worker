/* global exports, Promise */
"use strict";

const path = require('path');
const eventEmitter = require('events');

const _ = require('./underscore-with-mixins');
const proxyCom = require('./proxy-communication');
const ipcTransport = require('./ipc-transport');

exports.__filename = __filename;

var requireWorkerObj = null;
exports.setRequireWorker = (obj)=>{ requireWorkerObj = obj; };

const hostsMap = exports.hostsMap = new Map();
const host = exports.requireWorkerHost = function requireWorkerHost({ transport, ipcTransportID, file }){
	var self = this;
	if(transport!=='ipcTransport') throw Error("Invalid transport, only ipcTransport is currently implemented");
	self.events = new eventEmitter();
	self.ipcTransport = ipcTransport.create({
		id: ipcTransportID,
		parent: true
	});
	self.proxyCom = proxyCom.create({
		transport: { type:'ipcTransport', instance:self.ipcTransport },
		requireWorkerHost: self
	});
	var requireError;
	self.proxyCom.transport.once('client._destroy',()=>{
		this._destroy();
	});
	self.proxyCom.connectTransportHost(()=>{
		if(requireError){
			self.proxyCom.transport.send("requireState",_.pick(requireError,['message','stack']));
		} else {
			self.proxyCom.transport.send("requireState");
			self.proxyCom.setProxyTarget(self.exports);
		}
	});
	try{
		self.file = require.resolve(file);
		hostsMap.set(require.resolve(file),self);
	}catch(err){}
	try{
		self.exports = require(file);
		hostsMap.set(self.exports,self);
	}catch(err){
		requireError = err;
	}
	return this;
};

host.prototype = {
	_destroy: function(){
		if(this._destroyed || this._destroying) return;
		this._destroying = true;
		this.proxyCom.dataHandler._preDestroy();
		this.proxyCom._preDestroy();
		if(this.proxyCom && this.proxyCom.transport && this.proxyCom.transport.send) this.proxyCom.transport.send('host._destroy'); // after preDestroy
		setImmediate(()=>{
			if(hostsMap.has(this.exports) && requireWorkerObj.coreClient.clientsMap.get(this.exports)===this) requireWorkerObj.coreClient.clientsMap.delete(this.exports);
			if(this.file && requireWorkerObj.coreClient.clientsMap.has(this.file) && requireWorkerObj.coreClient.clientsMap.get(this.file)===this) requireWorkerObj.coreClient.clientsMap.delete(this.file);
			var proxyCom = this.proxyCom;
			this.events.removeAllListeners();
			this.proxyCom._destroy(true);
			for(var key in ['events','ipcTransport','proxyCom','exports']){
				try{ delete this[key]; }catch(err){}
			}
			this._destroyed = true;
		});
	}
};
