/* global exports, Promise */
"use strict";

const eventEmitter = require('events');
const _ = require('./underscore-with-mixins');

exports.create = (...args)=>{
	return new ipcTransport(...args);
};

const transportModes = {
	PARENT: 1,
	CHILD: 2
};

const ipcTransport = exports.ipcTransport = class ipcTransport {
	
	constructor(options = {}) {
		this.DEBUG = !!options.DEBUG;
		if (!('id' in options) || (options.id + '').length === 0) options.id = _.uniqueId('ipcTransport-');
		this.id = options.id;
		this.events = new eventEmitter();
		if ('child' in options) this.setChild(options.child);
		else if ('parent' in options && options.parent === true) this.setParent();
		return this;
	}
	
	_destroy() {
		if (this._destroyed || this._destroying) return;
		this._destroying = true;
		this.send = this.createMessageEventEmitter = ()=> {
			var err = Error("ipcTransport has been destroyed");
			err.code = 'DESTROYED';
			throw err;
		};
		setImmediate(()=> {
			this.events.removeAllListeners();
			if (this.childOnMessageListener) this.child.removeListener('message', this.childOnMessageListener);
			if (this.childOnDisconnectListener) this.child.removeListener('disconnect', this.childOnDisconnectListener);
			if (this.processOnMessageListener) process.removeListener('message', this.processOnMessageListener);
			if (this.processOnDisconnectListener) process.removeListener('disconnect', this.processOnDisconnectListener);
			for (var key in ['events', 'child', 'messageEventEmitter']) {
				try { delete this[key]; } catch (err) {}
			}
			this._destroyed = true;
		});
	}
	
	send(...data) {
		if (this.mode === transportModes.CHILD) {
			this.sendChildMessage(...data);
		} else if (this.mode === transportModes.PARENT) {
			this.sendParentMessage(...data);
		} else {
			throw Error("IPC child/parent not set");
		}
	}
	
	setChild(child) {
		this.mode = transportModes.CHILD;
		this.child = child;
		this.childOnMessageListener = ([id, ...data])=>{
			if (id === this.id)	this.events.emit('message', ...data);
		};
		this.childOnDisconnectListener = ()=>this.disconnectEvent();
		child.on('message', this.childOnMessageListener);
		child.on('disconnect', this.childOnDisconnectListener);
	}
	
	sendChildMessage(...data) {
		if(this.DEBUG) console.log('CHILD:',...data);
		if (this.disconnected) return false;
		this.child.send([this.id, ...data]);
		return true;
	}
	
	setParent() {
		this.mode = transportModes.PARENT;
		this.processOnMessageListener = ([id, ...data])=>{
			if (id === this.id) this.events.emit('message', ...data);
		};
		this.processOnDisconnectListener = ()=>this.disconnectEvent();
		process.on('message', this.processOnMessageListener);
		process.on('disconnect', this.processOnDisconnectListener);
	}
	
	sendParentMessage(...data) {
		if(this.DEBUG) console.log('PARENT:',...data);
		if (this.disconnected) return false;
		process.send([this.id, ...data]);
		return true;
	}
	
	disconnectEvent() {
		if (this.disconnected) return;
		this.disconnected = true;
		//console.log('ipcTransport disconnectEvent',(this.mode===transportModes.PARENT?'parent':'child'));
		this.events.emit('disconnect');
		if (this.mode === transportModes.PARENT) process.exit(1);
	}
	
	disconnect() {
		//console.log('ipcTransport disconnect');
		if (this.mode === transportModes.CHILD) {
			if (!this.disconnected && this.child.connected) this.child.disconnect();
		}
		if (this.mode === transportModes.PARENT) {
			if (!this.disconnected) process.disconnect();
		}
	}
	
	createMessageEventEmitter() {
		if (this.messageEventEmitter) return this.messageEventEmitter;
		var events = this.messageEventEmitter = new eventEmitter();
		this.events.on('message', (eventName, ...data)=>{
			events.emit(eventName, ...data);
		});
		events.send = (eventName, ...data)=>this.send(eventName, ...data);
		return events;
	}
	
};
