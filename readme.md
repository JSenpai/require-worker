# require-worker - Nodejs Module
> require differently

[![NPM Version][npm-image]][npm-url]
[![Downloads Stats][npm-downloads]][npm-url]

Load a module in a new process. Ideally similar to Nodejs's require().

## What is this?

This module is meant to require other Nodejs modules, but in a new process instead of the same process.

This is very new, experimental and features are still getting implemented.

There are many cases where this will not work with existing modules which accept data types, or return data types that are not yet implemented. Though this is being worked on. See the API below.

## Why use this?

Let's say you want to require a module, but the tasks it performs are synchronous and long, or simply does a lot of number crunching. That module would effect the performance and responsiveness of your application.

When using _require-worker_, that module would instead run in a different process, allowing your application to respond to incoming connections and do it's own number crunching at the same time, while still talking with that module in a similar way it used to.

I decided to create this module because simply creating a forked process, or reworking your application to work with Nodejs clusters, can be cumbersome if your application is already quite complicated. Require'ing a module is easy. Most Nodejs applications require them to expand their functionality. Even modules themselves require other modules. So this module simply makes use of that system, to include the power of using multiple processors too.

## Installation

Warning: This project will rewritten to use ES6 and ES7 features soon (such as async await) which will be the first major release (1.0.0).

Install the module via [NPM](https://www.npmjs.com/package/require-worker)
```
npm install require-worker --save
```
Or [download the latest release](https://github.com/Unchosen/require-worker/releases), or git clone the [repository on GitHub](https://github.com/Unchosen/require-worker).

## Basic Usage Example
More examples are available under the `examples/` directory.

### Main File / callee

```javascript
// require require-worker
var requireWorker = require('require-worker');
// require (using require-worker) a module
var myModule = requireWorker.require(require.resolve('./myModule.js'));

// Call the 'hello' method with an argument. Then handle the promise.
myModule.call('hello','Foo').then(function(result){
	// The promise will resolve when the module method returns a value other than undefined, or when it calls this.resolve()
	console.log('hello: result:',result);
}).catch(function(err){
	// On Error, if the error is generated internally, it will return a string number that will exist in .errorList. Otherwise the error message (or the reject message) will show.
	if(err in requireWorker.errorList) console.log('hello: Error:',result,requireWorker.errorList[err]);
	else console.warn('hello: Error:',err);
});
// Make sure every promise has a .then and a .catch (or .then with 2 arguments as functions)

// Below, we call the 'yo' method on the .methods Proxy property (same as .call('yo','John'...))
// Call the 'yo' method with a string argument, and a function argument.
myModule.methods.yo('Bar',function(msg){
	console.log('yo: callback result:',msg);
}).then(function(result){
	console.log('yo: resolve result:',result);
}).catch(function(err){
	console.log('yo: error:',err);
});
```

### Module File
```javascript
// Initialise the worker
require('require-worker').initModule(module);

// Hello method (always return)
module.exports.hello = function(name){
	// Simply return the result (resolves promise internally)
	return 'Hello '+(name||'World')+'!';
};

// Yo method
module.exports.yo = function(name,callback){
	callback('Do you like pizza? I do.');
	this.resolve('Yo '+(name||'World')+'!');
};
```

## API Reference

**`worker = requireWorker.require(modulePath[,requireOptions])`** Require a new module/worker. Returns a worker object.

modulePath (string): a module path. Use Nodejs's require.resolve(modulePath) if the module has a static or relative path.

requireOptions (object):

* `cwd`: directory for the module to be forked under

* `wrapRequire`: true/false, true if requireWorker.initModule is not called in the module (a usual NPM installed module or an internal Nodejs module).

**`worker.call(methodName[,arguments..][,callOptions])`** Call a method on the module/worker. Returns a promise.

methodName (string): the name of a function or property on the module.exports

arguments (see inputs list below): values to pass to the method

callOptions (callOptions object): the last argument can be a callOptions object created with `requireWorker.callOptions(options)`.

&nbsp; &nbsp; options (object): (all optional) _(these may fix or cause errors & change module compatability)_

* `newInstance`: true/false, call the method with a 'new' keyword (new worker.call(...) also works). Use `null` as the property value to call a new instance of the module.exports object itself (such as the Nodejs [EventEmitter](https://nodejs.org/api/events.html) module).

* `useReturnOnly`: true/false, call the method with the module as the binding object, causing the promise to only resolve with the result of the method's returned value.

* `ignoreResult`: true/false, call the method with the module as the binding object. Finish the promise with `null` as the result.

* `allowUndefined`: any/false, allow `undefined` as the module's return value, to resolve the promise. The result is the value that `allowUndefined` is set to (except `false`).

* `forceProxy`: true/false, force the result to be a proxy

**`worker.methods.property([arguments..])`** the .methods property is a [JavaScript `Proxy`](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Proxy) which any property can be get, set or called on. The property name and it's arguments are passed to the .call method explained above.

**`worker.kill([killcode])`** Kill the worker (forcibly unload module)

**`requireWorker.initModule(module)`** Initialise the requireWorker in the module. Returns `module.exports || module` (not needed if wrapRequire:true is used)

For methods in modules, the call promise can be fulfilled if the function returns with something other than `undefined` (see above for `allowUndefined` callOption). It can also be fulfilled with `this.resolve()` or `this.reject()` which can be done instantly or asynchronously. If the options `newInstance`, `useReturnOnly` or `ignoreResult` are used, a function return will resolve the promise, but the resolve and reject methods will not be available on `this`.

See the examples for more information.

### Inputs / Outputs

Default Input Arguments: `string`, `number`, `array`, `object`, `null`, `boolean` (the basic stuff that can be stringified with JSON in the Nodejs [process IPC channel](https://nodejs.org/api/child_process.html))

Implemented Additional Input Arguments: `function` (as a callback only)

Unavailable Input Arguments: `promise`, `undefined`, & others

Default Output Results: `string`, `number`, `array`, `object`, `null`, `boolean` (the basic stuff that can be stringified with JSON in the Nodejs [process IPC channel](https://nodejs.org/api/child_process.html))

Implemented Additional Output Results: _constructed object_ (which is a JavaScript `Proxy`), `function` (simple callback which can have arguments. _Not a promise_. No return result), `promise`.

Unavailable Output Results: `undefined` (unless `allowUndefined` is passed as a call option) & others.

Support for additional inputs and outputs coming soon.

## Tests

Todo. Basically just run the examples for now and see if any errors show up.

## Contributors

Create issues on the Github project or create pull requests.

All the help is appreciated.

## License

MIT License

Copyright (c) 2017 Jason Sheppard @ https://github.com/Unchosen

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
