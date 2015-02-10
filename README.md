# Papi Stats [![Build Status](https://travis-ci.org/silas/node-papi-stats.png?branch=master)](https://travis-ci.org/silas/node-papi-stats)

Add basic stats support to [Papi][papi] clients.

 * [Example](#example)
 * [License](#license)

## Options

 * count (Function&lt;String, Number&gt;): a function that increments a counter by a given amount
 * timing (Function&lt;String, Number&gt;): a function that records timing data in milliseconds

## Example

``` javascript
var Lynx = require('lynx');
var papi = require('papi');

var metrics = new Lynx('127.0.0.1', 8125, { scope: 'prefix' });

var client = new papi.Client({
  name: 'github',
  baseUrl: 'https://api.github.com',
  timeout: 10000,
});

client._plugin(require('papi-stats'), {
  count: metrics.increment.bind(metrics),
  timing: metrics.timing.bind(metrics),
});

client._get(
  {
    name: 'gists',
    path: '/users/silas/gists',
  },
  function(ctx, next) {
    if (ctx.err && ctx.err.isTimeout && !ctx._retried) {
      ctx._retried = true;
      return ctx.retry();
    }

    next();
  },
  function(err) {
    if (err) throw err;
  }
);
```

This could produce metrics like the following:

```
// responses
prefix.github.gists.2xx:773|ms
prefix.github.gists.4xx:421|ms

// non-responses
prefix.github.gists.error:3|ms
prefix.github.gists.timeout:10001|ms

// ctx.retry called in middleware
prefix.github.gists.retry:1|c
```

## License

This work is licensed under the MIT License (see the LICENSE file).

[papi]: https://github.com/silas/node-papi
