/* global exports */
"use strict";

exports.foo = 'bar';

exports.hello = (arg)=>{
	//require('../')(exports)._destroy();
	return 'Hello '+arg+'!';
};

exports.someObject = {
	name: 'Tree',
	type: 'Oak',
	age: '25y7m4d',
	height: '6.8m'
};
