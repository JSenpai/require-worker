
# require-worker API docs

Read [README.md](README.md) before jumping into this documentation.

The require-worker module creates a seperate nodejs process via `cluster.fork` or `childProcess.fork`, which that process then uses the native `require` method on the given path.

Each process can either be dedicated to a single module, or be a shared host to multiple modules. Process & module sharing can be manually specified for what module is shared in the same process as another module.

There are 2 main interfaces. The require-worker *client* which interacts with the forked process, and the require-worker *host* which interacts with the natively required module within the forked process.

# Set up

### Install via npm

```
npm install require-worker@pre-v1 --save
```

### Require within your nodejs project


```js
const requireWorker = require('require-worker');
```

# requireWorker methods

## requireWorker.require()
Usage: `requireWorker.require(path,[options])`

Creates a require-worker client.

```js
const aModule = requireWorker.require("path/to/module");
```

The return value of this method is a [JavaScript Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) which is configured to interact with properties on the module's exports object. See the client proxy interface API docs below.

### paramater: `path`

The path to the module that will be required within the forked process.

`require.resolve()` is automatically called on the path. If the path is relative to the current script which is calling `requireWorker.require()`, then the `parentModule` property should be specified as an option, with the value set to the [module variable](https://nodejs.org/api/modules.html#modules_module) which is global, but unique to each script. This can be skipped by calling `require.resolve(path)` before passing it as the paramater.

### paramater: `options`

The optional `options` paramater specifies client specific behavior.

| Property | Description (when `true` or specified) | Default Value |
|-|-|-|
| `ownProcess` | Dedicate a single process for this module. | `false` |
| `shareProcess` | Provide a require-worker client (or client proxy) to share this module within it's host process.  | `null` |
| `forkOptions` | The fork options passed directly to `.fork`. | automatic |
| `parentModule` | The `module` variable for the current script, which the `path` can be relative to the script's directory. | `null` |
| `returnClient` | Have this require method return the client interface. | `false` |
| `returnClientPromise` | Have this require method return the `client.readyPromise` promise, which when resolved, the value is the client interface. | `false` |
| `preConfigureProxy` | Pre configure the proxy interface | `null` |

When neither `ownProcess` or `shareProcess` is specified, the module will be required within a shared process by other clients which did not specify those options.

## requireWorker.preConfiguredProxy()

Usage: `requireWorker.preConfiguredProxy(target,options)`

An alias for `client.preConfiguredProxy()` (see below), except the `target` paramater can be a client object, a client proxy, or even a proxy call promise.

## requireWorker()

Usage: `requireWorker(object)`

A function that lets you find a require-worker client or host interface.

The `object` paramater can be a client object, a host object, a host module's `exports` variable, or a resolved module path.

This method is mainly used within the required module to get the host interface. For example:

```js
const requireWorkerHost = requireWorker(module.exports);
```

# requireWorker client methods

The require-worker client interface for a module that has been required within a forked process.

## client.isClientProxy()

Usage: `client.isClientProxy(object)`

Check if the given object is a configured proxy for this require-worker client

## client.setChildReferenced()

Usage: `client.setChildReferenced(boolean)`

Specify true or false to set the forked child process as referenced or not. If it's not referenced, it will not keep the NodeJS process open when there is nothing else referenced.

Each forked child process is referenced by default.

## client.destroy()

Usage: `client.destroy()`

Completly destroy the require-worker client. The client can not be used again without calling the `client.restart()` method which basically creates a new client.

The return value is a promise which resolves once the client has been destroyed.

The host will also be destroyed.

All in-progress proxy calls will be rejected with an error that has the `code` property set to `'DESTROYED'`.

## client.restart()

Usage: `client.restart([options])`

Attempt to re-construct the client using the existing options passed to the constructor.

If the `options` paramater is provided, then the given properties will be replaced with the new values.

The return value will be the `client`, Use `client.readyPromise` to access the client ready promise. Use client.proxy to get the new proxy.

## client.preConfiguredProxy()

Usage: `client.preConfiguredProxy(options)`

Creates a proxy interface where all proxy calls are pre-configured with the given options.

# requireWorker client properties

## client.client

The client object (referencing itself). Handy for object destructuring.

## client.proxy

The client proxy object.

## client.events

The client event emitter.

| Event Name | Description |
|-|-|
| `requireSuccess` | Emitted when the module was successfully required. If the event has already been emitted, then all new `requireSuccess` listeners attached to this event will be emitted immediately. |
| `error` | Emitted when a critical error has occurred. |
| `destroy` | Emitted **before** client destruction. |
| `destroyed` | Emitted **after** client destruction. |
| `workerClose` | Emitted when the child process emits the `close` event. |
| `workerDisconnect` | Emitted when the child process emits the `disconnect` event. |
| `workerError` | Emitted when the child process emits the `error` event. |
| `workerExit` | Emitted when the child process emits the `exit` event. |

After an `error` event is emitted, the client & host will both be destroyed.

## client.readyPromise

A promise which resolves when the client has successfully been created and the module has been required. Internally, this is resolved when the `requireSuccess` event is emitted, and rejected when the `error` event is emitted.

The resolved value is the client object.

The promise rejects on failure with the error as the value.

A no-op reject handler is attached when the `returnClientPromise` option is **not** specified.

# requireWorker host methods

The require-worker host interface in a forked child process for the module that was required.

## host.destroy()

Usage: `host.destroy()`

Completly destroy the require-worker host. The forked child process that the host resides within, may be forcefully exited if there are no other hosts that are shared within the same process. If other hosts are shared, then the process can remain open, and the required module can still operate, but can no longer communicate to the require-worker client in the other process.

The return value is a promise which resolves once the host has been destroyed.

The client will also be destroyed.

# requireWorker host properties

## host.events

The host event emitter.

| Event Name | Description |
|-|-|
| `destroy` | Emitted **before** host destruction. |
| `destroyed` | Emitted **after** host destruction. |

# requireWorker client proxy interface

A client proxy interface is a [JavaScript Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) which is configured to interact with properties on the module's exports object.

Every method returns a promise, which either resolves or rejects based on if the method was successfully called, or if the property was successfully `get`, `set` or had other operations done to it. If the property was not found, failed an operation, or errored during a method call, the promise will be rejected.

## Creating a proxy call

Usage: `clientProxy.proxyCall(...args)` where `proxyCall` can be any property that may or may not exist on the module's exports object.

Alternative Usage: `clientProxy['some-method (or property) name'](...args)`

Proxy calls can be called during and after client initialisation, so you don't need to wait for the `requireSuccess` event or for the `readyPromise` promise to resolve to queue up proxy calls.

There can be any number of paramaters of almost any type. Each argument is transformed in some way so it can be transferred between the require-worker client & host, then be applied to the module method, or have operations done on the module property.

The return value for a proxy call, is a promise.

Make sure to have promise rejection handling, as unhandled promise rejections can cause the process to exit.

The require-worker client can be accessed via `clientProxy.constructor.client` and `preConfiguredProxy` can also be accessed via `clientProxy.constructor.preConfiguredProxy`

## Proxy call configurations

Every proxy call returns a promise, with a `.configure(options)` method available *(not available on further chained promises)*. If the proxy call needs to be configured, the method should be called directly after creating the promise, before anything else is done with the promise. If the configure method is called too late, an error will be thrown.

The promise resolves with an object containing the results of the proxy call. The `value` property is the result value. The recommended inline way to get this value is via [object destructuring](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment): `clientProxy.proxyCall().then(({ value })=>{ ... })`. This can be overridden via the `returnKey` option.

When the promise rejects, it is also an object containing the results of the proxy call.

### paramater: `options`

The `options` paramater specifies how the proxy call will behave. See below for examples on how these options effect the proxy call's behavior.

| Property | Description (when `true` or specified) | Default Value |
|-|-|-|
| `deleteProperty` | The `delete` keyword will be called on the property. | false |
| `setProperty` | The property will be set to the given value. If multiple arguments are listed, the property's value will be an array of the given values. | false |
| `hasProperty` | Resolves `true` or `false` if the property exists via the `in` keyword. | false |
| `hasOwnProperty` | Resolves `true` or `false` if the property exists via the `hasOwnProperty` method. | false |
| `resolveError` | The proxy call will never reject. The resolved result will contain an `error` property instead of rejection. | false |
| `returnKey` | Resolve/reject with the specified result property instead of the result object. | - |
| `promiseResult` | Resolve/reject with the target promise value instead of the result object. Same as having `returnKey` as 'promise'. | false |
| `newOperator` | The `new` keyword will be called on the property. If the property is not a method, this will act as the `setProperty` option. This option can also be triggered if the `new` keyword is used on the proxy call. | false |
| `timeout` | The proxy call will reject if the timeout value is reached. | Infinity |
| `promisify` | If `promisify` exists on the `util` module, and if the method has a `promisify` alternative, then that will be called instead of the method. | false |
| `followPromise` | If the method returns a promise, then the proxy call will not resolve until that target promise does. Same with rejection. | false |
| `property` | If the proxy call was initiated via proxy(), then this option can be used to specify what the proxy call `name` / property is. | - |
| `args` | Specifies the arguments when the `property` option is used. | - |
| `callbackLimit` | The maximum amount of times an argument callback can be executed before it is unregistered. | `1` |
| `callbackTimeout` | The maximum amount of time since the proxy call that a callback argument remains registered. | `0` (no limit) |
| `callbackStopPromise` | A promise that when resolved, all callback arguments will be unregistered. | - |
| `callbackOnRemove` | A callback that is fired when a callback argument is unregistered. The argument index is passed as the first paramater. | - |
| `forceProxy` | *TODO: Work In Progress. Not Yet Implemented.* | Automatic |
| `objectPath` | *TODO: Work In Progress. Not Yet Implemented.* | - |
| `eventEmitter` | *TODO: Work In Progress. Not Yet Implemented.* | - |

### Proxy call configure example:

The following will have the proxy call promise resolve with the value, instead of the result object, due to the `returnKey` configure option being applied on the proxy call.

```js
clientProxy.proxyCall().configure({ returnKey:'value' }).then((value)=>{ ... })
```

### The `new` keyword:

The `new` keyword triggers the `newOperator` configure option. This lets you set property values or construct new function objects or classes within the required module.

### `proxy()`:

The proxy object itself can be used as a proxy call function. Use the `property` and `args` configure options to specify the property and arguments. The arguments can also be used normally via `proxy(...args)`.

The following code snippet:

```js
clientProxy().configure({ property:'greetings', args:['friend'] }).then(({ value })=>{ ... })
```

Is the same as calling:

```js
clientProxy('friend').configure({ property:'greetings' }).then(({ value })=>{ ... })
```

Which is also the same as calling:

```js
clientProxy.greetings('friend').then(({ value })=>{ ... })
```

## Working with module properties

*TODO - Coming Soon.*

## Working with module methods

*TODO - Coming Soon.*

## Working with data types

When a proxy call is made, the arguments have to be serialised and sent to the host. The return values also have to be serialised then sent back to the client. Data is sent over the communication channel as JSON strings which means that we need to support references and other data types.

### Basic Data Types

Basic data types are those which can be converted to JSON and back without any issues. Such as `Boolean`, `Number`, `String`, `Object` (no references), `Array` (no references) and `Null`.

### Simple Data Types

The following data types have implemented support: `NaN` (via underscore's _.isNaN method), `Date`, `Promise` and Regular Expressions.

### Function Callbacks

Function callbacks are available as proxy call paramaters, but there are limitations.

They are not yet available as return values.

Simply specify a callback and it can be executed once unless configured by the `callbackLimit` option.

If you are unsure if the callback will ever be executed, specify a timeout via the `callbackTimeout` option.

Client:

```js
clientProxy.whenReady(()=>{
	console.log('ready');
})
.then(({ value })=>{ ... });
```

Host:

```js
exports.whenReady = (cb)=>{
	setTimeout(cb,2000);
};
```

There are options available to specify callback limits and timeouts because the callbacks will remain in memory until they are removed. They can not be automatically garbage collected because they are designed to stay around after the proxy call 'promise' has been completed.

*This area is still a work in progress.*

### Other Data Types

Any Object or Array that contain values that can not be stringified with JSON, will be ignored. If the Object or Array is safe *(Work In Progress)*, it will work.

*This area is still a work in progress.*

The plan is to have any unsafe data type be sent over as a new proxy, which will act like the client.proxy but have the target as the original value, so proxy calls will be available on that proxy object.

If you are using third-party modules, the best way to handle these data type issues, is to have your own module (which is required via require-worker) which interacts with the third-party module.

# Async-Await

Since most of the API is promise based, [async await](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function) can improve the usability of the API.

The below example creates the client, then waits for a proxy call. The proxy call internally waits for the client to finish initialising.

```js
(async ()=>{
	const myModule = require('require-worker').require('myModule');
	var { value:name } = await myModule.getModuleName();
	console.log(name);
})();
```

Without [object destructuring](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment), you will need to await, then fetch the value.

```js
(async ()=>{
	const myModule = require('require-worker').require('myModule');
	var name = (await myModule.getModuleName()).value;
	// Or: var name = await myModule.getModuleName().then(({ value })=>value);
	// ...
})();
```

If you only want the proxy call result value, then you can use the proxy call configure option `returnKey` as `'value'`.

```js
(async ()=>{
	const requireWorker = require('require-worker');
	const myModule = requireWorker.require('myModule');
	var name = await myModule.getModuleName().configure({ returnKey:'value' });
	// ...
})();
```

Or use a preconfigured proxy via `client.preConfiguredProxy()`.

```js
(async ()=>{
	const requireWorker = require('require-worker');
	const client = requireWorker.require('myModule',{ returnClient:true });
	const myModule = client.preConfiguredProxy({ returnKey:'value' });
	var name = await myModule.getModuleName();
	// ...
})();
```

Or use a preconfigured proxy with the `preConfigureProxy` client option.

```js
(async ()=>{
	const requireWorker = require('require-worker');
	const myModule = requireWorker.require('myModule',{ preConfigureProxy:{ returnKey:'value' } });
	var name = await myModule.getModuleName();
	// ...
})();
```
