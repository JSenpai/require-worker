/* global exports */
"use strict";

var requireWorker = require('../');

var test = requireWorker.require('./example1_module.js');
//var rwTest = test.constructor;

/*
test(12,1).configure({ foo:'bar' }).then(({value})=>{ console.log('():',value); });

new test(43,88).then(({value})=>{ console.log('new ():',value); });

test.foo(1).then(({value})=>{
	console.log('foo:',value);
});

new test.foo(2).then(({value})=>{
	console.log('new foo:',value);
});
*/

test.hello('World').then(({value})=>{
	console.log("test.hello('World') result:",value);
}).catch((err)=>{
	console.error("test.hello('World') error:",err);
});

test.foo().then(({value})=>{
	console.log("test.foo() result:",value);
}).catch((err)=>{
	console.error("test.foo() error:",err);
});
