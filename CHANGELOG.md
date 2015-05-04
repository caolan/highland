Changelog
=========

This file does not aim to be comprehensive (you have git history for that),
rather it lists changes that might impact your own code as a consumer of
this library.

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
