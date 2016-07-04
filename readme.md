# require-worker - Nodejs Module
> require differently

[![NPM Version][npm-image]][npm-url]
[![Downloads Stats][npm-downloads]][npm-url]

Loads a module in a new process. Ideally similar to require(), but in a different thread/process.

## What is this?

This module is meant to require other Nodejs modules, but in a new process instead of the same process.

This is very new and features are still getting implemented.

There are many cases where this will not work with existing modules which accept data types, or return data types that are not yet implemented. Though this is being worked on. See below for accepted inputs and outputs.

The usage is not quite the same, so look at the examples and the API.

## Installation

Install the module via [NPM](https://www.npmjs.com/package/require-worker)
```
npm install require-worker
```
Or download the files in the [git repository](https://github.com/Unchosen/require-worker) or those listed in the [latest releases](https://github.com/Unchosen/require-worker/releases).

## Code Example
More examples are available under ./examples/

### Main file / callee

```javascript
// Require the requireWorker
var requireWorker = require('require-worker');

// requireWorker.require a module
var someModule = requireWorker.require(require.resolve('./module_a.js'));

// If the module does not have initModule code within it, simply pass the wrapRequire:true as an option
//var someModule = requireWorker.require(require.resolve('./module_a.js'),{ wrapRequire:true });

// Call the 'hello' method on the module (module.exports.hello)
// The call method returns a Promise for success & failure
someModule.call('hello','Foo').then(function(result){
	// The promise will resolve when the module method returns a value other than undefined, or when they called this.finish()
	console.log('hello: Result:',result);
},function(err){
	// On Error, if the error is generated internally, it will return a string number that will exist in .errorList. Otherwise the error message (or the reject message) will show.
	if(err in requireWorker.errorList) console.log('hello: Error:',result,requireWorker.errorList[err]);
	else console.warn('hello: Error:',err);
});

// Call the 'hello' method on the module (module.exports.hello)
someModule.call('hai','Bar').then(function(result){
	console.log('hai: Result:',result);
});

// Call a null method, which only exists within the requireWorker code (handy to test if worker is still alive)
someModule.call(null).then(function(){
	console.log('Worker is still alive');
},function(err){
	console.log('Worker may not be alive? '+err);
});

// The above methods were done via .call
// Below methods are done via a Proxy object at .methods (each property returns a function that does .call automatically)

// This method will always fail
someModule.methods.rejectMe().then(function(result){
	console.log('rejectMe: Then Result:',result);
},function(result){
	// On the requireWorker, there is a list of error codes which have a string representation of the error (handy for debugging)
	if(result in requireWorker.errorList) console.log('rejectMe: Catch Error:',result,requireWorker.errorList[result]);
	else console.log('rejectMe: Catch Error:',result);
});

// This method lets you use callbacks (anonymous function as an argument)
var intervalCount = 0;
someModule.methods.intervalTest('Foo',function(arg1,arg2){
	console.log('intervalTest:',arg1,arg2);
	intervalCount++;
	//if(intervalCount>=2) this.finish(); // If .finish is called on this side, it will internally ignore future callback calls
},function(){
	console.log('intervalTest:','second callback');
}).then(function(){
	// The callbacks will no longer be called
	console.log('intervalTest:','promise done');
});

// This call promise also works with non-function properties, as if they were functions returning their own value
someModule.methods.someValue().then(function(value){
	console.log('someModule.methods.someValue:',value);
});
// Can also set the value with the first argument (results with new value)
someModule.methods.someValue('Some other value').then(function(value){
	console.log('someModule.methods.someValue has been set to:',value);
});
// It also works with functions! (only if the property exists already as a non-function type. eg: null)
// Set property onTest to a function
someModule.methods.onTest(function(a,b,c){
	console.log('onTest callback:',a+', '+b+', '+c);
}).then(function(){
	// Now all calls to onTest will work the other way
	someModule.methods.onTest('Test 123','abc','Foo Bar').then(function(value){
		// All Good
	},function(err){
		console.warn('Failed to call onTest:',requireWorker.errorList[err]);
	});
},function(err){
	console.warn('Failed to set onTest:',requireWorker.errorList[err]);
});

// Note: For internal Nodejs modules, and other modules installed via NPM, wrapRequire:true must be specified in the require options.

// The Nodejs OS module
var osWorker = requireWorker.require('os',{ wrapRequire:true }), os = osWorker.methods;
os.arch().then(function(result){
	console.log('os.arch result:',result);
	osWorker.kill();
});

// The Nodejs Path module
var pathWorker = requireWorker.require('path',{ wrapRequire:true }), path = pathWorker.methods;
// Lets chain some promises
path.normalize('/foo/bar//baz/asdf/quux/..').then(function(result){
	console.log('path.normalize result:',result);
	return path.resolve(result, '../hello/world')
}).then(function(result){
	console.log('path.resolve result:',result);
	pathWorker.kill();
});
```

### Module File
```javascript
// Initialise the worker
// If the 'module' object is passed, then the host calls will use the methods on module.exports
// If 'exports' does not exist in the object passed, then the object itself will be where the methods are called on.
// This initModule call is not needed if required with option: wrapRequire:true
require('require-worker').initModule(module);

// Some non-function properties
module.exports.someValue = 'Foo Bar';
module.exports.onTest = null;

// Declare some methods
// hello method (always return)
module.exports.hello = function(name){
	// Simply return the result (finishes promise internally)
	return 'Hello '+(name||'World')+'!';
};

// hai method (always finish)
module.exports.hai = function(name){
	// Finish the promise (async method) with the result
	this.finish('Hello '+(name||'World')+'!');
	// If the function returns something (that is not undefined), it will use that as the result instead and all future promise finishes/rejects are ignored
};

// rejectMe method (always reject)
module.exports.rejectMe = function(){
	// Always reject
	this.reject('Rejected');
};

// intervalTest method. This creates a timer which calls a callback.
module.exports.intervalTest = function(text,callback1,callback2){
	var self = this;
	var count = 0;
	// Set an interval to call a callback every x seconds
	var tmr = setInterval(function(){
		callback1(text,new Date().toLocaleString());
		count++;
		if(count>=5){
			// Stop the timer and finish the promise
			callback2();
			self.finish();
			clearInterval(tmr);
		}
	},1000);
};

// Note that you can also require another module with requireWorker within this module
```

## API Reference

**`worker = requireWorker.require(modulePath[,requireOptions])`** Require a new module/worker. Returns a worker object

modulePath (string): a module path. Use Nodejs's require.resolve(modulePath) if the module has a static or relative path.

requireOptions (object):

&nbsp; &nbsp; `cwd` - directory for the module to be forked under

&nbsp; &nbsp; `wrapRequire` - true/false, true if requireWorker.initModule is not called in the module (a usual npm installed module or an internal Nodejs module).

**`worker.call(methodName[,arguments..])`** Call a method on the module/worker. Returns a promise

methodName (string): the name of a function or property on the module.exports

**`worker.methods.property([arguments..])`** Call a method on the module/worker. Returns a promise. If the property is a non-function in the module, it results with the value, or it set's the value if an argument is specified.

.property (string): the name of a function or property on the module.exports

**`worker.kill([killcode])`** Kill the worker (forcibly unload module)

**`requireWorker.initModule(module)`** Initialise the requireWorker in the module. Returns `module.exports || module` (not needed if wrapRequire:true is used)

See the examples above for more information.

### Inputs / Outputs

Default Input Arguments: `string`, `number`, `array`, `object`, `null`, `boolean` (the basic stuff that can be stringified with JSON in the Nodejs [process IPC channel](https://nodejs.org/api/child_process.html))

Impemented Additional Input Arguments: `function` (as a callback only)

Unavailable Input Arguments: `promise`, `undefined`, & others

Default Output Results: `string`, `number`, `array`, `object`, `null`, `boolean` (the basic stuff that can be stringified with JSON in the Nodejs [process IPC channel](https://nodejs.org/api/child_process.html))

Impemented Additional Output Results: none yet

Unavailable Output Results: `function`, `new function` (with other functions or prototypes), `promise`, `undefined`, & others

## Tests

Todo

## Contributors

Create issues on the Github project or create pull requests.

All the help is appreciated.

## License

MIT License

Copyright (c) 2016 Jason Sheppard

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Links

Github Repository: [https://github.com/Unchosen/require-worker](https://github.com/Unchosen/require-worker)

NPM Package: [https://www.npmjs.com/package/require-worker](https://www.npmjs.com/package/require-worker)

[npm-image]: https://img.shields.io/npm/v/require-worker.svg?style=flat-square
[npm-url]: https://npmjs.org/package/require-worker
[npm-downloads]: https://img.shields.io/npm/dm/require-worker.svg?style=flat-square
