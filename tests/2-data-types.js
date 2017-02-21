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

describe("Require-Worker Data Types",()=>{
	var client, proxy;
	
	before('require testModule client',()=>{
		client = requireWorker.require(testModuleFile,{ returnClient:true });
		proxy = client.proxy;
	});
	
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
	
	after("destroy client",()=>{
		client._destroy();
	});
	
});