Changelog
=========

This file does not aim to be comprehensive (you have git history for that),
rather it lists changes that might impact your own code as a consumer of
this library.

2.11.1
------
### Bugfix
* Remove usages of `Function.prototype.bind`. We support IE8.
  [#632](https://github.com/caolan/highland/issues/632).
* Add a section about supported JS engines to the documentation.

2.11.0
------
### New additions
* `toPromise`: Converts a one-element or zero-element stream to a Promise given
  a Promise/A+ compliant promise constructor.
  [#628](https://github.com/caolan/highland/pull/628).
  Fixes [#627](https://github.com/caolan/highland/issues/627).

2.10.5
------
### Bugfix
* Streams constructed from an `EventEmitter` or `jQuery` element will now remove
  itself when the stream is destroyed.
  Fixes [#500](https://github.com/caolan/highland/issues/500).
  [#609](https://github.com/caolan/highland/pull/609).

2.10.4
------
### Bugfix
* Same as `2.10.3` but with a more conservative fix to minimize the risk of
  regressions.

2.10.3
------
### Bugfix
* In certain cases, consuming a stream that has been resumed may cause a stream
  generator/consume handler to be called twice without next() ever being called.
  This is mostly relevant for .each(...).done(...) use cases.
  Noticed in [#570 (comment)](https://github.com/caolan/highland/issues/570#issuecomment-287980514).
  [#608](https://github.com/caolan/highland/issues/608).

2.10.2
------
### Bugfix
* Uncaught errors from promise-back streams weren't being correctly logged in
  certain circumstances when using a Promise implementation that does not log
  unhandled promise exceptions. All uncaught highland errors should now be
  correctly logged.
  [#591](https://github.com/caolan/highland/pull/591).
  Fixes [#589](https://github.com/caolan/highland/issues/589).
* Users using bluebird as their Promise implementation may have seen an error
  that says "a promise was created in a handler at ... but was not returned from
  it". This is a false positive, and Highland's use of promises have been
  updated to suppress this warning.
  [#588](https://github.com/caolan/highland/issues/588).

2.10.1
------
### Bugfix
* Asynchronously pushing a `nil` in `consume` when then input value wasn't a
  `nil` itself now no longer causes the stream to deadlock.
  [#564](https://github.com/caolan/highland/pull/564).
  Fixes [#563](https://github.com/caolan/highland/issues/563).
  Related to [#558](https://github.com/caolan/highland/issues/558).
* Much improved documentation. Examples are now more standalone, and more
  guidance was added for certain common pitfalls.

2.10.0
------
### New additions
* `of`: Creates a stream that sends a single value then ends. 
  [#520](https://github.com/caolan/highland/pull/520).
* `fromError`: Creates a stream that sends a single error then ends. 
  [#520](https://github.com/caolan/highland/pull/520).  
* When constructing a Highland stream from a Node Readable, the `onFinish`
  handler may now turn off the default automatic end on errors behavior by
  returning an object with the property `continueOnError` set to `true`.
  [#534](https://github.com/caolan/highland/pull/534).
  Fixes [#532](https://github.com/caolan/highland/issues/532).

2.9.0
-----
### New additions
* It is now possible to pass an custom `onFinish` handler when constructing a
  Highland Stream from a Node Readable Stream. This allows for special detection
  of stream completion when necessary.
  [#505](https://github.com/caolan/highland/pull/505).
  See [#490](https://github.com/caolan/highland/issues/490) for a discussion on
  why this is necessary.

2.8.1
-----
### Bugfix
* The `Readable` stream wrapper changes from `2.8.0` assumed that `close` would
  never be emitted before `end` for any stream. This is not the case for
  `Sockets`, which will `close` when the client disconnects but will `end` only
  when it has piped all of its data. For a slow consumer, `end` may happen
  *after* `close`, causing the Highland stream to drop all data after `close` is
  emitted.

  This release fixes the regression at the cost of restoring the old behavior of
  never ending the Stream when only `close` is emitted. This does not affect the
  case where `error` events are emitted without `end`. That still works fine. To
  manually end a stream when it emits `close`, listen to the event and call
  `stream.end()`.
  Fixes [#490](https://github.com/caolan/highland/issues/490).

2.8.0
-----
### Bugfix
* A Highland Stream that wraps `Readable` now properly handles the case where
  the `Readable` emits the `close` event but not the `end` event (this can
  happen with an `fs` read stream when it encounters an error). It will also end
  the wrapper stream when it encounters an error (this happens when reading from
  a non-existent file). Before, such streams would simply never end.
  [#479](https://github.com/caolan/highland/pull/479).
  Fixes [#478](https://github.com/caolan/highland/issues/478).

### New additions
* `toCallback`: method for returning the result of a stream to a
  nodejs-style callback function.
  [#493](https://github.com/caolan/highland/pull/493).
  Fixes [#484](https://github.com/caolan/highland/issues/484).

### Improvements
* A Highland Stream that wraps a bluebird promise can now handle bluebird
  cancellation. When the promise is cancelled the wrapper stream is empty.
  [#487](https://github.com/caolan/highland/pull/487).
  Fixes [#486](https://github.com/caolan/highland/issues/486).


2.7.4
-----
### Bugfix
* `mergeWithLimit` no longer causes an `// Unhandled 'error' event` error when one
  of its sources emits an error.
  [#476](https://github.com/caolan/highland/pull/476).
  Fixes [#475](https://github.com/caolan/highland/issues/475).

2.7.3
-----
### Bugfix
* `pipe` now properly unbinds its `drain` handler from the destination when it
  is done. Previously, there would have been a memory leak if the destination is
  long-lived (e.g., as with `process.stdout`).
  [#466](https://github.com/caolan/highland/pull/466).

2.7.2
-----
### Bugfix
* Minor fixes to the documentation.

### New additions
* The library's browserify bundle is now published to NPM alongside the regular
  code.
  [#310](https://github.com/caolan/highland/pull/310).
  Fixes [#309](https://github.com/caolan/highland/issues/309).

2.7.1
-----
### Bugfix
* `pipe` now emits the `pipe` event to the destination stream.
  [#450](https://github.com/caolan/highland/pull/450).
  Fixes [#449](https://github.com/caolan/highland/issues/449).

### New additions
* `pipe` now takes a second, optional options argument that allows users to
  decide whether or not to end the destination stream when the source ends.
  [#450](https://github.com/caolan/highland/pull/450).

2.7.0
-----
Broken release. Use `2.7.1` instead.

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
