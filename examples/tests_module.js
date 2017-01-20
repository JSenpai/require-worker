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

exports.stringData = 'bar';

exports.hello = (arg)=>{
	return 'Hello '+arg+'!';
};

exports.someObject = {
	name: 'Tree',
	type: 'Oak',
	age: '25y7m4d',
	height: '6.8m'
};
