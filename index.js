/* global process, require, __filename, __dirname, Promise */
"use strict";

const path = require('path');

const _ = require(path.resolve(__dirname,'./lib/underscore-with-mixins'));
const ipcTransport = require(path.resolve(__dirname,'./lib/ipc-transport'));
const coreClient = require(path.resolve(__dirname,'./lib/core-client'));
const coreHost = require(path.resolve(__dirname,'./lib/core-host'));
const coreProcessManager = require(path.resolve(__dirname,'./lib/core-process-manager'));

module.exports = exports = (target)=>{
	if(_.isObject(target) && 'constructor' in target && 'client' in target.constructor && target.constructor.client instanceof coreClient.requireWorkerClient){
		return target.constructor.client;
	}
	if(_.isString(target))try{ target = require.resolve(target); }catch(err){}
	if(coreHost.hostsMap.has(target)) return coreHost.hostsMap.get(target);
	if(coreClient.clientsMap.size===0 && coreHost.hostsMap.size>0) throw Error("first argument must be a valid require-worker host or file path");
	if(!coreClient.clientsMap.has(target)) throw Error("first argument must be a valid require-worker client or file path");
	return coreClient.clientsMap.get(target);
};

var requireWorkerObj = { exports, __filename, coreClient, coreHost, coreProcessManager };

coreClient.setRequireWorker(requireWorkerObj);
exports.coreClient = coreClient;

coreHost.setRequireWorker(requireWorkerObj);
exports.coreHost = coreHost;

coreProcessManager.setRequireWorker(requireWorkerObj);
exports.coreProcessManager = coreProcessManager;
exports.prepareProcesses = coreProcessManager.prepareProcesses;
exports.destroyPreparedProcesses = coreProcessManager.destroyPreparedProcesses;
exports.getPreparedProcessesCount = coreProcessManager.getPreparedProcessesCount;

exports.require = (path,options)=>new coreClient.requireWorkerClient(path,options);

requireWorkerObj.getStackFiles = function getStackFiles(){
	let opst = Error.prepareStackTrace, thisError, result = [];
	Error.prepareStackTrace = (errStackStr,cssfArr)=>cssfArr;
	thisError = new Error();
	Error.captureStackTrace(thisError,getStackFiles); // https://nodejs.org/api/errors.html#errors_new_error_message
	let cssfArr = thisError.stack;
	Error.prepareStackTrace = opst;
	for(let i=0,l=cssfArr.length; i<l; i++){
		let cssf = cssfArr[i]; // https://github.com/v8/v8/wiki/Stack-Trace-API
		let file = cssf.getFileName();
		if(file===__filename) continue;
		if(file===coreClient.__filename) continue;
		result.push(file);
	}
	return result; 
};

exports.preConfiguredProxy = (target,options)=>{
	var interfaceObj = null, client = null;
	var targetIsProxy = false;
	if(_.isObject(target) && 'constructor' in target && 'client' in target.constructor && target.constructor.client instanceof coreClient.requireWorkerClient) targetIsProxy = true;
	if(!targetIsProxy && _.isObject(target) && 'interfaceObj' in target && 'client' in target){
		interfaceObj = target.interfaceObj;
		client = target.client;
	} else {
		var targetIsPromise = !targetIsProxy && _.isPromise(target);
		for(var [key,val] of coreClient.clientsMap){
			if('proxyCom' in val && 'proxyMap' in val.proxyCom){
				if(val.proxyCom.proxyMap.has(target)){
					interfaceObj = val.proxyCom.proxyMap.get(target);
					client = val;
					break;
				} else if(targetIsPromise) {
					for(var [key2,val2] of val.proxyCom.proxyMap){
						if('promiseMap' in val2){
							if(val2.promiseMap.has(target)){ interfaceObj = val2; break; }
						}
					}
					if(interfaceObj){
						client = val;
						break;
					}
				}
			}
		}
	}
	if(!interfaceObj || !client) throw Error("Target not found");
	return client.proxyCom.createMainProxyInterface(_.deepExtend(_.deepExtend({},interfaceObj.options),{ preConfigure:options }));
};

const checkNewProcess = ()=>{
	if(require.main===module && process.argv.length===4 && process.argv[2]==='--rwProcess'){
		var ipcTransportID = process.argv[3];
		var transport = ipcTransport.create({
			id: ipcTransportID,
			parent: true
		});
		var transportEvents = transport.createMessageEventEmitter();
		transportEvents.on('processReady?',()=>{
			transportEvents.send('processReady!');
		});
		transportEvents.on('requireHost',(hostOptions)=>{
			new coreHost.requireWorkerHost(hostOptions);
		});
		transportEvents.send('processReady!');
	}
};

checkNewProcess();
