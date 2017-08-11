

var _ = require('../lib/underscore-with-mixins');
var requireWorker = require('../');

var testModuleFile = '../examples/tests_module';
var rwClient = requireWorker.require(testModuleFile,{ returnClient:true });;
//rwClient.setChildReferenced(false);

var benchmark = async (count,timeout,fn)=>{
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

(async ()=>{
	
	// Benchmark fetching clients from cache upon duplicate client creation
	console.log('Cached Clients');
	var benchCachedClients = (count,timeout)=>{
		return benchmark(count,timeout,()=>{
			return new Promise((resolve,reject)=>{
				var c = requireWorker.require(testModuleFile,{ returnClient:true, shareProcess:rwClient });
				c.events.once('error',(err)=>reject(err));
				c.events.once('requireSuccess',()=>{
					c.destroy();
					resolve();
				});
			});
		})
		.then((result)=>{ console.log(result); return result; })
		.catch((err)=>{ console.error('ERROR',err); });
	};
	await benchCachedClients(0,1000);
	await benchCachedClients(0,1000);
	await benchCachedClients(0,1000);
	await benchCachedClients(0,1000);
	await benchCachedClients(0,1000);
	await benchCachedClients(0,1000);
	
	// Benchmark simple get string operation
	console.log('Get String');
	var benchGetString = (count,timeout)=>{
		return benchmark(count,timeout,()=>{
			return new Promise((resolve,reject)=>{
				rwClient.proxy.stringData()
				.then(({value})=>resolve())
				.catch(reject);
			});
		})
		.then((result)=>{ console.log(result); return result; })
		.catch((err)=>{ console.error('ERROR',err); });
	};
	await benchGetString(0,1000);
	await benchGetString(0,1000);
	await benchGetString(0,1000);
	await benchGetString(0,1000);
	await benchGetString(0,1000);
	await benchGetString(0,1000);
	
	// Benchmark simple set string operation
	console.log('Set String');
	var benchSetString = (count,timeout)=>{
		return benchmark(count,timeout,()=>{
			return new Promise((resolve,reject)=>{
				rwClient.proxy.stringData('Set String Test')
				.then(({value})=>resolve())
				.catch(reject);
			});
		})
		.then((result)=>{ console.log(result); return result; })
		.catch((err)=>{ console.error('ERROR',err); });
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

