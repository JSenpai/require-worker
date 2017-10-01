/* global Promise, Proxy, describe, it, expect */
"use strict";

var chai = require("chai");
//var chaiAsPromised = require("chai-as-promised");
//chai.use(chaiAsPromised);

var expect = chai.expect;

var _ = require('../lib/underscore-with-mixins');
var requireWorker = require('../');
var ipcTransport = require('../lib/ipc-transport');
var proxyCom = require('../lib/proxy-communication');
var proxyDataHandler = require('../lib/proxy-handler');

var testModuleFile = '../examples/tests_module';
var prepareProcessCount = 5;

describe("Require-Worker Data Types",()=>{
	var client, proxy;
	
	it("require testModule client",function(done){
		this.slow(1000);
		client = requireWorker.require(testModuleFile,{ returnClient:true });
		proxy = client.proxy;
		client.events.once('requireSuccess',done);
	});
	
	describe("Return Values",()=>{
		
		describe("String",()=>{
			
			describe("support simple operations",()=>{
				
				it("get string",(done)=>{
					proxy.stringData().then(({value})=>{
						expect(value).to.equal('bar');
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});
				
				it("set existing string via new operator",(done)=>{
					new proxy.stringData('abc').then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData();
					},(err)=>{
						done('set error: '+err);
					}).then(({value})=>{
						expect(value).to.equal('abc');
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});
				
				it("set new string via new operator",(done)=>{
					new proxy.stringData2('123').then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData2();
					},(err)=>{
						done('set error: '+err);
					}).then(({value})=>{
						expect(value).to.equal('123');
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});
				
				it("get string via function result",(done)=>{
					proxy.hello("World").then(({value})=>{
						expect(value).to.equal('Hello World!');
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});
				
			});
			
			describe("support for proxy() calls",()=>{
				
				it("get string via proxy().configure({ property:'stringData' })",(done)=>{
					proxy().configure({ property:'stringData' }).then(({value})=>{
						expect(value).to.equal('abc');
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});
				
				it("return value via proxy('world').configure({ property:'hello' })",(done)=>{
					proxy('world').configure({ property:'hello' }).then(({value})=>{
						expect(value).to.equal('Hello world!');
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});
				
				it("return value via proxy().configure({ property:'hello', args:['world'] })",(done)=>{
					proxy().configure({ property:'hello', args:['world'] }).then(({value})=>{
						expect(value).to.equal('Hello world!');
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});
				
				it("set property value via new proxy().configure({ property:'hello', args:['test'] })",(done)=>{
					new proxy().configure({ property:'stringData', args:['test'] }).then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData();
					},(err)=>{
						done('set error: '+err);
					}).then(({value})=>{
						expect(value).to.equal('test');
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});
				
			});
			
			describe("support configure options",()=>{
				
				it("check if property exists via .configure({ hasProperty:true })",(done)=>{
					proxy.stringData().configure({ hasProperty:true }).then(({value})=>{
						expect(value).to.be.true;
						done();
					},(err)=>{
						done(err);
					}).catch(done);
				});
				
				it("check if property does not exists via .configure({ hasProperty:true })",(done)=>{
					proxy.somethingThatDoesNotExist().configure({ hasProperty:true }).then(({value})=>{
						expect(value).to.be.false;
						done();
					},(err)=>{
						done(err);
					}).catch(done);
				});
				
				it("check if property exists via .configure({ hasOwnProperty:true })",(done)=>{
					proxy.stringData().configure({ hasOwnProperty:true }).then(({value})=>{
						expect(value).to.be.true;
						done();
					},(err)=>{
						done(err);
					}).catch(done);
				});
				
				it("check if property does not exists via .configure({ hasOwnProperty:true })",(done)=>{
					proxy.somethingThatDoesNotExist().configure({ hasOwnProperty:true }).then(({value})=>{
						expect(value).to.be.false;
						done();
					},(err)=>{
						done(err);
					}).catch(done);
				});
				
				it("check if prototype property exists via .configure({ hasProperty:true })",(done)=>{
					proxy.aProtoProperty().configure({ hasProperty:true }).then(({value})=>{
						expect(value).to.be.true;
						done();
					},(err)=>{
						done(err);
					}).catch(done);
				});
				
				it("check if prototype property returns false via .configure({ hasOwnProperty:true })",(done)=>{
					proxy.aProtoProperty().configure({ hasOwnProperty:true }).then(({value})=>{
						expect(value).to.be.false;
						done();
					},(err)=>{
						done(err);
					}).catch(done);
				});
				
				it("set property value via .configure({ newOperator:true })",(done)=>{
					proxy.stringData('qwerty').configure({ newOperator:true }).then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData();
					},(err)=>{
						done('set error: '+err);
					}).then(({value})=>{
						expect(value).to.equal('qwerty');
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});
				
				it("set new property (as string) via .configure({ newOperator:true })",(done)=>{
					proxy.stringData4('159').configure({ newOperator:true }).then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData4();
					},(err)=>{
						done('set error: '+err);
					}).then(({value})=>{
						expect(value).to.equal('159');
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});
				
				it("set property value via .configure({ setProperty:true })",(done)=>{
					proxy.stringData('xyz').configure({ setProperty:true }).then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData();
					},(err)=>{
						done('set error: '+err);
					}).then(({value})=>{
						expect(value).to.equal('xyz');
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});
				
				it("set new property (as string) via .configure({ setProperty:true })",(done)=>{
					proxy.stringData3('369').configure({ setProperty:true }).then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData3();
					},(err)=>{
						done('set error: '+err);
					}).then(({value})=>{
						expect(value).to.equal('369');
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});
				
				it("delete property via .configure({ deleteProperty:true })",(done)=>{
					proxy.stringData().configure({ hasProperty:true }).then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData().configure({ deleteProperty:true });
					},(err)=>{
						done('hasProperty error: '+err);
					}).then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData();
					},(err)=>{
						done('delete error: '+err);
					}).then(({value})=>{
						done("stringData action succeeded when it should not have");
					},(err)=>{
						expect(err).to.have.property('code');
						expect(err.code).to.equal('PROPERTY_NOT_FOUND');
						return proxy.stringData().configure({ hasProperty:true });
					}).then(({value})=>{
						expect(value).to.be.false;
						done();
					},(err)=>{
						done('hasProperty error: '+err);
					}).catch(done);
				});
				
				it("delete property that does not exist via .configure({ deleteProperty:true })",(done)=>{
					proxy.somethingThatDoesNotExist().configure({ hasProperty:true }).then(({value})=>{
						expect(value).to.be.false;
						return proxy.somethingThatDoesNotExist().configure({ deleteProperty:true });
					},(err)=>{
						done('hasProperty error: '+err);
					}).then(({value})=>{
						expect(value).to.be.true;
						return proxy.somethingThatDoesNotExist().configure({ hasProperty:true });
					},(err)=>{
						done('delete error: '+err);
					}).then(({value})=>{
						expect(value).to.be.false;
						done();
					},(err)=>{
						done('hasProperty error: '+err);
					}).catch(done);
				});
				
				it("return a specified key ('value') instead of result object via .configure({ returnKey:'value' })",(done)=>{
					proxy.numberData().configure({ returnKey:'value' }).then((value)=>{
						expect(value).to.equal(42);
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});
				
				it("return value via auto resolved/rejected result promise .configure({ promiseResult:true }) (same as { returnKey:'promise' })",(done)=>{
					proxy.numberData().configure({ promiseResult:true }).then((value)=>{
						expect(value).to.equal(42);
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});
				
			});
			
		});
		
		describe("Null",()=>{
			
			it("get null",(done)=>{
				proxy.nullData().then(({value})=>{
					expect(value).to.be.null;
					done();
				},(err)=>{
					done('get error: '+err);
				}).catch(done);
			});

		});
		
		describe("Undefined",()=>{
			
			it("get undefined",(done)=>{
				proxy.undefinedData().then(({value})=>{
					expect(value).to.be.undefined;
					done();
				},(err)=>{
					done('get error: '+err);
				}).catch(done);
			});
			
		});
		
		describe("Date",()=>{
			
			it("get date, date matches data",(done)=>{
				proxy.dateData().then(({value})=>{
					expect(value).to.satisfy(_.isDate);
					expect(value.toISOString()).to.equal("2000-01-01T00:00:00.000Z");
					done();
				},(err)=>{
					done('get error: '+err);
				}).catch(done);
			});
			
		});
		
		describe("Regular Expression",()=>{
			
			it("get regex, match regex on valid string",(done)=>{
				proxy.regexNumberOnly().then(({value})=>{
					expect(value).to.satisfy(_.isRegExp);
					expect('42.0'.match(value)).to.be.ok;
					done();
				},(err)=>{
					done('get error: '+err);
				}).catch(done);
			});
			
		});
		
		describe("NaN",()=>{
			
			it("get NaN",(done)=>{
				proxy.NaNData().then(({value})=>{
					expect(value).to.be.NaN;
					expect(value).to.satisfy(global.isNaN);
					expect(value).to.satisfy(_.isNaN);
					done();
				},(err)=>{
					done('get error: '+err);
				}).catch(done);
			});
			
		});
		
		describe("Promise",()=>{
			
			it("instant resolve",(done)=>{
				proxy.promiseResolve().then(({value})=>{
					value.then(()=>{
						done();
					},(err)=>{
						done('promise rejected: '+err);
					});
				},(err)=>{
					done('promise error: '+err);
				}).catch(done);
			});
			
			it("instant reject",(done)=>{
				proxy.promiseReject().then(({value})=>{
					value.then((val)=>{
						done('promise resolved: '+val);
					},()=>{
						done();
					});
				},(err)=>{
					done('promise error: '+err);
				}).catch(done);
			});
			
			it("resolve via .configure({ followPromise:true })",(done)=>{
				proxy.promiseResolveValue('foobar').configure({ followPromise:true }).then(({value})=>{
					if(value==='foobar') done();
					else done('returned: '+require('util').inspect(value));
				},(err)=>{
					done('promise error: '+err);
				}).catch(done);
			});
			
			it("reject via .configure({ followPromise:true })",(done)=>{
				proxy.promiseRejectValue('test').configure({ followPromise:true }).then(({value})=>{
					done('resolved: '+require('util').inspect(value));
				},(err)=>{
					var { value } = err;
					if(value==='test') done();
					else done('rejected: '+err);
				});
			});
			
			it("delayed resolve",function(done){
				this.slow(100*2.1);
				var timeStart = Date.now();
				proxy.promiseResolveDelayed(100).then(({value:promise})=>{
					promise.then(()=>{
						var timeNow = Date.now();
						if(timeNow-timeStart<100) done('promise resolved too early ('+(timeNow-timeStart)+'ms)');
						else if(timeNow-timeStart>9000) done('promise resolved too late ('+(Date.now()-timeStart)+'ms)');
						else done();
					},(err)=>{
						done('promise rejected ('+(Date.now()-timeStart)+'ms): '+err);
					});
				},(err)=>{
					done('promise error: '+err);
				}).catch(done);
			});
			
			it("timed out via .configure({ timeout:x })",function(done){
				let timeoutMS = 90;
				this.slow(timeoutMS*2.1);
				this.timeout(timeoutMS*3);
				this.retries(3);
				var timeStart = Date.now();
				proxy.promiseResolveDelayed(100).configure({ timeout:timeoutMS }).then(({value:promise})=>{
					promise.then((val)=>{
						done('promise resolved ('+(Date.now()-timeStart)+'ms): '+val);
					},(err)=>{
						done('promise rejected ('+(Date.now()-timeStart)+'ms): '+err);
					});
				},(err)=>{
					expect(err).to.have.property('code');
					expect(err.code).to.equal('TIMEOUT');
					// Check with some delay before/after, as the processes may run faster/slower than eachother. retries are also enabled above.
					if(Date.now()-timeStart<timeoutMS-10) done('promise timed out too early ('+(Date.now()-timeStart)+'ms)');
					else if(Date.now()-timeStart>timeoutMS+10) done('promise timed out too late ('+(Date.now()-timeStart)+'ms)');
					else done();
				}).catch(done);
			});
			
		});
		
		describe("Object",()=>{
			
			describe("simple/safe object",()=>{
				
				it("get object",(done)=>{
					proxy.someObject().then(({value})=>{
						expect(value).to.deep.equal({
							name: 'Tree',
							type: 'Oak',
							age: '25y7m4d',
							height: '6.8m'
						});
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});
				
				it("get only specific keys",(done)=>{
					proxy.someObject('name','type').then(({value})=>{
						expect(value).to.deep.equal({
							name: 'Tree',
							type: 'Oak'
						});
						done();
					},(err)=>{
						done('get error: '+err);
					}).catch(done);
				});

			});
			
		});
		
		describe("Misc Configure Options",()=>{
			
			describe("Promisify via .configure({ promisify:true })",(done)=>{
				
				it("promisify a simple function with a timer",function(done){
					var promisify = require('util').promisify;
					if(!promisify || !promisify.custom) return this.skip();
					
					var tmr = setTimeout(()=>done('action timed out'),100);
					proxy.somePromisifiableFunction().configure({ promisify:true, followPromise:true })
					//.then(({value})=>{ // uncomment if followPromise is not true
					//	if(!_.isPromise(value)) done('value is not a promise');
					//	else return value.then((value)=>({value}));
					//})
					.then(({value})=>{
						clearTimeout(tmr);
						if(value==='success') done();
						else done('returned: '+require('util').inspect(value));
					})
					.catch((err)=>{
						clearTimeout(tmr);
						done("Reject Error: "+err);
					});
				});
				
			});
			
		});
		
	});
	
	describe("Argument Values",()=>{
		
		describe("Function Callback",()=>{
			
			it("Instant Callback",function(done){
				this.timeout(500);
				var done2 = _.after(2,done);
				proxy.instantCallback((...args)=>{
					expect(args).to.be.an('array');
					expect(args).to.have.lengthOf(1);
					expect(args[0]).to.equal('hello');
					done2();
				},'hello')
				.then(({value})=>{
					expect(value).to.equal(42);
					done2();
				}).catch(done);
			});
			
			it("Timed Callback",function(done){
				this.timeout(500);
				var done2 = _.after(2,done);
				proxy.timedCallback((...args)=>{
					expect(args).to.be.an('array');
					expect(args).to.have.lengthOf(2);
					expect(args[0]).to.equal('hi');
					expect(args[1]).to.equal('world');
					done2();
				},'hi','world')
				.then(({value})=>{
					expect(value).to.equal('foo');
					done2();
				}).catch(done);
			});
			
			it("Multiple Callbacks",function(done){
				this.timeout(500);
				var done2 = _.after(4,done);
				proxy.multipleCallbacks(
					(i)=>{ expect(i).to.equal(0); done2() },
					(i)=>{ expect(i).to.equal(1); done2() },
					(i)=>{ expect(i).to.equal(2); done2(); }
				)
				.then(({value})=>{
					expect(value).to.equal('bar');
					done2();
				}).catch(done);
			});
			
			it("Multiple Callback Calls via .configure({ callbackLimit:x })",function(done){
				this.timeout(500);
				var done2 = _.after(10,done);
				var checkCount = 0;
				proxy.multiCallsCallback((i)=>{
					checkCount++;
					done2();
				},8) // Anymore than 8 will simply be ignored on the client
				.configure({ callbackLimit:8, callbackOnRemove:()=>{
					if(checkCount<8) done("Callback Limit Not Reached? checkCount="+checkCount);
					else done2();
				} })
				.then(({value})=>{
					expect(value).to.equal(true);
					done2();
				}).catch(done);
			});
			
			it("Multiple Callback Calls hit Limit",function(done){
				this.timeout(500);
				var done2 = _.after(3,done);
				var checkCount = 0;
				proxy.multiCallsCallback((i)=>{
					checkCount++;
					if(checkCount>1) done("Callback Calls Over Limit? checkCount="+checkCount);
					else done2();
				},2)
				.configure({ callbackLimit:1, callbackOnRemove:()=>{
					done2();
				} })
				.then(({value})=>{
					expect(value).to.equal(true);
					done2();
				}).catch(done);
			});
			
			it("Multiple Callback Calls no Limit",function(done){
				this.timeout(500);
				var done2 = _.after(2,done);
				var checkCount = 0;
				proxy.multiCallsCallback((i)=>{
					checkCount++;
					if(checkCount>=10) done2();
				},10)
				.configure({ callbackLimit:0 })
				.then(({value})=>{
					expect(value).to.equal(true);
					done2();
				}).catch(done);
			});
			
		});
		
	});
	
	after("destroy client",()=>{
		client.destroy();
	});
	
});
