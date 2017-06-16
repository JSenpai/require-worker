/* global exports, Promise */
"use strict";

var exportsProto = {
	aProtoProperty: "Hi"
};

module.exports = exports = Object.create(exportsProto);

exports.destroyHost = ()=>{
	require('../')(exports)._destroy();
};

exports.promiseNeverFinish = ()=>{
	return new Promise((resolve,reject)=>{ });
};

exports.promiseResolve = ()=>{
	return Promise.resolve();
};

exports.promiseReject = ()=>{
	return Promise.reject();
};

exports.promiseResolveDelayed = (timeout)=>{
	return new Promise((resolve,reject)=>{
		setTimeout(resolve,timeout);
	});
};

exports.promiseResolveValue = (value)=>{
	return Promise.resolve(value);
};

exports.promiseRejectValue = (value)=>{
	return Promise.reject(value);
};

exports.undefinedData = void 0;

exports.nullData = null;

exports.regexNumberOnly = /^[0-9]{1,}(\.[0-9]{1,}){0,1}$/;

exports.dateData = new Date("2000-01-01T00:00:00.000Z");

exports.NaNData = global.NaN;

exports.stringData = 'bar';

exports.numberData = 42;

exports.hello = (arg)=>{
	return 'Hello '+arg+'!';
};

exports.someObject = {
	name: 'Tree',
	type: 'Oak',
	age: '25y7m4d',
	height: '6.8m'
};

const promisify = require('util').promisify;
if (promisify && promisify.custom) {
	
	exports.somePromisifiableFunction = (cb)=>{
		setTimeout(()=>cb('success'),10);
	};
	exports.somePromisifiableFunction[promisify.custom] = ()=>{
		return new Promise((resolve,reject)=>{
			exports.somePromisifiableFunction(resolve);
		});
	};
	
} else {
	exports.somePromisifiableFunction = false;
}
