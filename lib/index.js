'use strict';

/**
 * Escape stats name.
 */

var cache = {};

function escape(value) {
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
  var count = options.count;
  var timing = options.timing;
  var group = options.group;

  if (typeof count !== 'function') {
    throw new Error('count is required');
  }
  if (typeof timing !== 'function') {
    throw new Error('timing is required');
  }

  client._ext('onRequest', function(ctx, next) {
    try {
      if (!ctx.hasOwnProperty('_stats')) {
        var client = ctx._client._opts.name;
        var name = ctx.opts.name;

        client = escape(client);
        name = escape(name);

        if (!client || !name) {
          ctx._stats = null;

          return next();
        }

        ctx._stats = {
          name: client + '.' + name,
          time: +new Date(),
        };
      } else if (ctx._stats) {
        ctx._stats.retry = true;
        ctx._stats.time = +new Date();
      }
    } catch (err) {
      // ignore errors
    }

    return next();
  });

  client._ext('onResponse', function(ctx, next) {
    try {
      if (ctx._stats) {
        var postfix;

        if (ctx.res) {
          postfix = group ? Math.floor(ctx.res.statusCode / 100) + 'xx' : ctx.res.statusCode;
        } else {
          postfix = ctx.err && ctx.err.isTimeout ? 'timeout' : 'error';
        }

        timing(ctx._stats.name + '.' + postfix, new Date() - ctx._stats.time);

        if (ctx._stats.retry) {
          count(ctx._stats.name + '.retry', 1);
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

exports._cache = cache;
exports.register = register;