/* global exports, Promise, Function */
"use strict";

const __ = require('underscore');

// A down-side is that _ becomes an object and can not be used as a function like _(args), instead use _.chain(args)
const _ = module.exports = exports = Object.create(__);

// These mixins are made specificaly for Node.js and the require-worker module
const mixins = {
	isPromise: (obj)=>{
		return Promise.resolve(obj)===obj;
	},
	isConstructed: (obj,target)=>{
		if(!target) return !!(obj && __.isObject(obj) && 'constructor' in obj && obj.constructor!==Object && obj.constructor!==Function);
		else return !!(obj && __.isObject(obj) && 'constructor' in obj && (obj.constructor===target || obj.constructor instanceof target));
	},
	isStream: (obj)=>{
		let stream = mixins.isStream.stream = mixins.isStream.stream || require('stream');
		return (obj instanceof stream.Stream);
	},
	isEventEmitter: (obj)=>{
		let eventEmitter = mixins.isEventEmitter.eventEmitter = mixins.isEventEmitter.eventEmitter || require('events');
		return (obj instanceof eventEmitter);
	},
	deepExtend: (dest,...source)=>{
		for(var i=0,l=source.length; i<l; i++){
			if(__.isArray(source[i])) for(var j=0,k=source[i].length; j<k; j++){
				var val = source[i][j];
				if(__.isArray(val)) dest.push(mixins.deepExtend([],val));
				else if(__.isObject(val)) dest.push(mixins.deepExtend({},val));
				else dest.push(val);
			}
			else if(__.isObject(source[i])) for(var key in source[i]){
				var val = source[i][key];
				if(__.isArray(val)) dest[key] = mixins.deepExtend([],val);
				else if(__.isObject(val)) dest[key] = mixins.deepExtend({},val);
				else dest[key] = val;
			}
		}
		return dest;
	}
};

// Do not use underscore's _.mixin;
// We do not want these mixins on the underscore object itself.
const _mixin = (obj)=>{
	__.each(__.functions(obj),(name)=>{
		_[name] = obj[name];
	});
};
_mixin(mixins);

// Disable some methods
_.mixin = ()=>{ throw Error("_.mixin is disabled"); };
_.noConflict = ()=>{ throw Error("_.noConflict is disabled"); };
