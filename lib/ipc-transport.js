/* global exports, Promise */
"use strict";

const eventEmitter = require('events');
const _ = require('./underscore-with-mixins');

exports.create = (...args)=>{
	return new ipcTransport(...args);
};

const ipcTransport = exports.ipcTransport = function(options={}){
	if(!('id' in options) || (options.id+'').length===0) options.id = _.uniqueId('ipcTransport-');
	this.id = options.id;
	this.events = new eventEmitter();
	if('child' in options) this.setChild(options.child);
	else if('parent' in options && options.parent===true) this.setParent();
	return this;
};

ipcTransport.prototype = {
	_destroy: function(){
		if(this._destroyed) return;
		this.events.removeAllListeners();
		if(this.childOnMessageListener) this.child.removeListener('message',this.childOnMessageListener);
		if(this.childOnDisconnectListener) this.child.removeListener('disconnect',this.childOnDisconnectListener);
		if(this.processOnMessageListener) process.removeListener('message',this.processOnMessageListener);
		if(this.processOnDisconnectListener) process.removeListener('disconnect',this.processOnDisconnectListener);
		for(var key in ['events','child','messageEventEmitter']){
			try{ delete this[key]; }catch(err){}
		}
		this.send = this.createMessageEventEmitter = ()=>{ throw Error("ipcTransport has been destroyed"); };
		this._destroyed = true;
	},
	MODES: {
		PARENT: 1,
		CHILD: 2
	},
	send: function(...data){
		if(this.mode===this.MODES.CHILD){
			this.sendChildMessage(...data);
		} else if(this.mode===this.MODES.PARENT){
			this.sendParentMessage(...data);
		} else {
			throw Error("IPC child/parent not set");
		}
	},
	setChild: function(child){
		this.mode = this.MODES.CHILD;
		this.child = child;
		this.childOnMessageListener = ([id,...data])=>{
			if(id===this.id) this.events.emit('message',...data);
		};
		this.childOnDisconnectListener = ()=>this.disconnectEvent();
		child.on('message',this.childOnMessageListener);
		child.on('disconnect',this.childOnDisconnectListener);
	},
	sendChildMessage: function(...data){
		if(this.disconnected) return false;
		this.child.send([this.id,...data]);
		return true;
	},
	setParent: function(){
		this.mode = this.MODES.PARENT;
		this.processOnMessageListener = ([id,...data])=>{
			if(id===this.id) this.events.emit('message',...data);
		};
		this.processOnDisconnectListener = ()=>this.disconnectEvent();
		process.on('message',this.processOnMessageListener);
		process.on('disconnect',this.processOnDisconnectListener);
	},
	sendParentMessage: function(...data){
		if(this.disconnected) return false;
		process.send([this.id,...data]);
		return true;
	},
	disconnectEvent: function(){
		if(this.disconnected) return;
		this.disconnected = true;
		//console.log('ipcTransport disconnectEvent',(this.mode===this.MODES.PARENT?'parent':'child'));
		this.events.emit('disconnect');
		if(this.mode===this.MODES.PARENT) process.exit(1);
	},
	disconnect: function(){
		//console.log('ipcTransport disconnect');
		if(this.mode===this.MODES.CHILD){
			if(!this.disconnected && this.child.connected) this.child.disconnect();
		}
		if(this.mode===this.MODES.PARENT){
			if(!this.disconnected) process.disconnect();
		}
	},
	createMessageEventEmitter: function(){
		if(this.messageEventEmitter) return this.messageEventEmitter;
		var events = this.messageEventEmitter = new eventEmitter();
		this.events.on('message',(eventName,...data)=>{
			events.emit(eventName,...data);
		});
		events.send = (eventName,...data)=>this.send(eventName,...data);
		return events;
	}
};
