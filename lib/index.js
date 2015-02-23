'use strict';

/**
 * Variables.
 */

var internals = {
  cache: {},
};

/**
 * Escape stats name.
 */

function escape(cache, value) {
  if (!value) return value;

  var v = cache[value];

  if (!v) {
    v = value
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/(^_+|_+$)/g, '');

    cache[value] = v;
  }

  return v;
}

/**
 * Register plugin.
 */

function register(client, options) {
  var cache = options.cache || internals.cache;
  var count = options.count;
  var timing = options.timing;

  if (typeof count !== 'function') {
    throw new Error('count is required');
  }
  if (typeof timing !== 'function') {
    throw new Error('timing is required');
  }

  client._ext('onRequest', function(request, next) {
    try {
      if (!request.state.hasOwnProperty('stats')) {
        var client = request._client._opts.name;
        var name = request.opts.name;

        client = escape(cache, client);
        name = escape(cache, name);

        if (!client || !name) {
          request.state.stats = null;

          return next();
        }

        request.state.stats = {
          name: client + '.' + name,
          time: +new Date(),
        };
      } else if (request.state.stats) {
        request.state.stats.retry = true;
        request.state.stats.time = +new Date();
      }
    } catch (err) {
      // ignore errors
    }

    return next();
  });

  client._ext('onResponse', function(request, next) {
    try {
      if (request.state.stats) {
        var postfix;

        var res = request.res;
        var err = request.err;

        if (res) {
          postfix = res.statusCode;
        } else if (err && err.isAbort) {
          postfix = 'abort';
        } else if (err && err.isTimeout) {
          postfix = 'timeout';
        } else {
          postfix = 'error';
        }

        timing(request.state.stats.name + '.' + postfix, new Date() - request.state.stats.time);

        if (request.state.stats.retry) {
          count(request.state.stats.name + '.retry', 1);
        }
      }
    } catch (err) {
      // ignore errors
    }

    return next();
  });
}

/**
 * Register attributes
 */

register.attributes = require('../package.json');

/**
 * Module exports.
 */

exports.register = register;
