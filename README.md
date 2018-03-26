# require-worker - Nodejs Module

[![NPM Version][npm-image]][npm-url]
[![Downloads Stats][npm-downloads]][npm-url]
[![Travis CI][travis-image]][travis-url]

Load a module in a new process, then use promises to interact with it.

## What is this?

This module is meant to require other Nodejs modules, but in a new process instead of the same process.

This is very new, experimental and features are still getting implemented.

There are many cases where this will not work with existing modules which accept data types, or return data types that are not yet implemented. Though this is being worked on. [See the API][api-url].

## Why use this?

Let's say you want to require a module, but the tasks it performs are synchronous and long, or simply does a lot of number crunching. That module would effect the performance and responsiveness of your application.

When using _require-worker_, that module would instead run in a different process, allowing your application to respond to incoming connections and do it's own number crunching at the same time, while still talking with that module in a similar way it used to.

I decided to create this module because simply creating a forked process and changing how you talk to the other code in the other process, can be cumbersome if your application is already quite complicated. Importing a module is easy. Most Nodejs applications require them to expand their functionality. Even modules themselves require other modules. So this module simply makes use of that ideology.

## Installation

Nodejs 6.0 or greater is required. This project is written with ES6 features

Warning: This is currently in pre-release. It is not production-ready. Not all planned features are implemented yet.

Install the pre-release module via [NPM][npm-url]
```
npm install require-worker@pre-v1 --save
```
Or [download the latest release][github-releases], or git clone the [repository on GitHub][github-branch].

## How to use

[See the API][api-url] for more information.

```js
// Require require-worker
const requireWorker = require('require-worker');

// Example Using Async Await
(async ()=>{
	// Require native nodejs OS module (return proxy)
	const os = requireWorker.require('os');
	// Proxy call userInfo()
	var { value:userInfo } = await os.userInfo();
	// Output result
	console.log(userInfo);
	// Stop require-worker
	await os.constructor.client.destroy();
})();
```

## Tests

View results on [Travis-CI][travis-url], or run tests manually:

Install development dependencies for this module: `npm install`

Then run the test npm script: `npm test`

Since this module spawns child processors, some test results may take a while to complete.

Tests are written with ES6 features just like this module.

## Contributors

Create issues or pull requests on the GitHub project.

All the help is appreciated.

## License

MIT License

Copyright (c) 2018 Jason Sheppard @ https://github.com/Jashepp

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

Github Repository: [https://github.com/Jashepp/require-worker][github-url]

NPM Package: [https://npmjs.org/package/require-worker][npm-url]

[api-url]: API.md
[github-url]: https://github.com/Jashepp/require-worker
[github-branch]: https://github.com/Jashepp/require-worker/tree/master
[github-releases]: https://github.com/Jashepp/require-worker/releases
[github-tags]: https://github.com/Jashepp/require-worker/tags
[npm-image]: https://img.shields.io/npm/v/require-worker.svg?style=flat-square
[npm-url]: https://npmjs.org/package/require-worker
[npm-downloads]: https://img.shields.io/npm/dm/require-worker.svg?style=flat-square
[travis-image]: https://travis-ci.org/Jashepp/require-worker.svg?branch=master
[travis-url]: https://travis-ci.org/Jashepp/require-worker
