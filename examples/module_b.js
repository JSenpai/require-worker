"use strict";

// Initialise the worker
require('../index.js').initModule(module);

module.exports.yo = function(name,callback){
	callback('Yo?');
	this.resolve('Yo '+(name||'World')+'!');
};
