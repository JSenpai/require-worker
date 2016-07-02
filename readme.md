# require-worker - Nodejs Module
> require differently

[![NPM Version][npm-image]][npm-url]
[![Downloads Stats][npm-downloads]][npm-url]

Loads a module in a new process. Ideally similar to require(), but in a different thread/process.

## Synopsis

This module is meant to require other nodejs modules, but in a new process instead of the same process.

The usage is not quite the same, so look below for the examples.

## Code Example

TODO

## Installation

```npm install require-worker```

## API Reference

**worker = requireWorker.require(modulePath,requireOptions)** require a new module/worker. Returns a worker object

	**worker.call(methodName,arguments..)** call a method on the module/worker. Returns a promise
	
	**worker.kill()** kill the worker (unload module)
	
**requireWorker.initModule(module)** initialise the require-worker for the required module

## Tests

TODO

## Contributors

Create issues on the Github project or create pull requests.

All the help is appreciated.

## License

MIT License

Copyright (c) [2016] [Jason Sheppard]

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

Github Repository: [https://github.com/Unchosen/require-worker](https://github.com/Unchosen/require-worker)

NPM Package: [https://www.npmjs.com/package/require-worker](https://www.npmjs.com/package/require-worker)

[npm-image]: https://img.shields.io/npm/v/require-worker.svg?style=flat-square
[npm-url]: https://npmjs.org/package/require-worker
[npm-downloads]: https://img.shields.io/npm/dm/require-worker.svg?style=flat-square
