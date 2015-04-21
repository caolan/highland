# Highland

The high-level streams library for Node.js and the browser.
View the [Highland website](http://highlandjs.org) for more in-depth
documentation.

[![build status](https://secure.travis-ci.org/caolan/highland.png)](http://travis-ci.org/caolan/highland)
[![Join the chat at https://gitter.im/caolan/highland](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/caolan/highland?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

## Introduction

Re-thinking the [JavaScript](http://underscorejs.org)
[utility](http://lodash.com) [belt](https://github.com/caolan/async),
Highland manages synchronous and asynchronous code easily, using nothing more than
standard JavaScript and Node-like Streams.
You may be familiar with Promises, EventEmitters and callbacks, but moving
between them is far from seamless. Thankfully, there exists a deeper abstraction
which can free our code. By updating the tools we use on Arrays, and applying them
to values distributed in time instead of space, we can discard plumbing and
focus on the important things. With Highland, you can switch between
synchronous and asynchronous data sources at will, without having to
re-write your code. Time to dive in!

Made by <a href="http://twitter.com/caolan">@caolan</a>, with help and patience from friends - <a href="http://gittip.com/caolan">Leave a tip</a> or <a href="https://github.com/caolan/highland">fork this</a> :)

## Examples

Usage as a Node.js module

```javascript
var _ = require('highland');
```

Converting to/from Highland Streams

```javascript
_([1,2,3,4]).toArray(function (xs) {
    // xs is [1,2,3,4]
});
```

Mapping over a Stream

```javascript
var doubled = _([1,2,3,4]).map(function (x) {
    return x * 2;
});
```

Reading files in parallel (4 at once)

```javascript
var data = _(filenames).map(readFile).parallel(4);
```

Handling errors

```javascript
data.errors(function (err, rethrow) {
    // handle or rethrow error
});
```

Piping to a Node Stream

```javascript
data.pipe(output);
```

Piping in data from Node Streams

```javascript
var output = fs.createWriteStream('output');
var docs = db.createReadStream();

// wrap a node stream and pipe to file
_(docs).filter(isBlogpost).pipe(output);

// or, pipe in a node stream directly:
var through = _.pipeline(_.filter(isBlogpost));
docs.pipe(through).pipe(output);
```

Handling events

```javascript
var clicks = _('click', btn).map(1);
var counter = clicks.scan(0, _.add);

counter.each(function (n) {
    $('#count').text(n);
});
```

Learn more at [highlandjs.org](http://highlandjs.org)
