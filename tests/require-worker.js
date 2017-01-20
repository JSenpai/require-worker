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

describe("Main: require-worker",()=>{
	
	describe("preparing some processes (optional)",()=>{
		it("should succeed",(done)=>{
			var r = requireWorker.prepareProcesses({ count:5 });
			expect(r).to.be.true;
			done();
		});
	});
	
	describe("check require-worker client",()=>{

		it("should have properties on requireWorker",()=>{
			expect(requireWorker).to.have.property('require');
			expect(requireWorker).to.have.property('requireWorkerClient');
			expect(requireWorker).to.have.property('requireWorkerHost');
			expect(requireWorker).to.have.property('prepareProcesses');
			expect(requireWorker).to.have.property('destroyPrepareProcesses');
			expect(requireWorker).to.be.a('function');
			expect(requireWorker.require).to.be.a('function');
			expect(requireWorker.requireWorkerClient).to.be.a('function');
			expect(requireWorker.requireWorkerHost).to.be.a('function');
		});

		it("should succeed to require existing module",(done)=>{
			try{
				var client = requireWorker.require(testModuleFile,{ returnClient:true }); // New Client
				expect(client).to.be.instanceof(requireWorker.requireWorkerClient);
				if(!client.events && client._destroyed) return done("requireWorker client has been destroyed");
				expect(client).to.have.property('events');
				client.events.once('error',(err)=>{
					done("requireWorker client emitted 'error' when it should not have: "+err.message,err);
				});
				client.events.once('requireSuccess',()=>{
					done();
				});
			}catch(err){
				done("requireWorker client constructor threw an error when it should not have:",err);
			}
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
				done("requireWorker client constructor threw an error when it should not have:",err);
			}
		});
		
		it("should have properties on requireWorker client",()=>{
			var client = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			expect(client).to.have.property('id');
			expect(client).to.have.property('child');
			expect(client).to.have.property('events');
			expect(client).to.have.property('ipcTransport');
			expect(client.ipcTransport).to.be.instanceof(ipcTransport.ipcTransport);
			expect(client).to.have.property('proxyCom');
			expect(client.proxyCom).to.be.instanceof(proxyCom.proxyCom);
			expect(client).to.have.property('proxy');
		});
		
		it("should return client via requireWorker( proxy )",()=>{
			var client = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			expect(client).to.equal(requireWorker(client.proxy));
		});

		it("should return client via requireWorker( filePath ), with there being no new client with same file path since client was first cached",()=>{
			var client = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			expect(client).to.equal(requireWorker(testModuleFile));
		});

		it("should return requireWorker client from cache if file already required",()=>{
			var client1 = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			var client2 = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			expect(client1).to.equal(client2);
			expect(client1.child).to.equal(client2.child);
			expect(client1.rwProcess).to.equal(client2.rwProcess);
		});
		
		it("should return new requireWorker client if shareProcess is specified, and also share same client process",()=>{
			var client1 = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			var client2 = requireWorker.require(testModuleFile,{ returnClient:true, shareProcess:client1 }); // New Client, Existing Child Process
			expect(client1).to.not.equal(client2);
			expect(client1.child).to.equal(client2.child);
			expect(client1.rwProcess).to.not.equal(client2.rwProcess);
		});
		
		it("should return new requireWorker client if ownProcess is specified, and also have different child process",()=>{
			var client1 = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			var client2 = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client, New Child Process
			expect(client1).to.not.equal(client2);
			expect(client1.child).to.not.equal(client2.child);
			expect(client1.rwProcess).to.not.equal(client2.rwProcess);
		});
		
		it("should have different child processes if two new clients are created with ownProcess:true",()=>{
			var client1 = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client, New Child Process
			var client2 = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client, New Child Process
			expect(client1).to.not.equal(client2);
			expect(client1.child).to.not.equal(client2.child);
			expect(client1.rwProcess).to.not.equal(client2.rwProcess);
		});
		
		it("should have same child process if two new clients are created when the first client has ownProcess:true, and the second client has shareProcess set to the first client",()=>{
			var client1 = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client, New Child Process
			var client2 = requireWorker.require(testModuleFile,{ returnClient:true, shareProcess:client1 }); // New Client, Existing Child Process
			expect(client1).to.not.equal(client2);
			expect(client1.child).to.equal(client2.child);
			expect(client1.rwProcess).to.not.equal(client2.rwProcess);
		});
		
		it("should return different client via requireWorker( filePath ), as there is a new client created with same file path since first cached client",()=>{
			var client = requireWorker.require(testModuleFile,{ returnClient:true }); // Returns Cached Client
			expect(client).to.not.equal(requireWorker(testModuleFile));
		});
		
		it("should reject promises with error code 'DESTROYED' - client destroy",(done)=>{
			var client = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client
			client.proxy.stringData().then(()=>{
				done("promise action succeeded when it should not have");
			},(err)=>{
				expect(err).to.have.property('code');
				expect(err.code).to.equal('DESTROYED');
				done();
			});
			client._destroy();
		});

		it("should reject promises with error code 'DESTROYED' - host destroy",(done)=>{
			var client = requireWorker.require(testModuleFile,{ returnClient:true, ownProcess:true }); // New Client
			client.proxy.destroyHost().then(()=>{
				done("promise action succeeded when it should not have");
			},(err)=>{
				expect(err).to.have.property('code');
				expect(err.code).to.equal('DESTROYED');
				done();
			});
		});

		//it("destroy existing clients, with 100ms post-delay",(done)=>{
		//	for(var [key,client] of requireWorker.clientsMap) client._destroy();
		//	setTimeout(done,100);
		//});

	});
	
	describe("proxy actions on main interface (target = host export)",()=>{
		var client = requireWorker.require(testModuleFile,{ returnClient:true }); // New Client
		var proxy = client.proxy;
		
		describe("proxy()",()=>{
			
			it("should fail with 'INVALID_TARGET' (host export is an object)",(done)=>{
				proxy().then(({value})=>{
					done("promise action succeeded when it should not have");
				},(err)=>{
					expect(err).to.have.property('code');
					expect(err.code).to.equal('INVALID_TARGET');
					done();
				});
			});
			
			it("new proxy() should fail with 'INVALID_TARGET' (host export is an object)",(done)=>{
				new proxy().then(({value})=>{
					done("promise action succeeded when it should not have");
				},(err)=>{
					expect(err).to.have.property('code');
					expect(err.code).to.equal('INVALID_TARGET');
					done();
				});
			});
			
		});
		
		describe("proxy.constructor",()=>{
			
			it("should be own property",()=>{
				expect(proxy).to.have.property('constructor');
				expect(proxy).to.have.ownProperty('constructor');
			});
			
			var c = proxy.constructor;
			it("should be a function",()=>{
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
			
			let a = proxy.stringData;
			it("return result function on property get, with existing target property",()=>{
				expect(a).to.be.a('function');
				expect(a.name).to.equal('requireWorkerProxyInvoker');
			});
			
			let h = proxy.somethingThatDoesNotExist;
			it("return result function on property get, with non-existant target property",()=>{
				expect(h).to.be.a('function');
				expect(h.name).to.equal('requireWorkerProxyInvoker');
			});
			
			let b = a();
			it("return promise when result function is called, with existing target property",()=>{
				expect(b).to.be.a('promise');
			});
			it("check if promise resolves, with existing target property",(done)=>{
				b.then(({value})=>{
					done();
				},(err)=>{
					done("proxy.stringData error: "+err,err);
				});
			});
			
			it("check if promise rejects, with non-existant target property",(done)=>{
				h().then(({value})=>{
					done("proxy.somethingThatDoesNotExist action succeeded when it should not have");
				},(err)=>{
					expect(err).to.have.property('code');
					expect(err.code).to.equal('PROPERTY_NOT_FOUND');
					done();
				});
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
			
			let d = proxy.stringData();
			let e = d.configure();
			it("promise.configure() returns same promise",()=>{
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
					done("resolveError:true configure action errored when it should not have: "+err,err);
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
						done('get error: '+err,err);
					});
				});

				it("set existing string via new operator",(done)=>{
					new proxy.stringData('abc').then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData();
					},(err)=>{
						done('set error: '+err,err);
					}).then(({value})=>{
						expect(value).to.equal('abc');
						done();
					},(err)=>{
						done('get error: '+err,err);
					});
				});

				it("set new string via new operator",(done)=>{
					new proxy.stringData2('123').then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData2();
					},(err)=>{
						done('set error: '+err,err);
					}).then(({value})=>{
						expect(value).to.equal('123');
						done();
					},(err)=>{
						done('get error: '+err,err);
					});
				});

			});
			
			describe("support configure options",()=>{
				
				it("check if property exists via .configure({ hasProperty:true })",(done)=>{
					proxy.stringData().configure({ hasProperty:true }).then(({value})=>{
						expect(value).to.be.true;
						done();
					},(err)=>{
						done(err,err);
					});
				});

				it("check if property does not exists via .configure({ hasProperty:true })",(done)=>{
					proxy.somethingThatDoesNotExist().configure({ hasProperty:true }).then(({value})=>{
						expect(value).to.be.false;
						done();
					},(err)=>{
						done(err,err);
					});
				});

				it("check if property exists via .configure({ hasOwnProperty:true })",(done)=>{
					proxy.stringData().configure({ hasOwnProperty:true }).then(({value})=>{
						expect(value).to.be.true;
						done();
					},(err)=>{
						done(err,err);
					});
				});

				it("check if property does not exists via .configure({ hasOwnProperty:true })",(done)=>{
					proxy.somethingThatDoesNotExist().configure({ hasOwnProperty:true }).then(({value})=>{
						expect(value).to.be.false;
						done();
					},(err)=>{
						done(err,err);
					});
				});

				it("check if prototype property exists via .configure({ hasProperty:true })",(done)=>{
					proxy.aProtoProperty().configure({ hasProperty:true }).then(({value})=>{
						expect(value).to.be.true;
						done();
					},(err)=>{
						done(err,err);
					});
				});

				it("check if prototype property returns false via .configure({ hasOwnProperty:true })",(done)=>{
					proxy.aProtoProperty().configure({ hasOwnProperty:true }).then(({value})=>{
						expect(value).to.be.false;
						done();
					},(err)=>{
						done(err,err);
					});
				});

				it("set exiting property (as string) via .configure({ newOperator:true })",(done)=>{
					proxy.stringData('qwerty').configure({ newOperator:true }).then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData();
					},(err)=>{
						done('set error: '+err,err);
					}).then(({value})=>{
						expect(value).to.equal('qwerty');
						done();
					},(err)=>{
						done('get error: '+err,err);
					});
				});

				it("set new property (as string) via .configure({ newOperator:true })",(done)=>{
					proxy.stringData4('159').configure({ newOperator:true }).then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData4();
					},(err)=>{
						done('set error: '+err,err);
					}).then(({value})=>{
						expect(value).to.equal('159');
						done();
					},(err)=>{
						done('get error: '+err,err);
					});
				});

				it("set exiting property (as string) via .configure({ setProperty:true })",(done)=>{
					proxy.stringData('xyz').configure({ setProperty:true }).then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData();
					},(err)=>{
						done('set error: '+err,err);
					}).then(({value})=>{
						expect(value).to.equal('xyz');
						done();
					},(err)=>{
						done('get error: '+err,err);
					});
				});

				it("set new property (as string) via .configure({ setProperty:true })",(done)=>{
					proxy.stringData3('369').configure({ setProperty:true }).then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData3();
					},(err)=>{
						done('set error: '+err,err);
					}).then(({value})=>{
						expect(value).to.equal('369');
						done();
					},(err)=>{
						done('get error: '+err,err);
					});
				});

				it("delete property via .configure({ deleteProperty:true })",(done)=>{
					proxy.stringData().configure({ hasProperty:true }).then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData().configure({ deleteProperty:true });
					},(err)=>{
						done('hasProperty error: '+err,err);
					}).then(({value})=>{
						expect(value).to.be.true;
						return proxy.stringData();
					},(err)=>{
						done('delete error: '+err,err);
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
						done('hasProperty error: '+err,err);
					});
				});

				it("delete property that does not exist via .configure({ deleteProperty:true })",(done)=>{
					proxy.somethingThatDoesNotExist().configure({ hasProperty:true }).then(({value})=>{
						expect(value).to.be.false;
						return proxy.somethingThatDoesNotExist().configure({ deleteProperty:true });
					},(err)=>{
						done('hasProperty error: '+err,err);
					}).then(({value})=>{
						expect(value).to.be.true;
						return proxy.somethingThatDoesNotExist().configure({ hasProperty:true });
					},(err)=>{
						done('delete error: '+err,err);
					}).then(({value})=>{
						expect(value).to.be.false;
						done();
					},(err)=>{
						done('hasProperty error: '+err,err);
					});
				});

			});
			
		});
		
		
		
		// promise replies not yet implemented
		/*it("set timeout via .configure({ timeout:1 })",(done)=>{
			proxy.promiseNeverFinish().configure({ timeout:1 }).then(({value})=>{
				done("stringData action succeeded when it should not have");
			},(err)=>{
				expect(err).to.have.property('code');
				expect(err.code).to.equal('TIMEOUT');
				done();
			});
		});*/
		
	});
	
	describe("destroy clients and processes",()=>{
		it("destroy existing clients",(done)=>{
			for(var [key,client] of requireWorker.clientsMap) client._destroy();
			done();
		});
		it("destroy remaining prepared processes",(done)=>{
			var r = requireWorker.destroyPrepareProcesses();
			expect(r).to.be.true;
			done();
		});
	});
	
});
