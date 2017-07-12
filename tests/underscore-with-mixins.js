/* global Promise */
"use strict";

var expect = require("chai").expect;

var _ = require('../lib/underscore-with-mixins');
var __ = require('underscore');

var eventEmitter = require('events');

describe("Lib: underscore-with-mixins",()=>{
	
	it("should prototype underscore",()=>{
		expect(Object.getPrototypeOf(_)).to.equal(__);
		expect(__).to.have.ownProperty('isFunction');
		expect(_).to.have.property('isFunction');
		expect(_).to.not.have.ownProperty('isFunction');
	});
	
	it("should have some original underscore methods (quick check)",()=>{
		expect(_.chain).to.be.a('function');
		expect(_.isFunction).to.be.a('function');
	});
	
	it("should have some working original underscore methods (quick check)",()=>{
		expect(_.isFunction).to.satisfy(_.isFunction.bind(_));
		expect('test').to.not.satisfy(_.isFunction.bind(_));
	});
	
	it("should not have mixins on original underscore object",()=>{
		_.each(_.keys(_),(key,index)=>{
			if(['mixin','noConflict'].indexOf(key)!==-1) return;
			expect(__).to.not.have.ownProperty(key);
		});
	});
	
	it("mixin #isPromise",()=>{
		expect(_).to.have.ownProperty('isPromise');
		expect(_.isPromise).to.be.a('function');
		expect(Promise.resolve()).to.satisfy(_.isPromise.bind(_));
		expect('test').to.not.satisfy(_.isPromise.bind(_));
	});
	
	it("mixin #isConstructed",()=>{
		expect(_).to.have.ownProperty('isConstructed');
		expect(_.isConstructed).to.be.a('function');
		expect(new (function(){})).to.satisfy(_.isConstructed.bind(_));
		expect(function(){}).to.not.satisfy(_.isConstructed.bind(_));
		var fn = function(){};
		expect(new fn).to.satisfy(_.isConstructed.bind(_));
		expect(new fn()).to.satisfy(_.isConstructed.bind(_));
		expect(fn).to.not.satisfy(_.isConstructed.bind(_));
		expect(_.isConstructed(new (function(){}),fn)).to.be.false;
	});
	
	it("mixin #isEventEmitter",()=>{
		expect(_).to.have.ownProperty('isEventEmitter');
		expect(_.isEventEmitter).to.be.a('function');
		var events = new eventEmitter();
		expect(events).to.satisfy(_.isEventEmitter.bind(_));
		expect('test').to.not.satisfy(_.isEventEmitter.bind(_));
	});
	
	it("mixin #isStream",()=>{
		expect(_).to.have.ownProperty('isStream');
		expect(_.isStream).to.be.a('function');
		var streamAPI = require('stream');
		var stream = new streamAPI.Readable();
		expect(stream).to.satisfy(_.isStream.bind(_));
		expect('test').to.not.satisfy(_.isStream.bind(_));
	});
	
	it("should have disabled methods",()=>{
		expect(_.isFunction(_)).to.be.false;
		expect(_.mixin).to.throw(Error);
		expect(_.noConflict).to.throw(Error);
	});
	
});
