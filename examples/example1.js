/* global exports, Promise */
"use strict";

var requireWorker = require('../');

var test = requireWorker.require('./example1_module.js');
var test2 = requireWorker.require('./example1_module.js',{ ownProcess:true });
var test3 = requireWorker.require('./example1_module.js',{ shareProcess:test2 });

test(12,1).then(({value})=>{
	console.log('test(12,1):',value);
},(err)=>{
	console.error("test(12,1) error:",err);
});

new test(43,88).then(({value})=>{
	console.log('new test(43,88):',value);
},(err)=>{
	console.error("new test(43,88) error:",err);
});

test.foo(1).then(({value})=>{
	console.log("test.foo(1):",value);
},(err)=>{
	console.error("test.foo(1) error:",err);
});

// This timeout example depends on device speed, it may resolve or reject.
test.foo().configure({ timeout:1 }).then(({value})=>{
	console.log("test.foo().configure({ timeout:1 }):",value);
}).catch((err)=>{
	console.error("test.foo().configure({ timeout:1 }) error:",err);
});

// same as test.foo('set test').configure({ setProperty:true })
new test.foo('set test').then(({value})=>{
	console.log("new test.foo('set test'):",value);
},(err)=>{
	console.error("new test.foo(2) error:",err);
});

test.foo().then(({value})=>{
	console.log("test.foo():",value);
	//requireWorker(test)._destroy();
}).catch((err)=>{
	console.error("test.foo() error:",err);
});

test.hello('World').then(({value})=>{
	console.log("test.hello('World'):",value);
}).catch((err)=>{
	console.error("test.hello('World') error:",err);
});

// configure options 'property' and 'args' are only available directly via proxyObject()
test2().configure({ property:'hello', args:['example'] }).then(({value})=>{
	console.log("test2().configure(...):",value);
}).catch((err)=>{
	console.error("test2().configure(...) error:",err);
});

test2.foo().configure({ deleteProperty:true }).then(({value})=>{
	console.log("test2.foo().configure({ deleteProperty:true }):",value);
}).catch((err)=>{
	console.error("test2.foo().configure({ deleteProperty:true }) error:",err);
});

//test2().configure({ property:'foo', args:['test'], setProperty:true }).then(()=>{},()=>{});

test2.foo().then(({value})=>{
	console.log("test2.foo():",value);
}).catch((err)=>{
	console.error("test2.foo() error:",err);
});

// if arguments are supplied to an object proxyInvoker, get some properties of that object
test3.someObject('name','type','test123').then(({value})=>{
	console.log("test3.someObject('name','type','test123'):",value);
}).catch((err)=>{
	console.error("test3.someObject('name','type','test123') error:",err);
});
