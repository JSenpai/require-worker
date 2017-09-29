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
var prepareProcessCount = 0;

describe("Main: require-worker",()=>{
	
	if(prepareProcessCount>0){
		it("preparing "+prepareProcessCount+" processes (optional)",function(done){
			this.slow(prepareProcessCount*500);
			var r = requireWorker.prepareProcesses({ count:prepareProcessCount });
			expect(r).to.be.true;
			expect(requireWorker.getPreparedProcessesCount()).to.equal(prepareProcessCount);
			done();
		});
	}
	
	describe("require-worker client",()=>{

		it("should have properties on requireWorker",(done)=>{
			expect(requireWorker).to.have.property('require');
			expect(requireWorker).to.have.property('coreClient');
			expect(requireWorker.coreClient).to.have.property('requireWorkerClient');
			expect(requireWorker).to.have.property('coreHost');
			expect(requireWorker.coreHost).to.have.property('requireWorkerHost');
			expect(requireWorker).to.have.property('prepareProcesses');
			expect(requireWorker).to.have.property('destroyPreparedProcesses');
			expect(requireWorker).to.be.a('function');
			expect(requireWorker.require).to.be.a('function');
			done();
		});
		
		it("should succeed to require existing module via returnClientPromise:true",function(done){
			this.slow(1000);
			try{
				var clientPromise = requireWorker.require(testModuleFile,{ returnClientPromise:true }); // New Client
				expect(clientPromise).to.be.a('promise');
				clientPromise.then((client)=>{
					expect(client).to.be.instanceof(requireWorker.coreClient.requireWorkerClient);
					if(!client.events && client._destroyed) return done("requireWorker client has been destroyed");
					expect(client).to.have.property('events');
					client.destroy();
					done();
				})
				.catch((err)=>{
					done("requireWorker client promise failed: "+(err.message||err));
				});
			}catch(err){
				done("requireWorker client constructor threw an error when it should not have: "+err);
			}
		});
		
		var firstClient = null, preparedProcessesCount = 0;
		it("should succeed to require existing module via returnClient:true",function(done){
			this.slow(1000);
			preparedProcessesCount = requireWorker.getPreparedProcessesCount();
			try{
				var client = firstClient = requireWorker.require(testModuleFile,{ returnClient:true }); // New Client
				expect(client).to.be.instanceof(requireWorker.coreClient.requireWorkerClient);
				if(!client.events && client._destroyed) return done("requireWorker client has been destroyed");
				expect(client).to.have.property('events');
				client.events.once('error',(err)=>{
					done("requireWorker client emitted 'error' when it should not have: "+err);
				});
				client.events.once('requireSuccess',()=>{
					done();
				});
			}catch(err){
				done("requireWorker client constructor threw an error when it should not have: "+err);
			}
		});
		
		if(prepareProcessCount>0) it("new client should have used a prepared process",(done)=>{
			expect(requireWorker.getPreparedProcessesCount()).to.equal(preparedProcessesCount-1);
			done();
		});

		it("should fail to require non-existant module via returnClient:true",function(done){
			this.slow(1000);
			try{
				var client = requireWorker.require('./something.that.does.not.exist.js',{ returnClient:true }); // New Client
				expect(client).to.be.instanceof(requireWorker.coreClient.requireWorkerClient);
				if(!client.events && client._destroyed) return done();
				expect(client).to.have.property('events');
				client.events.once('error',(err)=>{
					expect(err).to.have.property('code');
					expect(err.code).to.equal('MODULE_NOT_FOUND');
					done();
				});
				client.events.once('requireSuccess',()=>{
					done("requireWorker client emitted 'requireSuccess' when it should not have");
				});
			}catch(err){
				done("requireWorker client constructor threw an error when it should not have: "+err);
			}
		});
		
		it("should fail to require non-existant module via returnClientPromise:true",function(done){
			this.slow(1000);
			try{
				var clientPromise = requireWorker.require('./something.that.does.not.exist.js',{ returnClientPromise:true }); // New Client
				expect(clientPromise).to.be.a('promise');
				expect(clientPromise.client).to.be.instanceof(requireWorker.coreClient.requireWorkerClient);
				//if(!clientPromise.client.events && clientPromise.client._destroyed) return done();
				expect(clientPromise.client).to.have.property('events');
				clientPromise.then((client)=>{
					done("requireWorker client promise resolved when it should not have");
				})
				.catch((err)=>{
					expect(err).to.have.property('code');
					expect(err.code).to.equal('MODULE_NOT_FOUND');
					done();
				});
			}catch(err){
				done("requireWorker client constructor threw an error when it should not have: "+err);
			}
		});
		
		it("should have properties on requireWorker client",(done)=>{
			var client = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			expect(client).to.have.property('id');
			expect(client).to.have.property('child');
			expect(client).to.have.property('events');
			expect(client).to.have.property('ipcTransport');
			expect(client.ipcTransport).to.be.instanceof(ipcTransport.ipcTransport);
			expect(client).to.have.property('proxyCom');
			expect(client.proxyCom).to.be.instanceof(proxyCom.proxyCom);
			expect(client).to.have.property('proxy');
			expect(client).to.have.property('preConfiguredProxy');
			expect(client).to.have.property('isClientProxy');
			expect(client.preConfiguredProxy).to.be.a('function');
			done();
		});
		
		it("should return cached client",(done)=>{
			var client = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			expect(client).to.equal(firstClient);
			done();
		});
		
		it("should return cached client via promise",(done)=>{
			var clientPromise = requireWorker.require(testModuleFile,{ returnClientPromise:true }); // Returns Cached Client via Promise
			expect(clientPromise).to.be.a('promise');
			clientPromise.then((client)=>{
				expect(client).to.equal(firstClient);
				done();
			})
			.catch(()=>done('Client Promise Failed: '+(err.message||err)));
		});
		
		it("should return client via requireWorker( proxy )",(done)=>{
			var client = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			expect(client).to.equal(requireWorker(client.proxy));
			done();
		});

		it("should return client via requireWorker( filePath ), with there being no new client with same file path since client was first cached",(done)=>{
			var client = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			expect(client).to.equal(requireWorker(testModuleFile));
			done();
		});

		it("should return requireWorker client from cache if file already required",(done)=>{
			var client1 = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			var client2 = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			expect(client1).to.equal(client2);
			expect(client1.child).to.equal(client2.child);
			expect(client1.rwProcess).to.equal(client2.rwProcess);
			done();
		});
		
		it("should return new requireWorker client if shareProcess is specified, and also share same client process",(done)=>{
			var client1 = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			var client2 = requireWorker.require(testModuleFile,{ returnClient:true, shareProcess:client1 }); // New Client, Existing Child Process
			expect(client1).to.not.equal(client2);
			expect(client1.child).to.equal(client2.child);
			expect(client1.rwProcess).to.not.equal(client2.rwProcess);
			done();
		});
		
		it("should return new requireWorker client if ownProcess is specified, and also have different child process",function(done){
			this.slow(1000);
			var client1 = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			var client2 = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client, New Child Process
			expect(client1).to.not.equal(client2);
			expect(client1.child).to.not.equal(client2.child);
			expect(client1.rwProcess).to.not.equal(client2.rwProcess);
			done();
		});
		
		it("should have different child processes if two new clients are created with ownProcess:true",function(done){
			this.slow(2000);
			var client1 = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client, New Child Process
			var client2 = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client, New Child Process
			expect(client1).to.not.equal(client2);
			expect(client1.child).to.not.equal(client2.child);
			expect(client1.rwProcess).to.not.equal(client2.rwProcess);
			done();
		});
		
		it("should have same child process if two new clients are created when the first client has ownProcess:true, and the second client has shareProcess set to the first client",function(done){
			this.slow(1000);
			var client1 = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client, New Child Process
			var client2 = requireWorker.require(testModuleFile,{ returnClient:true, shareProcess:client1 }); // New Client, Existing Child Process
			expect(client1).to.not.equal(client2);
			expect(client1.child).to.equal(client2.child);
			expect(client1.rwProcess).to.not.equal(client2.rwProcess);
			done();
		});
		
		it("should return different client via requireWorker( filePath ), as there is a new client created with same file path since first cached client",(done)=>{
			var client = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			expect(client).to.not.equal(requireWorker(testModuleFile));
			done();
		});
		
	});
	
	describe("require-worker client destruction",()=>{
		
		describe("calls should error with code 'DESTROYED' on client destroy",()=>{
			var client, proxy;
			
			it("have promise action work after create, before destroy",function(done){
				this.slow(1000);
				client = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client
				proxy = client.proxy;
				proxy.stringData().then(()=>{
					done();
				},(err)=>{
					done("promise action failed when it should not have");
				}).catch(done);
			});
			
			it("have promise action called after destroy, and reject with destroy error",(done)=>{
				try{
					client.destroy();
				}catch(err){
					done("client.destroy() errored when it should not have: "+err);
				}
				var promise;
				try{
					promise = proxy.stringData();
				}catch(err){
					done("proxy invoker errored when it should not have: "+err);
				};
				if(promise){
					promise.then(()=>{
						done("promise action succeeded when it should not have");
					},(err)=>{
						expect(err).to.have.property('code');
						expect(err.code).to.equal('DESTROYED');
						done();
					}).catch(done);
				}
			});
			
		});
		
		describe("should reject promises with error code 'DESTROYED' on host destroy",()=>{
			
			it("have promise action error after destroy",function(done){
				this.slow(1000);
				var client = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client
				client.proxy.destroyHost().then(()=>{
					done("promise action succeeded when it should not have");
				},(err)=>{
					expect(err).to.have.property('code');
					expect(err.code).to.equal('DESTROYED');
					done();
				}).catch(done);
			});
			
		});
		
	});
	
	describe("require-worker host",()=>{
		
		it("should catch uncaught exceptions then exit",function(done){
			this.slow(1000);
			this.timeout(1000);
			var clientPromise = requireWorker.require(testModuleFile,{ ownProcess:true, returnClientPromise:true }); // Returns Cached Client via Promise
			expect(clientPromise).to.be.a('promise');
			clientPromise.then((client)=>{
				expect(client).to.have.property('proxy');
				client.events.once('error',(err)=>{
					expect(err).to.have.property('message');
					expect(err).to.have.property('stack');
					expect(err).to.have.property('code');
					client.events.once('destroy',()=>{
						done();
					});
				});
				client.proxy.causeUncaughtException().catch(()=>{});
			})
			.catch((err)=>done('Client Promise Failed: '+(err.message||err)));
		});
		
	});
	
	describe("proxy actions on main interface (target = host export)",()=>{
		var client, proxy;
		
		it("create client",function(done){
			this.slow(1000);
			client = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client
			proxy = client.proxy;
			client.events.once('requireSuccess',done);
		});
		
		describe("proxy",()=>{
			
			it("should have own constructor property",()=>{
				expect(proxy).to.have.property('constructor');
				expect(proxy).to.have.ownProperty('constructor');
			});
			
			it("should have own prototype property",()=>{
				expect(proxy).to.have.property('prototype');
				expect(proxy).to.have.ownProperty('prototype');
			});
			
			it("constructor property should not be enumerable",()=>{
				expect(Object.prototype.propertyIsEnumerable.call(proxy,'constructor')).to.be.false;
			});
			
			it("prototype property should not be enumerable",()=>{
				expect(Object.prototype.propertyIsEnumerable.call(proxy,'prototype')).to.be.false;
			});
			
			it("constructor property should not be extensible",()=>{
				expect(proxy.constructor).to.not.be.extensible;
			});
			
			it("prototype property should not be extensible",()=>{
				expect(proxy.prototype).to.not.be.extensible;
			});
			
			it("should have no properties",()=>{
				expect(Object.keys(proxy)).to.be.empty;
			});
			
			it("proxy should be an object",()=>{
				expect(proxy).to.satisfy(_.isObject.bind(_));
			});
			
			it("#toJSON should be an empty object",()=>{
				expect(proxy.toJSON()).to.be.empty;
			});
			
			it("#inspect should be an empty object",()=>{
				expect(proxy.inspect()).to.be.empty;
			});
			
			it("#valueOf should return proxy",()=>{
				expect(proxy.valueOf()).to.equal(proxy);
			});
			
			it("#toString should equal '[object Object]'",()=>{
				expect(proxy.toString()).to.equal('[object Object]');
			});
			
		});
		
		describe("proxy.constructor",()=>{
			
			var c;
			it("should be a function",()=>{
				c = proxy.constructor;
				expect(c).to.be.a('function');
			});
			
			it("should be the bound function proxyTargetConstructor",()=>{
				expect(c.name).to.equal('bound proxyTargetConstructor');
			});
			
			it("should have a valid .client property",()=>{
				expect(c).to.have.property('client');
				expect(c.client).to.equal(client);
			});
			
		});
		
		describe("proxy()",()=>{
			
			it("should fail with 'INVALID_TARGET' (host export is an object)",(done)=>{
				proxy().then(({value})=>{
					done("promise action succeeded when it should not have");
				},(err)=>{
					expect(err).to.have.property('code');
					expect(err.code).to.equal('INVALID_TARGET');
					done();
				}).catch(done);
			});
			
			it("new proxy() should fail with 'INVALID_TARGET' (host export is an object)",(done)=>{
				new proxy().then(({value})=>{
					done("promise action succeeded when it should not have");
				},(err)=>{
					expect(err).to.have.property('code');
					expect(err.code).to.equal('INVALID_TARGET');
					done();
				}).catch(done);
			});
			
		});
		
		describe("isClientProxy",()=>{
			
			it("should have client.proxy pass isClientProxy",(done)=>{
				expect(proxy).to.satisfy(client.isClientProxy.bind(client));
				done();
			});
			
			it("should have random proxy not pass isClientProxy",(done)=>{
				expect(new Proxy({},{})).to.not.satisfy(client.isClientProxy.bind(client));
				done();
			});
			
			it("should have null not pass isClientProxy",(done)=>{
				expect(null).to.not.satisfy(client.isClientProxy.bind(client));
				done();
			});
			
		});
		
		describe("proxy get",()=>{
			
			var a;
			it("return result function on property get, with existing target property",()=>{
				a = proxy.stringData;
				expect(a).to.be.a('function');
				expect(a.name).to.equal('proxyTargetConstructorResult');
			});
			
			var h;
			it("return result function on property get, with non-existant target property",()=>{
				h = h = proxy.somethingThatDoesNotExist;
				expect(h).to.be.a('function');
				expect(h.name).to.equal('proxyTargetConstructorResult');
			});
			
			var b;
			it("return promise when result function is called, with existing target property",()=>{
				b = a();
				expect(b).to.be.a('promise');
			});
			
			it("check if promise resolves, with existing target property",(done)=>{
				b.then(({value})=>{
					done();
				},(err)=>{
					done("proxy.stringData error: "+err);
				}).catch(done);
			});
			
			it("check if promise rejects, with non-existant target property",(done)=>{
				h().then(({value})=>{
					done("proxy.somethingThatDoesNotExist action succeeded when it should not have");
				},(err)=>{
					expect(err).to.have.property('code');
					expect(err.code).to.equal('PROPERTY_NOT_FOUND');
					done();
				}).catch(done);
			});
			
			it("result function can be called more than once, returning a new promise each time",()=>{
				let promiseList = [];
				for(var i=0,l=10; i<l; i++){
					let c = a();
					expect(c).to.be.a('promise');
					expect(c).to.not.equal(b);
					expect(c).to.not.be.oneOf(promiseList);
					promiseList.push(c);
				}
			});
			
			it("promise has .configure function property",()=>{
				expect(b).to.have.property('configure');
				expect(b.configure).to.be.a('function');
			});
			
			it("error on late .configure call",(done)=>{
				try{
					b.configure({});
					done("it did not error");
				}catch(error){
					expect(error).to.have.property('code');
					expect(error.code).to.equal('LATE_CONFIGURE');
					done();
				}
			});
			
			var d, e;
			it("promise.configure() returns same promise",()=>{
				d = proxy.stringData();
				e = d.configure();
				expect(e).to.equal(d);
			});
			
			it("promise.configure() can be called more than once, returning the same promise each time",()=>{
				let f = proxy.stringData();
				let prevPromise;
				for(var i=0,l=10; i<l; i++){
					let g = f.configure();
					expect(g).to.equal(f);
					if(prevPromise) expect(g).to.equal(prevPromise);
					prevPromise = g;
				}
			});
			
			it("return resolved promise via result.promise get",(done)=>{
				proxy.stringData().then(({value,promise})=>{
					if(!_.isPromise(promise)) return done("result.promise is not a promise?");
					promise.then((value2)=>{
						expect(value2).to.equal(value);
						done();
					},(err)=>{
						done("result.promise reject: "+err);
					}).catch(done);
				},(err)=>{
					done("rejected with: "+err);
				}).catch(done);
			});
			
			it("return rejected promise via result.promise get",(done)=>{
				proxy.somethingThatDoesNotExist().then(({value})=>{
					done("resolved when it should not have, with value: "+value);
				},({error,promise})=>{
					if(!_.isPromise(promise)) return done("result.promise is not a promise?");
					promise.then((value)=>{
						done("result.promise resolved, with value: "+value);
					},(err)=>{
						expect(err).to.equal(error);
						done();
					}).catch(done);
				}).catch(done);
			});
			
			it("promise chain with result.promise get",(done)=>{
				proxy.stringData().then(({promise})=>promise).then(proxy.hello).then(({value})=>{
					expect(value).to.equal('Hello bar!');
					done();
				},(err)=>done("rejected with: "+err)).catch(done);
			});
			
			it("Promise.all with result.promise get",(done)=>{
				Promise.all([
					proxy.stringData().then(({promise})=>promise,(err)=>done("proxy.stringData() rejected with: "+err)),
					proxy.numberData().then(({promise})=>promise,(err)=>done("proxy.numberData() rejected with: "+err)),
					proxy.hello('World').then(({promise})=>promise,(err)=>done("proxy.hello('World') rejected with: "+err))
				]).then((values)=>{
					expect(values[0]).to.equal('bar');
					expect(values[1]).to.equal(42);
					expect(values[2]).to.equal('Hello World!');
					done();
				}).catch(done);
			});
			
		});
		
		describe("proxy restrictions",()=>{
			
			it("should error on property set or delete",(done)=>{
				try{
					proxy.something = 42;
					done("it did not error when setting");
				}catch(err){
					try{
						delete proxy.stringData;
						done("it did not error when deleting");
					}catch(error){
						expect(error).to.have.property('code');
						expect(error.code).to.equal('INVALID_OPERATION');
						done();
					}
				}
			});
			
			it("should error on constructor property set or delete",(done)=>{
				try{
					proxy.constructor = function(){};
					done("it did not error when setting");
				}catch(err){
					try{
						delete proxy.constructor;
						done("it did not error when deleting");
					}catch(error){
						expect(error).to.have.property('code');
						expect(error.code).to.equal('INVALID_OPERATION');
						done();
					}
				}
			});
			
			it("should error on prototype property set or delete",(done)=>{
				try{
					proxy.prototype = {};
					done("it did not error when setting");
				}catch(err){
					try{
						delete proxy.prototype;
						done("it did not error when deleting");
					}catch(error){
						expect(error).to.have.property('code');
						expect(error.code).to.equal('INVALID_OPERATION');
						done();
					}
				}
			});
			
			it("should error on property Object.defineProperty",(done)=>{
				try{
					Object.defineProperty(proxy,'stringData',{});
					done("it did not error when setting");
				}catch(error){
					expect(error).to.have.property('code');
					expect(error.code).to.equal('INVALID_OPERATION');
					done();
				}
			});
			
		});
		
		describe("misc configure options",()=>{
			
			it("promise should resolve instead of rejecting via .configure({ resolveError:true })",(done)=>{
				proxy.somethingThatDoesNotExist().configure({ resolveError:true }).then(({ value, error })=>{
					if(error){
						expect(error).to.have.property('code');
						expect(error.code).to.equal('PROPERTY_NOT_FOUND');
						done();
					} else {
						done("resolveError:true configure action resolved with a value when it should not have. value: "+value);
					}
				},(err)=>{
					done("resolveError:true configure action errored when it should not have: "+err);
				}).catch(done);
			});
			
		});
		
		describe("preConfigure options",()=>{
			
			describe("preConfiguredProxy via client.preConfiguredProxy(options)",()=>{
				var preConfiguredProxy;
				
				it("create preConfiguredProxy",(done)=>{
					preConfiguredProxy = client.preConfiguredProxy({ resolveError:true });
					done();
				});
				
				it("preConfiguredProxy instance should be different from client.proxy",()=>{
					expect(preConfiguredProxy).to.not.equal(proxy);
				});
				
				it("promise should resolve instead of rejecting via { resolveError:true }, and no direct configure on promise",(done)=>{
					preConfiguredProxy.somethingThatDoesNotExist1().then(({ value, error })=>{
						if(error){
							expect(error).to.have.property('code');
							expect(error.code).to.equal('PROPERTY_NOT_FOUND');
							done();
						} else {
							done("resolveError:true preConfigure action resolved with a value when it should not have. value: "+value);
						}
					},(err)=>{
						done("resolveError:true preConfigure action errored when it should not have: "+err);
					}).catch(done);
				});
				
			});
			
			describe("preConfiguredProxy via requireWorker.preConfiguredProxy(target,options), target = proxy",()=>{
				var preConfiguredProxy;
				
				it("create preConfiguredProxy",(done)=>{
					preConfiguredProxy = requireWorker.preConfiguredProxy(proxy,{ resolveError:true });
					done();
				});
				
				it("preConfiguredProxy instance should be different from client.proxy",()=>{
					expect(preConfiguredProxy).to.not.equal(proxy);
				});
				
				it("promise should resolve instead of rejecting via { resolveError:true }, and no direct configure on promise",(done)=>{
					preConfiguredProxy.somethingThatDoesNotExist2().then(({ value, error })=>{
						if(error){
							expect(error).to.have.property('code');
							expect(error.code).to.equal('PROPERTY_NOT_FOUND');
							done();
						} else {
							done("resolveError:true preConfigure action resolved with a value when it should not have. value: "+value);
						}
					},(err)=>{
						done("resolveError:true preConfigure action errored when it should not have: "+err);
					}).catch(done);
				});
				
			});
			
			describe("preConfiguredProxy via requireWorker.preConfiguredProxy(target,options), target = proxy promise",()=>{
				var preConfiguredProxy, promise;
				
				it("create preConfiguredProxy",(done)=>{
					promise = proxy.numberData();
					preConfiguredProxy = requireWorker.preConfiguredProxy(promise,{ resolveError:true });
					done();
				});
				
				it("preConfiguredProxy instance should be different from client.proxy",()=>{
					expect(preConfiguredProxy).to.not.equal(proxy);
				});
				
				it("promise should resolve instead of rejecting via { resolveError:true }, and no direct configure on promise",(done)=>{
					preConfiguredProxy.somethingThatDoesNotExist3().then(({ value, error })=>{
						if(error){
							expect(error).to.have.property('code');
							expect(error.code).to.equal('PROPERTY_NOT_FOUND');
							done();
						} else {
							done("resolveError:true preConfigure action resolved with a value when it should not have. value: "+value);
						}
					},(err)=>{
						done("resolveError:true preConfigure action errored when it should not have: "+err);
					}).catch(done);
				});
				
			});
			
			describe("preConfiguredProxy via proxy.constructor.preConfiguredProxy(options)",()=>{
				var preConfiguredProxy;
				
				it("create preConfiguredProxy",(done)=>{
					preConfiguredProxy = proxy.constructor.preConfiguredProxy({ resolveError:true });
					done();
				});
				
				it("preConfiguredProxy instance should be different from client.proxy",()=>{
					expect(preConfiguredProxy).to.not.equal(proxy);
				});
				
				it("promise should resolve instead of rejecting via { resolveError:true }, and no direct configure on promise",(done)=>{
					preConfiguredProxy.somethingThatDoesNotExist4().then(({ value, error })=>{
						if(error){
							expect(error).to.have.property('code');
							expect(error.code).to.equal('PROPERTY_NOT_FOUND');
							done();
						} else {
							done("resolveError:true preConfigure action resolved with a value when it should not have. value: "+value);
						}
					},(err)=>{
						done("resolveError:true preConfigure action errored when it should not have: "+err);
					}).catch(done);
				});
				
			});
			
		});
		
	});
	
	describe("require NodeJS modules",()=>{
		
		describe("#os",()=>{
			var proxyOS, localOS = require('os');
			
			it("require",(done)=>{
				proxyOS = requireWorker.require('os');
				done();
			});
			
			it("#platform()",(done)=>{
				proxyOS.platform().then(({value})=>{
					expect(value).to.equal(localOS.platform());
					done();
				},(err)=>{
					done("promise action failed when it should not have: "+err);
				}).catch(done);
			});
			
			it("#userInfo()",(done)=>{
				proxyOS.userInfo().then(({value})=>{
					expect(value).to.deep.equal(localOS.userInfo());
					done();
				},(err)=>{
					done("promise action failed when it should not have: "+err);
				}).catch(done);
			});
			
		});
		
		describe("#util",()=>{
			var proxyUtil, localUtil = require('util');
			
			it("require",(done)=>{
				proxyUtil = requireWorker.require('util');
				done();
			});
			
			it("#format(...)",(done)=>{
				proxyUtil.format('%s:%s','foo','bar','baz').then(({value})=>{
					expect(value).to.equal(localUtil.format('%s:%s','foo','bar','baz'));
					done();
				},(err)=>{
					done("promise action failed when it should not have: "+err);
				}).catch(done);
			});
			
		});
		
	});
	
	describe("destroy clients and processes",()=>{
		
		it("destroy existing clients",(done)=>{
			for(var [key,client] of requireWorker.coreClient.clientsMap) client.destroy();
			done();
		});
		
		it("destroy remaining prepared processes",(done)=>{
			var r = requireWorker.destroyPreparedProcesses();
			expect(r).to.be.true;
			done();
		});
		
	});
	
});
