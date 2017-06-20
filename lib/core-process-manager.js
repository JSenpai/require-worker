/* global exports, Promise */
"use strict";

const childProcess = require('child_process');

const _ = require('./underscore-with-mixins');
const ipcTransport = require('./ipc-transport');

exports.__filename = __filename;

var requireWorkerObj = null;
exports.setRequireWorker = (obj)=>{ requireWorkerObj = obj; };

var rwProcessIndex = 0;
const preparedProcessMap = exports.processMap = new Map();
const processMap = exports.processMap = new Map();

exports.getPreparedProcessesCount = ()=>{
	return preparedProcessMap.size;
};

exports.prepareProcesses = (options={ count:1, forkOptions:{} })=>{
	for(var i=0,l=options.count; i<l; i++){
		var rwPObj = createProcess(_.omit(options,['count']));
		rwPObj.preparedProcess = true;
		preparedProcessMap.set(rwPObj.child,rwPObj);
	}
	return true;
};

exports.destroyPreparedProcesses = ()=>{
	for(var [key,obj] of preparedProcessMap){
		obj.child.unref();
		obj.child.kill();
		preparedProcessMap.delete(key);
	}
	return true;
};

const createProcess = (options={ forkOptions:{} })=>{
	var rwPObj = { id:'require-worker:process:'+(++rwProcessIndex)+':'+Date.now() };
	rwPObj.ipcTransport = ipcTransport.create({ id:rwPObj.id });
	if(!('forkOptions' in options)) options.forkOptions = {};
	if(!('cwd' in options.forkOptions)) options.forkOptions.cwd = process.cwd();
	if(!('execArgv' in options.forkOptions)) {
		let processArgv = _.clone(process.execArgv);
		// The following inspect argument removal exists due to address already in use error.
		// Create a github issue if you need to have child process inspection, so we can figure out a way to do it.
		let removeArgs = ['--inspect','--inspect-brk'];
		for(let i=0,l=removeArgs.length; i<l; i++){
			let pos = processArgv.indexOf(removeArgs[i]);
			if(pos!==-1) processArgv.splice(pos,1);
		}
		options.forkOptions.execArgv = processArgv;
	}
	// Create forked process
	rwPObj.child = childProcess.fork(requireWorkerObj.__filename,['--rwProcess',rwPObj.id],options.forkOptions);
	rwPObj.ipcTransport.setChild(rwPObj.child);
	return rwPObj;
};

exports.rwProcess = (options={})=>{
	var client = options.client;
	var ownProcess = !!client.options.ownProcess;
	var shareProcess = client.options.shareProcess;
	if(!client) return Promise.reject();
	var createNewProcess = (processMap.size===0 || ownProcess);
	var useExistingObj = null;
	if(!createNewProcess){
		createNewProcess = true;
		for(var [key,obj] of processMap){
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
			for(var [key,obj] of preparedProcessMap){
				if(obj.preparedProcess && !preparedProcess){
					preparedProcess = obj;
					preparedProcessMap.delete(key);
					break;
				}
			}
		}
		if(preparedProcess) rwPObj = preparedProcess;
		else rwPObj = createProcess({ forkOptions:client.options.forkOptions });
		rwPObj.ownProcess = ownProcess;
		rwPObj.client = client;
		client.child = rwPObj.child;
		processMap.set(rwPObj.child,rwPObj);
		processMap.set(client,rwPObj);
		return rwPObj;
	} else {
		var rwPObj = _.clone(useExistingObj);
		rwPObj.client = client;
		client.child = rwPObj.child;
		processMap.set(client,rwPObj);
		return rwPObj;
	}
};
