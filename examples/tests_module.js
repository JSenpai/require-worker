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

exports.someArray = [ 1, 2, 3, 55, 'hello', 66, 1337 ];

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

exports.instantCallback = (cb,...args)=>{
	cb(...args);
	return 42;
};

exports.timedCallback = (cb,...args)=>{
	setTimeout(()=>cb(...args),10);
	return 'foo';
};

exports.multipleCallbacks = (...cb)=>{
	for(var i=0,l=cb.length; i<l; i++){
		cb[i](i);
	}
	return 'bar';
};

exports.multiCallsCallback = (cb,times)=>{
	for(var i=0; i<times; i++) cb(i);
	return true;
};

exports.causeUncaughtException = ()=>{
	var theUncaughtException = void 0;
	setTimeout(()=>theUncaughtException());
};

exports.createRecursiveRequireWorkerTree = (depth)=>{
	var requireWorker = require('../'), rwClient;
	try{
		rwClient = requireWorker.require(__filename,{ returnClient:true });
	}catch(err){
		return Promise.reject(err.message);
	}
	return rwClient.readyPromise.then(({ proxy })=>{
		if(depth<=0) return true;
		return proxy.createRecursiveRequireWorkerTree(--depth).configure({ promiseResult:true });
	})
	.then((result)=>{
		return rwClient.destroy().then(()=>result);
	});
};
