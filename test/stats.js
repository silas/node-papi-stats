'use strict';

/**
 * Module dependencies.
 */

var debug = require('debug')('papi');
var nock = require('nock');
var papi = require('papi');
var should = require('should');
var util = require('util');

var stats = require('../lib');

/**
 * Helper
 */

describe('papi-stats', function() {
  before(function() {
    nock.disableNetConnect();
  });

  after(function() {
    nock.enableNetConnect();
  });

  beforeEach(function() {
    var self = this;

    self.baseUrl = 'http://example.org';
    self.stats = [];

    self.count = function(name, value) {
      self.stats.push({
        name: name,
        type: 'count',
        value: value,
      });
    };

    self.timing = function(name, value) {
      self.stats.push({
        name: name,
        type: 'timing',
        value: value,
      });
    };

    function Example(opts) {
      opts = opts || {};

      opts.baseUrl = self.baseUrl;

      if (!opts.name) {
        if (opts.name === null) {
          delete opts.name;
        } else {
          opts.name = 'example.org';
        }
      }

      papi.Client.call(this, opts);

      this.on('log', debug);
    }

    util.inherits(Example, papi.Client);

    Example.prototype.test = function(callback) {
      var opts = {
        name: 'test',
        path: '/test',
        timeout: 11,
      };

      this._get(opts, callback);
    };

    Example.prototype.ping = function(callback) {
      this._get('/ping', callback);
    };

    Example.prototype.hello = function(callback) {
      var opts = {
        name: 'hello!world',
        path: '/hello',
      };

      this._get(opts, function(ctx, next) {
        if (ctx.res && ctx.res.statusCode === 500) {
          ctx.retry();
        } else {
          next();
        }
      }, callback);
    };

    self.client = function(opts, options) {
      opts = opts || {};
      options = options || { count: self.count, timing: self.timing };

      var client = new Example(opts);
      client._plugin(stats, options);

      return client;
    };

    self.nock = nock(self.baseUrl);
  });

  describe('register', function() {
    it('should require count', function() {
      var self = this;

      (function() {
        self.client(null, {});
      }).should.throw('count is required');
    });

    it('should require timing', function() {
      var self = this;

      (function() {
        self.client(null, { count: function() {} });
      }).should.throw('timing is required');
    });
  });

  describe('ext', function() {
    it('should not track unnamed clients', function(done) {
      var self = this;

      var client = self.client({ name: null });

      self.nock.get('/test').reply(204);

      client.test(function(err) {
        should.not.exist(err);

        should(self.stats).be.empty;

        done();
      });
    });

    it('should not track unnamed methods', function(done) {
      var self = this;

      var client = self.client();

      self.nock.get('/ping').reply(204);

      client.ping(function(err) {
        should.not.exist(err);

        should(self.stats).be.empty;

        done();
      });
    });

    it('should not track methods with incomplete names', function(done) {
      var self = this;

      var client = self.client({ name: '!!!' });

      self.nock.get('/test').reply(200);

      client.test(function(err) {
        should.not.exist(err);

        should(self.stats).be.empty;

        done();
      });
    });

    it('should track responses', function(done) {
      var self = this;

      var client = self.client();

      self.nock.get('/test').reply(201);

      client.test(function(err) {
        should.not.exist(err);

        should(self.stats).be.length(1);

        self.stats[0].name.should.equal('example_org.test.201');
        self.stats[0].value.should.be.a.Number;
        self.stats[0].type.should.equal('timing');

        done();
      });
    });

    it('should track grouped responses', function(done) {
      var self = this;

      var client = self.client(null, {
        group: true,
        count: self.count,
        timing: self.timing,
      });

      self.nock.get('/test').reply(201);

      client.test(function(err) {
        should.not.exist(err);

        should(self.stats).be.length(1);

        self.stats[0].name.should.equal('example_org.test.2xx');
        self.stats[0].value.should.be.a.Number;
        self.stats[0].type.should.equal('timing');

        done();
      });
    });

    it('should track error responses', function(done) {
      var self = this;

      var client = self.client();

      self.nock.get('/test').reply(500);

      client.test(function(err) {
        should.exist(err);

        should(self.stats).be.length(1);

        self.stats[0].name.should.equal('example_org.test.500');
        self.stats[0].value.should.be.a.Number;
        self.stats[0].type.should.equal('timing');

        done();
      });
    });

    it('should track timeouts', function(done) {
      var self = this;

      var client = self.client();

      self.nock.get('/test').delayConnection(100).reply(200);

      client.test(function(err) {
        should.exist(err);

        should(self.stats).be.length(1);

        self.stats[0].name.should.equal('example_org.test.timeout');
        self.stats[0].value.should.be.above(10);
        self.stats[0].type.should.equal('timing');

        done();
      });
    });

    it('should track errors', function(done) {
      var self = this;

      var client = self.client();

      client.test(function(err) {
        should.exist(err);

        should(self.stats).be.length(1);

        self.stats[0].name.should.equal('example_org.test.error');
        self.stats[0].value.should.be.a.Number;
        self.stats[0].type.should.equal('timing');

        done();
      });
    });

    it('should escape metric names', function(done) {
      var self = this;

      var client = self.client();

      self.nock.get('/hello').reply(200);
      self.nock.get('/hello').reply(200);

      client.hello(function(err) {
        should.not.exist(err);

        should(self.stats).be.length(1);

        client.hello(function(err) {
          should.not.exist(err);

          should(self.stats).be.length(2);

          self.stats[0].name.should.equal('example_org.hello_world.200');
          self.stats[0].value.should.be.a.Number;
          self.stats[0].type.should.equal('timing');
          self.stats[1].name.should.equal('example_org.hello_world.200');
          self.stats[1].value.should.be.a.Number;
          self.stats[1].type.should.equal('timing');

          done();
        });
      });
    });

    it('should track retries', function(done) {
      var self = this;

      var client = self.client();

      self.nock.get('/hello').reply(500);
      self.nock.get('/hello').reply(404);

      client.hello(function(err) {
        should.exist(err);

        should(self.stats).be.length(3);

        self.stats[0].name.should.equal('example_org.hello_world.500');
        self.stats[0].value.should.be.a.Number;
        self.stats[0].type.should.equal('timing');
        self.stats[1].name.should.equal('example_org.hello_world.404');
        self.stats[1].value.should.be.a.Number;
        self.stats[1].type.should.equal('timing');
        self.stats[2].name.should.equal('example_org.hello_world.retry');
        self.stats[2].value.should.equal(1);
        self.stats[2].type.should.equal('count');

        done();
      });
    });

    it('should handle unnamed retries', function(done) {
      var self = this;

      var client = self.client({ name: null });

      self.nock.get('/hello').reply(500);
      self.nock.get('/hello').reply(200);

      client.hello(function(err) {
        should.not.exist(err);

        should(self.stats).be.length(0);

        done();
      });
    });
  });
});
