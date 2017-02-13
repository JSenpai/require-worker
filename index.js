/* global process, require, __filename, __dirname, Promise */
"use strict";

const path = require('path');
const childProcess = require('child_process');
const eventEmitter = require('events');

const _ = require(path.resolve(__dirname,'./lib/underscore-with-mixins'));
const proxyCom = require(path.resolve(__dirname,'./lib/proxy-communication'));
const ipcTransport = require(path.resolve(__dirname,'./lib/ipc-transport'));
const coreClient = require(path.resolve(__dirname,'./lib/core-client'));
const coreHost = require(path.resolve(__dirname,'./lib/core-host'));

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

var requireWorkerObj = { exports, coreClient, coreHost };
coreClient.setRequireWorker(requireWorkerObj);
exports.coreClient = coreClient;
coreHost.setRequireWorker(requireWorkerObj);
exports.coreHost = coreHost;

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

const rwPreparedProcessMap = new Map();
exports.getPreparedProcessesCount = ()=>{
	return rwPreparedProcessMap.size;
};
exports.prepareProcesses = (options={ count:1, forkOptions:{} })=>{
	for(var i=0,l=options.count; i<l; i++){
		var rwPObj = rwCreateProcess(_.omit(options,['count']));
		rwPObj.preparedProcess = true;
		rwPreparedProcessMap.set(rwPObj.child,rwPObj);
	}
	return true;
};
exports.destroyPreparedProcesses = ()=>{
	for(var [key,obj] of rwPreparedProcessMap){
		obj.child.unref();
		obj.child.kill();
		rwPreparedProcessMap.delete(key);
	}
	return true;
};
var rwProcessIndex = 0;
const rwCreateProcess = (options={ forkOptions:{} })=>{
	var rwPObj = { id:'require-worker:process:'+(++rwProcessIndex)+':'+Date.now() };
	rwPObj.ipcTransport = ipcTransport.create({ id:rwPObj.id });
	if(!('forkOptions' in options)) options.forkOptions = {};
	if(!('cwd' in options.forkOptions)) options.forkOptions.cwd = process.cwd();
	//var processArgv = _.clone(process.execArgv);
	//if(process.execArgv.indexOf('--inspect')!==-1) process.execArgv.splice(process.execArgv.indexOf('--inspect'),1);
	rwPObj.child = childProcess.fork(__filename,['--rwProcess',rwPObj.id],options.forkOptions);
	//process.execArgv = processArgv;
	rwPObj.ipcTransport.setChild(rwPObj.child);
	return rwPObj;
};

const rwProcessMap = requireWorkerObj.rwProcessMap = new Map();
const rwProcess = requireWorkerObj.rwProcess = (options={})=>{
	var client = options.client;
	var ownProcess = !!client.options.ownProcess;
	var shareProcess = client.options.shareProcess;
	if(!client) return Promise.reject();
	var createNewProcess = (rwProcessMap.size===0 || ownProcess);
	var useExistingObj = null;
	if(!createNewProcess){
		createNewProcess = true;
		for(var [key,obj] of rwProcessMap){
			if(shareProcess && (shareProcess===obj.client || shareProcess===obj.client.proxy || shareProcess===key)){
				createNewProcess = false;
				useExistingObj = obj;
				break;
			}
			if(!shareProcess && !obj.ownProcess){
				createNewProcess = false;
				useExistingObj = obj;
				break;
			}
		}
		if(shareProcess && !useExistingObj) throw Error("Existing require-worker process could not be found, set shareProcess to a client object, client proxy, or a process child");
	}
	if(createNewProcess){
		var rwPObj, preparedProcess = false;
		if(!('forkOptions' in client.options)) client.options.forkOptions = {};
		if(!('cwd' in client.options.forkOptions)){
			for(var [key,obj] of rwPreparedProcessMap){
				if(obj.preparedProcess && !preparedProcess){
					preparedProcess = obj;
					rwPreparedProcessMap.delete(key);
					break;
				}
			}
		}
		if(preparedProcess) rwPObj = preparedProcess;
		else rwPObj = rwCreateProcess({ forkOptions:client.options.forkOptions });
		rwPObj.ownProcess = ownProcess;
		rwPObj.client = client;
		client.child = rwPObj.child;
		rwProcessMap.set(rwPObj.child,rwPObj);
		rwProcessMap.set(client,rwPObj);
		return rwPObj;
	} else {
		var rwPObj = _.clone(useExistingObj);
		rwPObj.client = client;
		client.child = rwPObj.child;
		rwProcessMap.set(client,rwPObj);
		return rwPObj;
	}
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
