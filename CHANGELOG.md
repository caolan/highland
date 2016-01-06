Changelog
=========

This file does not aim to be comprehensive (you have git history for that),
rather it lists changes that might impact your own code as a consumer of
this library.

2.6.0
-----
### Bugfix
* `parallel` no longer drops elements on the floor in a number of cases.
  [#302](https://github.com/caolan/highland/pull/302), 
  [#331](https://github.com/caolan/highland/pull/331). 
  Fixes [#234](https://github.com/caolan/highland/pull/234), 
  [#328](https://github.com/caolan/highland/pull/328).
* Calling `next` before `push` within a generator stream no longer causes the
  stream to resume and throw away data when used with `pull`. 
  [#326](https://github.com/caolan/highland/pull/326). Fixes 
  [#325](https://github.com/caolan/highland/pull/325).
* Parallel no longer drops data if paused. 
  [#331](https://github.com/caolan/highland/pull/331). Fixes 
  [#328](https://github.com/caolan/highland/pull/328).
* Various grammar fixes and documentation updates. 
  [#341](https://github.com/caolan/highland/pull/341),
  [#354](https://github.com/caolan/highland/pull/354), 
  [#381](https://github.com/caolan/highland/pull/381),
  [#397](https://github.com/caolan/highland/pull/397),
  [#407](https://github.com/caolan/highland/pull/407)
* `isStream` now always returns a boolean. Before, it would return `undefined`
  if the argument was an object but not a Highland stream. 
  [#343](https://github.com/caolan/highland/pull/343).
* Streams now unpipe from Readable on destroy.
  [#361](https://github.com/caolan/highland/pull/361).
* `_send` now keeps a reference to the correct consumer/observer array.
  [#367](https://github.com/caolan/highland/pull/367). Fixes 
  [#366](https://github.com/caolan/highland/pull/366).
* Streams constructed with `pipeline` now correctly exert backpressure. 
  [#372](https://github.com/caolan/highland/pull/372),
  [#377](https://github.com/caolan/highland/pull/377). 
  Also fixes an possible issue with not consuming errors from promises.
  [#391](https://github.com/caolan/highland/pull/391).
* It is no longer possible to re-enter the consume callback. 
  [#393](https://github.com/caolan/highland/pull/393).

### New additions
* `mergeWithLimit`: Like `merge`, but with an argument to specify the maximum
  number of parallel stream that can be consumed at once.
  [#375](https://github.com/caolan/highland/pull/375).
* minified build: There is now a minified version of the browser build under
  `dist/highland.min.js`. [#392](https://github.com/caolan/highland/pull/392).
* `wrapCallback`: The function now takes a second argument (`mappingHint`) that
  describes how arguments passed to the callback are handled. It behaves like
  the `mappingHint` parameter of the stream constructor. 
  [#247](https://github.com/caolan/highland/pull/247). Fixes 
  [#246](https://github.com/caolan/highland/pull/246), 
  [#334](https://github.com/caolan/highland/pull/334).
* Node 4 and 5: Added support for node 4 and 5. 
  [#383](https://github.com/caolan/highland/pull/383).

### Improvements
* The runtime of `pick` *per object* is now `O(n)`, where `n` is the number of
  properties to be picked. It was previously `O(mn)`, where `m` is the number of
  pickable properties on the object. [#286](https://github.com/caolan/highland/pull/286).
* Both `pick` and `pickBy` can now select non-enumerable keys.
  [#286](https://github.com/caolan/highland/pull/286).
* `parallel` now throws descriptive errors if it encounters a value that is not
  a stream. [#318](https://github.com/caolan/highland/pull/318).
* The standalone Highland file is now built using Browserify 12.0.1.
* Updates a number of `devDependencies`. If you develop on Highland, make sure
  to update the dependencies. [#384](https://github.com/caolan/highland/pull/384), 
  [#385](https://github.com/caolan/highland/pull/385), 
  [#387](https://github.com/caolan/highland/pull/387), 
  [#390](https://github.com/caolan/highland/pull/390),
  [#400](https://github.com/caolan/highland/pull/400),
  [#403](https://github.com/caolan/highland/pull/403),
  [#415](https://github.com/caolan/highland/pull/415).
* `uniq` now uses a
  [Set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set)
  to compute uniqueness whenever available, resulting in a significant
  performance boost for large streams. The definition of equality is still
  `===`, not the `SameValueZero` algorithm used by `Set`.
  [#395](https://github.com/caolan/highland/pull/395)
* `parallel` now throws if provided an argument that is not a number.
  [#421](https://github.com/caolan/highland/pull/421).

### Other
* Dropped support for Node 0.11.
* Dropped support for iojs.
* Deprecation warnings for API changes upcoming in version 3.0.0 have been added.
  [#417](https://github.com/caolan/highland/pull/417)

2.5.1
-----
### Bugfix
* Move stream check in constructor to beginning of object branch. #303

2.5.0
-----
### New additions

* `drop`: Ignores the first `n` values of a stream and then emits
  the rest. #75 #244 
* `done`: Calls the supplied function once the stream has ended. #161
* `sort`: Collects all values together then emits each value individually but in
  sorted order. #169 #245
* `streamifyAll`: Takes an object or a constructor function and returns that object
  or constructor with streamified versions of its function properties. #226 
* `Iterator` Support: ECMA2015 (aka ES6) style iterators can now be passed to
  the Highland constructor function. #235 
* `slice`: Creates a new stream with the values from the source in the range of
  specified in the`start` and `end` parameters. #250 
* `batchWithTimeOrCount`: Takes one Stream and batches incoming data within
  a maximum time frame into arrays of a maximum length. #284

### Improvements

* `each` now returns an empty stream rather than nothing. #161.
* Ensure `through` propagates Node stream errors. #240 
* Preserve `this` context of wrapped function when using `wrapCallback`. #248 
* Update `tranduce` to use latest version of [transformer protocol](https://github.com/cognitect-labs/transducers-js#transformer-protocol). #261

2.0.0
-----

* The `source.merge()` algorithm now evaluates the entire source stream before
  reading from all of the resulting streams in parallel (previously it would
  start reading as soon as the source emitted the next stream)
* The `merge()` function now attempts to balance inputs more fairly. For example,
  if stream A has 100 values buffered and stream B gets a new value after 100ms,
  if we read at 200ms we'll get a value from each stream. Previously it would
  exhaust the stream A buffer before reading from stream B.
