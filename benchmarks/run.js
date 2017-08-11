
const util = require('util');
const _ = require('../lib/underscore-with-mixins');
const requireWorker = require('../');

const benchmark = async (count,timeout,fn)=>{
	var i=0, timeStart = Date.now();
	if(count===null || count===0){
		while(true){
			var timeTick = Date.now();
			if(timeTick-timeStart>=timeout) break;
			i++;
			await fn();
		}
	}
	else {
		for(i=0;i<count;i++){
			var timeTick = Date.now();
			if(timeTick-timeStart>=timeout) break;
			await fn();
		}
	}
	var elapsedTime = Date.now()-timeStart;
	return {
		ranCount: i,
		elapsedTime: elapsedTime
	};
};

const formatBenchmarkCycleResult = (result)=>{
	var str = '  ';
	if(_.isObject(result)) result = util.inspect(result,{ colors:true }).replace(/^\{|\}$/g,'').trim();
	str += result;
	return str;
};

(async ()=>{
	
	console.log('# Creating main require-worker client');
	const testModuleFile = '../examples/tests_module';
	const rwClientPromise = requireWorker.require(testModuleFile,{ returnClientPromise:true });
	const rwClient = rwClientPromise.client;
	//rwClient.setChildReferenced(false);
	await rwClientPromise;
	
	// Benchmark fetching clients from cache upon duplicate client creation
	console.log('> Cached Clients');
	var benchCachedClients = (count,timeout)=>{
		return benchmark(count,timeout,()=>{
			return new Promise((resolve,reject)=>{
				requireWorker.require(testModuleFile,{ returnClientPromise:true, shareProcess:rwClient })
				.then((client)=>{
					client.destroy();
					resolve();
				})
				.catch((err)=>reject(err));
			});
		})
		.then((result)=>{ console.log(formatBenchmarkCycleResult(result)); return result; })
		.catch((err)=>{ console.error('-','ERROR',err); });
	};
	await benchCachedClients(0,1000);
	await benchCachedClients(0,1000);
	await benchCachedClients(0,1000);
	await benchCachedClients(0,1000);
	await benchCachedClients(0,1000);
	await benchCachedClients(0,1000);
	
	// Benchmark simple get string operation
	console.log('> Get String');
	var benchGetString = (count,timeout)=>{
		return benchmark(count,timeout,()=>{
			return new Promise((resolve,reject)=>{
				rwClient.proxy.stringData()
				.then(({value})=>resolve())
				.catch(reject);
			});
		})
		.then((result)=>{ console.log(formatBenchmarkCycleResult(result)); return result; })
		.catch((err)=>{ console.error('-','ERROR',err); });
	};
	await benchGetString(0,1000);
	await benchGetString(0,1000);
	await benchGetString(0,1000);
	await benchGetString(0,1000);
	await benchGetString(0,1000);
	await benchGetString(0,1000);
	
	// Benchmark simple set string operation
	console.log('> Set String');
	var benchSetString = (count,timeout)=>{
		return benchmark(count,timeout,()=>{
			return new Promise((resolve,reject)=>{
				rwClient.proxy.stringData('Set String Test')
				.then(({value})=>resolve())
				.catch(reject);
			});
		})
		.then((result)=>{ console.log(formatBenchmarkCycleResult(result)); return result; })
		.catch((err)=>{ console.error('-','ERROR',err); });
	};
	await benchSetString(0,1000);
	await benchSetString(0,1000);
	await benchSetString(0,1000);
	await benchSetString(0,1000);
	await benchSetString(0,1000);
	await benchSetString(0,1000);
	
	// Destroy Require-Worker Client
	rwClient.destroy();
	
})();

