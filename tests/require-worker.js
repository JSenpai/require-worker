/* global Promise, Proxy */
"use strict";

var chai = require("chai");
//var chaiAsPromised = require("chai-as-promised");
//chai.use(chaiAsPromised);

var expect = chai.expect;

var _ = require('../lib/underscore-with-mixins');
var requireWorker = require('../');
var ipcTransport = require('../lib/ipc-transport');
var proxyCom = require('../lib/proxy-communication');
var proxyDataHandler = require('../lib/proxy-data-handler');

var testModuleFile = '../examples/tests_module';
var prepareProcessCount = 5;

describe("Main: require-worker",()=>{
	
	if(prepareProcessCount>0){
		describe("preparing "+prepareProcessCount+" processes (optional)",()=>{
			
			it("should succeed",(done)=>{
				var r = requireWorker.prepareProcesses({ count:prepareProcessCount });
				expect(r).to.be.true;
				expect(requireWorker.getPreparedProcessesCount()).to.equal(prepareProcessCount);
				done();
			});
			
		});
	}
	
	describe("check require-worker client",()=>{

		it("should have properties on requireWorker",(done)=>{
			expect(requireWorker).to.have.property('require');
			expect(requireWorker).to.have.property('requireWorkerClient');
			expect(requireWorker).to.have.property('requireWorkerHost');
			expect(requireWorker).to.have.property('prepareProcesses');
			expect(requireWorker).to.have.property('destroyPreparedProcesses');
			expect(requireWorker).to.be.a('function');
			expect(requireWorker.require).to.be.a('function');
			expect(requireWorker.requireWorkerClient).to.be.a('function');
			expect(requireWorker.requireWorkerHost).to.be.a('function');
			done();
		});
		
		var firstClient = null, preparedProcessesCount = 0;
		it("should succeed to require existing module",(done)=>{
			preparedProcessesCount = requireWorker.getPreparedProcessesCount();
			try{
				var client = firstClient = requireWorker.require(testModuleFile,{ returnClient:true }); // New Client
				expect(client).to.be.instanceof(requireWorker.requireWorkerClient);
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

		it("should fail to require non-existant module",(done)=>{
			try{
				var client = requireWorker.require('./something.that.does.not.exist.js',{ returnClient:true }); // New Client
				expect(client).to.be.instanceof(requireWorker.requireWorkerClient);
				if(!client.events && client._destroyed) return done();
				expect(client).to.have.property('events');
				client.events.once('error',(err)=>{
					expect(err).to.have.property('code');
					expect(err.code).to.equal('REQUIRE_FILE_NOT_FOUND');
					done();
				});
				client.events.once('requireSuccess',()=>{
					done("requireWorker client emitted 'requireSuccess' when it should not have");
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
			expect(client.preConfiguredProxy).to.be.a('function');
			done();
		});
		
		it("should return cached client",(done)=>{
			var client = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			expect(client).to.equal(firstClient);
			done();
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
		
		it("should return new requireWorker client if ownProcess is specified, and also have different child process",(done)=>{
			var client1 = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			var client2 = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client, New Child Process
			expect(client1).to.not.equal(client2);
			expect(client1.child).to.not.equal(client2.child);
			expect(client1.rwProcess).to.not.equal(client2.rwProcess);
			done();
		});
		
		it("should have different child processes if two new clients are created with ownProcess:true",(done)=>{
			var client1 = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client, New Child Process
			var client2 = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client, New Child Process
			expect(client1).to.not.equal(client2);
			expect(client1.child).to.not.equal(client2.child);
			expect(client1.rwProcess).to.not.equal(client2.rwProcess);
			done();
		});
		
		it("should have same child process if two new clients are created when the first client has ownProcess:true, and the second client has shareProcess set to the first client",(done)=>{
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
	
	describe("check require-worker client destruction",()=>{
		
		describe("calls should error with code 'DESTROYED' on client destroy",()=>{
			var client, proxy;
			
			it("have promise action work after create, before destroy",(done)=>{
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
					client._destroy();
				}catch(err){
					done("client._destroy() errored when it should not have: "+err);
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
			
			it("have promise action error after destroy",(done)=>{
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

		//it("destroy existing clients, with 100ms post-delay",(done)=>{
		//	for(var [key,client] of requireWorker.clientsMap) client._destroy();
		//	setTimeout(done,100);
		//});

	});
	
	describe("proxy actions on main interface (target = host export)",()=>{
		var client, proxy;
		
		describe("create client",()=>{
			
			it("should succeed",(done)=>{
				client = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client
				proxy = client.proxy;
				done();
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
		
		describe("proxy.constructor",()=>{
			
			it("should be own property",()=>{
				expect(proxy).to.have.property('constructor');
				expect(proxy).to.have.ownProperty('constructor');
			});
			
			var c;
			it("should be a function",()=>{
				c = proxy.constructor;
				expect(c).to.be.a('function');
			});
			
			it("should be the bound function proxyInterfaceGet",()=>{
				expect(c.name).to.equal('bound proxyInterfaceGet');
			});
			
			it("should have a valid .client property",()=>{
				expect(c).to.have.property('client');
				expect(c.client).to.equal(client);
			});
			
		});
		
		describe("proxy get",()=>{
			
			var a;
			it("return result function on property get, with existing target property",()=>{
				a = proxy.stringData;
				expect(a).to.be.a('function');
				expect(a.name).to.equal('requireWorkerProxyInvoker');
			});
			
			var h;
			it("return result function on property get, with non-existant target property",()=>{
				h = h = proxy.somethingThatDoesNotExist;
				expect(h).to.be.a('function');
				expect(h.name).to.equal('requireWorkerProxyInvoker');
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
			
			it("throw error on late .configure call",()=>{
				expect(b.configure).to.be.throw(Error);
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
		
		describe("String data-type",()=>{
			
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

				it("set exiting property (as string) via .configure({ newOperator:true })",(done)=>{
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

				it("set exiting property (as string) via .configure({ setProperty:true })",(done)=>{
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

			});
			
		});
		
		describe("Null data-type",()=>{
			
			it("get null",(done)=>{
				proxy.nullData().then(({value})=>{
					expect(value).to.be.null;
					done();
				},(err)=>{
					done('get error: '+err);
				}).catch(done);
			});
			
		});
		
		describe("Undefined data-type",()=>{
			
			it("get undefined",(done)=>{
				proxy.undefinedData().then(({value})=>{
					expect(value).to.be.undefined;
					done();
				},(err)=>{
					done('get error: '+err);
				}).catch(done);
			});
			
		});
		
		describe("Date data-type",()=>{
			
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
		
		describe("Regex data-type",()=>{
			
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
		
		describe("NaN data-type",()=>{
			
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
		
		describe("Object data-type",()=>{
			
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
		
		// promise replies not yet implemented
		//it("set timeout via .configure({ timeout:1 })",(done)=>{
		//	proxy.promiseNeverFinish().configure({ timeout:1 }).then(({value})=>{
		//		done("stringData action succeeded when it should not have");
		//	},(err)=>{
		//		expect(err).to.have.property('code');
		//		expect(err.code).to.equal('TIMEOUT');
		//		done();
		//	}).catch(done);
		//});
		
	});
	
	describe("destroy clients and processes",()=>{
		
		it("destroy existing clients",(done)=>{
			for(var [key,client] of requireWorker.clientsMap) client._destroy();
			done();
		});
		
		it("destroy remaining prepared processes",(done)=>{
			var r = requireWorker.destroyPreparedProcesses();
			expect(r).to.be.true;
			done();
		});
		
	});
	
});
