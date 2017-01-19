/* global exports, Promise */
"use strict";

const eventEmitter = require('events');
const _ = require('./underscore-with-mixins');

exports.create = (...args)=>{
	return new ipcTransport(...args);
};

const ipcTransport = function(options={}){
	if(!('id' in options) || (options.id+'').length===0) options.id = _.uniqueId('ipcTransport-');
	this.id = options.id;
	this.events = new eventEmitter();
	if('child' in options) this.setChild(options.child);
	else if('parent' in options && options.parent===true) this.setParent();
	return this;
};

ipcTransport.prototype = {
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
		child.on('message',([id,...data])=>{
			if(id===this.id){
				//console.log('child message:',id,...data);
				this.events.emit('message',...data);
			}
		});
		child.on('disconnect',()=>this.disconnectEvent());
	},
	sendChildMessage: function(...data){
		if(this.disconnected) return false;
		this.child.send([this.id,...data]);
		return true;
	},
	setParent: function(){
		this.mode = this.MODES.PARENT;
		process.on('message',([id,...data])=>{
			if(id===this.id){
				//console.log('parent message:',id,...data);
				this.events.emit('message',...data);
			}
		});
		process.on('disconnect',()=>this.disconnectEvent());
	},
	sendParentMessage: function(...data){
		if(this.disconnected) return false;
		process.send([this.id,...data]);
		return true;
	},
	disconnectEvent: function(){
		if(this.disconnected) return;
		this.disconnected = true;
		console.log('ipcTransport disconnectEvent',(this.mode===this.MODES.PARENT?'parent':'child'));
		this.events.emit('disconnect');
		if(this.mode===this.MODES.PARENT) process.exit(1);
	},
	disconnect: function(){
		console.log('ipcTransport disconnect');
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
