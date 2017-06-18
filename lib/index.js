/**
 * Highland: the high-level streams library
 *
 * Highland may be freely distributed under the Apache 2.0 license.
 * http://github.com/caolan/highland
 * Copyright (c) Caolan McMahon
 *
 */


var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var Decoder = require('string_decoder').StringDecoder;

var Queue = require('./queue');
var IntMap = require('./intMap');

// Create quick slice reference variable for speed
var slice = Array.prototype.slice;
var hasOwn = Object.prototype.hasOwnProperty;

// Set up the global object.
var _global = this;
if (typeof global !== 'undefined') {
    _global = global;
}
else if (typeof window !== 'undefined') {
    _global = window;
}

/**
 * The Stream constructor, accepts an array of values or a generator function
 * as an optional argument. This is typically the entry point to the Highland
 * APIs, providing a convenient way of chaining calls together.
 *
 * **Arrays -** Streams created from Arrays will emit each value of the Array
 * and then emit a [nil](#nil) value to signal the end of the Stream.
 *
 * **Generators -** These are functions which provide values for the Stream.
 * They are lazy and can be infinite, they can also be asynchronous (for
 * example, making a HTTP request). You emit values on the Stream by calling
 * `push(err, val)`, much like a standard Node.js callback. Once it has been
 * called, the generator function will not be called again unless you call
 * `next()`. This call to `next()` will signal you've finished processing the
 * current data and allow for the generator function to be called again. If the
 * Stream is still being consumed the generator function will then be called
 * again.
 *
 * You can also redirect a generator Stream by passing a new source Stream
 * to read from to next. For example: `next(other_stream)` - then any subsequent
 * calls will be made to the new source.
 *
 * **Node Readable Stream -** Pass in a Node Readable Stream object to wrap
 * it with the Highland API. Reading from the resulting Highland Stream will
 * begin piping the data from the Node Stream to the Highland Stream.
 *
 * A stream constructed in this way relies on `Readable#pipe` to end the
 * Highland Stream once there is no more data. Not all Readable Streams do
 * this. For example, `IncomingMessage` will only emit `close` when the client
 * aborts communications and will *not* properly call `end`. In this case, you
 * can provide an optional `onFinished` function with the signature
 * `onFinished(readable, callback)` as the second argument.
 *
 * This function will be passed the Readable and a callback that should called
 * when the Readable ends. If the Readable ended from an error, the error
 * should be passed as the first argument to the callback. `onFinished` should
 * bind to whatever listener is necessary to detect the Readable's completion.
 * If the callback is called multiple times, only the first invocation counts.
 * If the callback is called *after* the Readable has already ended (e.g., the
 * `pipe` method already called `end`), it will be ignored.
 *
 * The `onFinished` function may optionally return one of the following:
 *
 * - A cleanup function that will be called when the stream ends. It should
 * unbind any listeners that were added.
 * - An object with the following optional properties:
 *    - `onDestroy` - the cleanup function.
 *    - `continueOnError` - Whether or not to continue the stream when an
 *      error is passed to the callback. Set this to `true` if the Readable
 *      may continue to emit values after errors. Default: `false`.
 *
 * See [this issue](https://github.com/caolan/highland/issues/490) for a
 * discussion on why Highland cannot reliably detect stream completion for
 * all implementations and why the `onFinished` function is required.
 *
 * **EventEmitter / jQuery Elements -** Pass in both an event name and an
 * event emitter as the two arguments to the constructor and the first
 * argument emitted to the event handler will be written to the new Stream.
 *
 * You can pass a mapping hint as the third argument, which specifies how
 * event arguments are pushed into the stream. If no mapping hint is provided,
 * only the first value emitted with the event to the will be pushed onto the
 * Stream.
 *
 * If `mappingHint` is a number, an array of that length will be pushed onto
 * the stream, containing exactly that many parameters from the event. If it's
 * an array, it's used as keys to map the arguments into an object which is
 * pushed to the tream. If it is a function, it's called with the event
 * arguments, and the returned value is pushed.
 *
 * **Promise -** Accepts an ES6 / jQuery style promise and returns a
 * Highland Stream which will emit a single value (or an error). In case you use
 * [bluebird cancellation](http://bluebirdjs.com/docs/api/cancellation.html) Highland Stream will be empty for a cancelled promise.
 *
 * **Iterator -** Accepts an ES6 style iterator that implements the [iterator protocol](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#The_.22iterator.22_protocol):
 * yields all the values from the iterator using its `next()` method and terminates when the
 * iterator's done value returns true. If the iterator's `next()` method throws, the exception will be emitted as an error,
 * and the stream will be ended with no further calls to `next()`.
 *
 * **Iterable -** Accepts an object that implements the [iterable protocol](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#The_.22iterable.22_protocol),
 * i.e., contains a method that returns an object that conforms to the iterator protocol. The stream will use the
 * iterator defined in the `Symbol.iterator` property of the iterable object to generate emitted values.
 *
 * @id _(source)
 * @section Stream Objects
 * @name _(source)
 * @param {Array | Function | Iterator | Iterable | Promise | Readable Stream | String} source - (optional) source to take values from from
 * @param {Function} onFinished - (optional) a function that detects when the readable completes. Second argument. Only valid if `source` is a Readable.
 * @param {EventEmitter | jQuery Element} eventEmitter - (optional) An event emitter. Second argument. Only valid if `source` is a String.
 * @param {Array | Function | Number} mappingHint - (optional) how to pass the
 * arguments to the callback. Only valid if `source` is a String.
 * @api public
 *
 * // from an Array
 * _([1, 2, 3, 4]);
 *
 * // using a generator function
 * _(function (push, next) {
 *     push(null, 1);
 *     push(err);
 *     next();
 * });
 *
 * // a stream with no source, can pipe node streams through it etc.
 * var through = _();
 *
 * // wrapping a Node Readable Stream so you can easily manipulate it
 * _(readable).filter(hasSomething).pipe(writeable);
 *
 * // wrapping a Readable that may signify completion by emitting `close`
 * // (e.g., IncomingMessage).
 * _(req, function (req, callback) {
 *     req.on('end', callback)
 *         .on('close', callback)
 *         .on('error', callback);
 *
 *     return function () {
 *         req.removeListener('end', callback);
 *         req.removeListener('close', callback);
 *         req.removeListener('error', callback);
 *     };
 * }).pipe(writable);
 *
 * // wrapping a Readable that may emit values after errors.
 * _(req, function (req, callback) {
 *     req.on('error', callback);
 *
 *     return {
 *         onDestroy: function () {
 *             req.removeListener('error', callback);
 *         },
 *         continueOnError: true
 *     };
 * }).pipe(writable);
 *
 * // creating a stream from events
 * _('click', btn).each(handleEvent);
 *
 * // creating a stream from events with a mapping array
 * _('request', httpServer, ['req', 'res']).each(handleEvent);
 * //=> { req: IncomingMessage, res: ServerResponse }
 *
 * // creating a stream from events with a mapping function
 * _('request', httpServer, function(req, res) {
 *     return res;
 * }).each(handleEvent);
 * //=> IncomingMessage
 *
 * // from a Promise object
 * var foo = _($.getJSON('/api/foo'));
 *
 * //from an iterator
 * var map = new Map([['a', 1], ['b', 2]]);
 * var bar = _(map.values()).toArray(_.log);
 * //=> [1, 2]
 *
 * //from an iterable
 * var set = new Set([1, 2, 2, 3, 4]);
 * var bar = _(set).toArray(_.log);
 * //=> [ 1, 2, 3, 4]
 */

/*eslint-disable no-multi-spaces */
var _ = exports = module.exports = __(Stream);
function __(StreamCtor) {
    return function (/*optional*/xs, /*optional*/secondArg, /*optional*/ mappingHint) {
        /*eslint-enable no-multi-spaces */
        var s = null;
        if (_.isUndefined(xs)) {
            // nothing else to do
            s = new StreamCtor();
            s.writable = true;
        }
        else if (_.isStream(xs)) {
            if (!(xs instanceof StreamCtor)) { // different subclass or version
                var ret = new StreamCtor();
                xs.on('error', ret.write.bind(ret));
                s = xs.pipe(ret);
            }
            else {
                s = xs;
            }
        }
        else if (_.isArray(xs)) {
            s = new StreamCtor();
            s._outgoing.enqueueAll(xs);
            s._outgoing.enqueue(_.nil);
        }
        else if (_.isFunction(xs)) {
            s = new StreamCtor(xs);
        }
        else if (_.isObject(xs)) {
            // check to see if we have a readable stream
            if (_.isFunction(xs.on) && _.isFunction(xs.pipe)) {
                var onFinish = _.isFunction(secondArg) ? secondArg : defaultReadableOnFinish;
                s = new StreamCtor();
                s.writable = true;
                pipeReadable(xs, onFinish, s);
                // s has to be writable so that the pipe works
                // return a non-writable stream
                return s.map(function (x) { return x; });
            }
            else if (_.isFunction(xs.then)) {
                // probably a promise
                s = promiseStream(StreamCtor, xs);
            }
            // must check iterators and iterables in this order
            // because generators are both iterators and iterables:
            // their Symbol.iterator method returns the `this` object
            // and an infinite loop would result otherwise
            else if (_.isFunction(xs.next)) {
                //probably an iterator
                return iteratorStream(StreamCtor, xs);
            }
            else if (!_.isUndefined(_global.Symbol) && xs[_global.Symbol.iterator]) {
                //probably an iterable
                return iteratorStream(StreamCtor, xs[_global.Symbol.iterator]());
            }
            else {
                throw new Error(
                    'Object was not a stream, promise, iterator or iterable: ' + (typeof xs)
                );
            }
        }
        else if (_.isString(xs)) {
            var mapper = hintMapper(mappingHint);

            s = new StreamCtor();

            var callback_func = function () {
                var ctx = mapper.apply(this, arguments);
                s.write(ctx);
            };

            secondArg.on(xs, callback_func);
            var removeMethod = secondArg.removeListener // EventEmitter
                               || secondArg.unbind;     // jQuery

            if (removeMethod) {
                s._destructors.push(function() {
                    removeMethod.call(secondArg, xs, callback_func);
                });
            }
        }
        else {
            throw new Error(
                'Unexpected argument type to Stream constructor: ' + (typeof xs)
            );
        }

        return s;
    };
}
/*eslint-enable no-use-before-define */

// ES5 detected value, used for switch between ES5 and ES3 code
var isES5 = (function () {
    'use strict';
    return Function.prototype.bind && !this;
}());

function checkIsNumber(parameter, paramName) {
    if (typeof parameter != 'number') {
        throw new TypeError('Parameter "' + paramName + '" is not a number.');
    }
}

function checkRange(predicate, message) {
    if (!predicate) {
        throw new RangeError(message);
    }
}

_.isUndefined = function (x) {
    return typeof x === 'undefined';
};

_.isFunction = function (x) {
    return typeof x === 'function';
};

_.isObject = function (x) {
    return typeof x === 'object' && x !== null;
};

_.isString = function (x) {
    return typeof x === 'string';
};

_.isArray = Array.isArray || function (x) {
    return Object.prototype.toString.call(x) === '[object Array]';
};

// setImmediate browser fallback
if (typeof setImmediate === 'undefined') {
    _.setImmediate = function (fn) {
        setTimeout(fn, 0);
    };
}
else {
    // We don't use a direct alias since some tests depend
    // on allowing Sinon.Js to override the global
    // setImmediate.
    _.setImmediate = function (fn) {
        setImmediate(fn);
    };
}

/**
 * The end of stream marker. This is sent along the data channel of a Stream
 * to tell consumers that the Stream has ended. See the example map code for
 * an example of detecting the end of a Stream.
 *
 * Note: `nil` is setup as a global where possible. This makes it convenient
 * to access, but more importantly lets Streams from different Highland
 * instances work together and detect end-of-stream properly. This is mostly
 * useful for NPM where you may have many different Highland versions installed.
 *
 * @id nil
 * @section Utils
 * @name _.nil
 * @api public
 *
 * var map = function (iter, source) {
 *     return source.consume(function (err, val, push, next) {
 *         if (err) {
 *             push(err);
 *             next();
 *         }
 *         else if (val === _.nil) {
 *             push(null, val);
 *         }
 *         else {
 *             push(null, iter(val));
 *             next();
 *         }
 *     });
 * };
 */

// set up a global nil object in cases where you have multiple Highland
// instances installed (often via npm)
if (!_global.nil) {
    _global.nil = {};
}
var nil = _.nil = _global.nil;

/**
 * Transforms a function with specific arity (all arguments must be
 * defined) in a way that it can be called as a chain of functions until
 * the arguments list is saturated.
 *
 * This function is not itself curryable.
 *
 * @id curry
 * @name _.curry(fn, [*arguments])
 * @section Functions
 * @param {Function} fn - the function to curry
 * @param args.. - any number of arguments to pre-apply to the function
 * @returns Function
 * @api public
 *
 * fn = curry(function (a, b, c) {
 *     return a + b + c;
 * });
 *
 * fn(1)(2)(3) == fn(1, 2, 3)
 * fn(1, 2)(3) == fn(1, 2, 3)
 * fn(1)(2, 3) == fn(1, 2, 3)
 */

_.curry = function (fn /* args... */) {
    var args = slice.call(arguments);
    return _.ncurry.apply(this, [fn.length].concat(args));
};

/**
 * Same as `curry` but with a specific number of arguments. This can be
 * useful when functions do not explicitly define all its parameters.
 *
 * This function is not itself curryable.
 *
 * @id ncurry
 * @name _.ncurry(n, fn, [args...])
 * @section Functions
 * @param {Number} n - the number of arguments to wait for before apply fn
 * @param {Function} fn - the function to curry
 * @param args... - any number of arguments to pre-apply to the function
 * @returns Function
 * @api public
 *
 * fn = ncurry(3, function () {
 *     return Array.prototype.join.call(arguments, '.');
 * });
 *
 * fn(1, 2, 3) == '1.2.3';
 * fn(1, 2)(3) == '1.2.3';
 * fn(1)(2)(3) == '1.2.3';
 */

_.ncurry = function (n, fn /* args... */) {
    var largs = slice.call(arguments, 2);
    if (largs.length >= n) {
        return fn.apply(this, largs.slice(0, n));
    }

    return _.partial.apply(this, [_.ncurry, n, fn].concat(largs));
};

/**
 * Partially applies the function (regardless of whether it has had curry
 * called on it). This will always postpone execution until at least the next
 * call of the partially applied function.
 *
 * @id partial
 * @name _.partial(fn, args...)
 * @section Functions
 * @param {Function} fn - function to partial apply
 * @param args... - the arguments to apply to the function
 * @api public
 *
 * var addAll = function () {
 *     var args = Array.prototype.slice.call(arguments);
 *     return foldl1(add, args);
 * };
 * var f = partial(addAll, 1, 2);
 * f(3, 4) == 10
 */

_.partial = function (f /* args... */) {
    var args = slice.call(arguments, 1);
    return function () {
        return f.apply(this, args.concat(slice.call(arguments)));
    };
};

/**
 * Evaluates the function `fn` with the argument positions swapped. Only
 * works with functions that accept two arguments.
 *
 * @id flip
 * @name _.flip(fn, [x, y])
 * @section Functions
 * @param {Function} fn - function to flip argument application for
 * @param x - parameter to apply to the right hand side of f
 * @param y - parameter to apply to the left hand side of f
 * @api public
 *
 * div(2, 4) == 0.5
 * flip(div, 2, 4) == 2
 * flip(div)(2, 4) == 2
 */

_.flip = _.curry(function (fn, x, y) { return fn(y, x); });

/**
 * Creates a composite function, which is the application of function1 to
 * the results of function2. You can pass an arbitrary number of arguments
 * and have them composed. This means you can't partially apply the compose
 * function itself.
 *
 * @id compose
 * @name _.compose(fn1, fn2, ...)
 * @section Functions
 * @api public
 *
 * var add1 = add(1);
 * var mul3 = mul(3);
 *
 * var add1mul3 = compose(mul3, add1);
 * add1mul3(2) == 9
 */

_.compose = function (/*functions...*/) {
    var fns = slice.call(arguments).reverse();
    return _.seq.apply(null, fns);
};

/**
 * The reversed version of [compose](#compose). Where arguments are in the
 * order of application.
 *
 * @id seq
 * @name _.seq(fn1, fn2, ...)
 * @section Functions
 * @api public
 *
 * var add1 = add(1);
 * var mul3 = mul(3);
 *
 * var add1mul3 = seq(add1, mul3);
 * add1mul3(2) == 9
 */

_.seq = function () {
    var fns = slice.call(arguments);
    return function () {
        if (!fns.length) {
            return null;
        }
        var r = fns[0].apply(this, arguments);
        for (var i = 1; i < fns.length; i++) {
            r = fns[i].call(this, r);
        }
        return r;
    };
};

function nop() {
    // Do nothing.
}

function defaultReadableOnFinish(readable, callback) {
    // It's possible that `close` is emitted *before* `end`, so we simply
    // cannot handle that case. See
    // https://github.com/caolan/highland/issues/490 for details.

    // pipe already pushes on end, so no need to bind to `end`.

    // write any errors into the stream
    readable.once('error', callback);

    return function () {
        readable.removeListener('error', callback);
    };
}

function pipeReadable(xs, onFinish, stream) {
    var response = onFinish(xs, streamEndCb);
    var unbound = false;

    var cleanup = null;
    var endOnError = true;

    if (_.isFunction(response)) {
        cleanup = response;
    }
    else if (response != null) {
        cleanup = response.onDestroy;
        endOnError = !response.continueOnError;
    }

    xs.pipe(stream);

    stream.onDestroy(unbind);

    function streamEndCb(error) {
        if (stream._nil_pushed) {
            return;
        }

        if (error) {
            stream.write(new StreamError(error));
        }

        if (error == null || endOnError) {
            unbind();
            stream.end();
        }
    }

    function unbind() {
        if (unbound) {
            return;
        }

        unbound = true;

        if (cleanup) {
            cleanup();
        }

        if (xs.unpipe) {
            xs.unpipe(stream);
        }
    }
}

function newPullFunction(xs) {
    return function pull(cb) {
        xs.pull(cb);
    };
}

function newDelegateGenerator(pull) {
    return function delegateGenerator(push, next) {
        var self = this;
        pull(function (err, x) {
            // Minor optimization to immediately call the
            // generator if requested.
            var old = self._defer_run_generator;
            self._defer_run_generator = true;

            push(err, x);
            if (x !== nil) {
                next();
            }

            self._defer_run_generator = old;
            if (!old && self._run_generator_deferred) {
                self._runGenerator();
            }
        });
    };
}

function promiseStream(StreamCtor, promise) {
    var nilScheduled = false;
    return new StreamCtor(function (push) {
        // We need to push asynchronously so that errors thrown from handling
        // these values are not caught by the promise. Also, return null so
        // that bluebird-based promises don't complain about handlers being
        // created but not returned. See
        // https://github.com/caolan/highland/issues/588.
        promise = promise.then(function (value) {
            nilScheduled = true;
            _.setImmediate(function () {
                push(null, value);
                push(null, nil);
            });
            return null;
        }, function (err) {
            nilScheduled = true;
            _.setImmediate(function () {
                push(err);
                push(null, nil);
            });
            return null;
        });

        // Using finally also handles bluebird promise cancellation, so we do
        // it if we can.
        if (_.isFunction(promise['finally'])) { // eslint-disable-line dot-notation
            promise['finally'](function () { // eslint-disable-line dot-notation
                if (!nilScheduled) {
                    _.setImmediate(function () {
                        push(null, nil);
                    });
                }
                return null;
            });
        }
    });
}

function iteratorStream(StreamCtor, it) {
    return new StreamCtor(function (push, next) {
        var iterElem, iterErr;
        try {
            iterElem = it.next();
        }
        catch (err) {
            iterErr = err;
        }

        if (iterErr) {
            push(iterErr);
            push(null, _.nil);
        }
        else if (iterElem.done) {
            if (!_.isUndefined(iterElem.value)) {
                // generators can return a final
                // value on completion using return
                // keyword otherwise value will be
                // undefined
                push(null, iterElem.value);
            }
            push(null, _.nil);
        }
        else {
            push(null, iterElem.value);
            next();
        }

    });
}

function hintMapper(mappingHint) {
    var mappingHintType = (typeof mappingHint);
    var mapper;

    if (mappingHintType === 'function') {
        mapper = mappingHint;
    }
    else if (mappingHintType === 'number') {
        mapper = function () {
            return slice.call(arguments, 0, mappingHint);
        };
    }
    else if (_.isArray(mappingHint)) {
        mapper = function () {
            var args = arguments;
            return mappingHint.reduce(function (ctx, hint, idx) {
                ctx[hint] = args[idx];
                return ctx;
            }, {});
        };
    }
    else {
        mapper = function (x) { return x; };
    }

    return mapper;
}

function pipeStream(src, dest, write, end, passAlongErrors) {
    var resume = null;
    var s = src.consume(function (err, x, push, next) {
        var canContinue;
        if (err) {
            if (passAlongErrors) {
                canContinue = write.call(dest, new StreamError(err));
            }
            else {
                src.emit('error', err);
                canContinue = true;
            }
        }
        else if (x === nil) {
            end.call(dest);
            return;
        }
        else {
            canContinue = write.call(dest, x);
        }

        if (canContinue !== false) {
            next();
        }
        else {
            resume = next;
        }
    });

    dest.on('drain', onConsumerDrain);

    // Since we don't keep a reference to piped-to streams,
    // save a callback that will unbind the event handler.
    src.onDestroy(function () {
        dest.removeListener('drain', onConsumerDrain);
    });

    dest.emit('pipe', src);

    s.resume();
    return dest;

    function onConsumerDrain() {
        if (resume) {
            resume();
            resume = null;
        }
    }
}

/**
 * Actual Stream constructor wrapped the the main exported function
 */

function Stream(generator) {
    EventEmitter.call(this);

    // used to detect Highland Streams using isStream(x), this
    // will work even in cases where npm has installed multiple
    // versions, unlike an instanceof check
    this.__HighlandStream__ = true;

    this.id = ('' + Math.random()).substr(2, 6);

    this.paused = true;
    this.ended = false;

    // Old-style node Stream.pipe() checks for writable, and gulp checks for
    // readable. Discussion at https://github.com/caolan/highland/pull/438.
    this.readable = true;
    this.writable = false;

    this._outgoing = new Queue();
    this._observers = [];
    this._destructors = [];
    this._send_events = false;

    this._nil_pushed = false; // Sets to true when a nil has been queued.
    this._explicitly_destroyed = false; // Sets to true when destroy() is called.

    this._request = null;
    this._multiplexer = null;
    this._consumer = null;

    this._generator = generator;
    this._generator_requested = true;
    this._defer_run_generator = false;
    this._run_generator_deferred = false;

    var self = this;

    // These are defined here instead of on the prototype
    // because bind is super slow.
    this._push_fn = function (err, x) {
        if (x === nil) {
            // It's possible that next was called before the
            // nil, causing the generator to be deferred. This
            // is allowed since push can be called at any time.
            // We have to cancel the deferred call to preserve the
            // generator contract.
            self._run_generator_deferred = false;
        }

        // This will set _nil_pushed if necessary.
        self._writeOutgoing(err ? new StreamError(err) : x);
    };

    this._next_fn = function (xs) {
        if (self._explicitly_destroyed) {
            return;
        }

        // It's possible to get into a situation where a call to next() is
        // scheduled asynchonously, but before it is run, destroy() is called,
        // usually by a downstream consumer like take(1). The call to next()
        // still completes, and there is nothing the original caller can do can
        // do. We do not want to throw in that situation.
        if (self._nil_pushed) {
            throw new Error('Cannot call next after nil');
        }

        self._generator_requested = true;
        if (xs) {
            xs = self.create(xs);
            var pull = newPullFunction(xs);
            self._generator = newDelegateGenerator(pull);
        }

        if (!self.paused) {
            if (self._defer_run_generator) {
                self._run_generator_deferred = true;
            }
            else {
                _.setImmediate(function () {
                    self._runGenerator();
                });
            }
        }
    };

    this.on('newListener', function (ev) {
        if (ev === 'data') {
            self._send_events = true;
            _.setImmediate(self.resume.bind(self));
        }
        else if (ev === 'end') {
            // this property avoids us checking the length of the
            // listners subscribed to each event on each _send() call
            self._send_events = true;
        }
    });

    // TODO: write test to cover this removeListener code
    this.on('removeListener', function (ev) {
        if (ev === 'end' || ev === 'data') {
            var end_listeners = self.listeners('end').length;
            var data_listeners = self.listeners('data').length;
            if (end_listeners + data_listeners === 0) {
                // stop emitting events
                self._send_events = false;
            }
        }
    });
}
inherits(Stream, EventEmitter);

function _addMethod(proto, topLevel) {
    return function(name, f) {
        proto[name] = f;
        var n = f.length;
        function relevel(coerce) {
            return _.ncurry(n + 1, function () {
                var args = slice.call(arguments);
                var s = coerce(args.pop());
                return f.apply(s, args);
            });
        }
        topLevel[name] = relevel(topLevel);
        topLevel[name]._relevel = relevel;
    };
}

var addMethod = _addMethod(Stream.prototype, _);

function _addMethods(proto, topLevel, methods) {
    for (var p in methods) {
        if (hasOwn.call(methods, p)) {
            _addMethod(proto, topLevel)(p, methods[p]);
        }
    }
}

function _addToplevelMethod(topLevel) {
    return function (name, fn) {
        function relevel(_topLevel) {
            var bound = fn.bind(_topLevel);
            bound._relevel = relevel;
            return bound;
        }
        topLevel[name] = relevel(topLevel);
    };
}

var addToplevelMethod = _addToplevelMethod(_);

function _addToplevelMethods(topLevel, methods) {
    for (var p in methods) {
        if (hasOwn.call(methods, p)) {
            _addToplevelMethod(topLevel)(p, methods[p]);
        }
    }
}

function use(Super, originalTopLevel) {
    return function(methods, toplevelMethods) {
        function Sub() {
            Stream.apply(this, arguments);
        }
        inherits(Sub, Super);

        function topLevel() {
            return __(Sub).apply(null, arguments);
        }
        for (var p in originalTopLevel) {
            if (hasOwn.call(originalTopLevel, p)) {
                var fn = originalTopLevel[p];
                topLevel[p] = (typeof fn._relevel === 'function') ? fn._relevel(topLevel) : fn;
            }
        }
        _addMethods(Sub.prototype, topLevel, methods || {});
        _addToplevelMethods(topLevel, toplevelMethods || {});
        topLevel.use = use(Sub, topLevel);

        return topLevel;
    };
}

_.use = use(Stream, _);

/**
 * Creates a stream that sends a single value then ends.
 *
 * @id of
 * @section Utils
 * @name _.of(x)
 * @param x - the value to send
 * @returns Stream
 * @api public
 *
 * _.of(1).toArray(_.log); // => [1]
 */

addToplevelMethod('of', function (x) {
    return _([x]);
});

/**
 * Creates a stream that sends a single error then ends.
 *
 * @id fromError
 * @section Utils
 * @name _.fromError(err)
 * @param error - the error to send
 * @returns Stream
 * @api public
 *
 * _.fromError(new Error('Single Error')).toCallback(function (err, result) {
 *     // err contains Error('Single Error') object
 * }
 */

addToplevelMethod('fromError', function (error) {
    return _(function (push) {
        push(error);
        push(null, _.nil);
    });
});

Stream.prototype.create = function () {
    return __(this.constructor).apply(null, arguments);
};

Stream.prototype.createChild = function createChild(/*varargs*/) {
    var child = this.create.apply(this, arguments);
    child.onDestroy(this.destroy.bind(this));
    return child;
};

/**
 * Used as an Error marker when writing to a Stream's incoming buffer
 */

function StreamError(err) {
    this.__HighlandStreamError__ = true;
    this.error = err;
}

/**
 * Returns true if `x` is a Highland Stream.
 *
 * @id isStream
 * @section Utils
 * @name _.isStream(x)
 * @param x - the object to test
 * @returns {Boolean}
 * @api public
 *
 * _.isStream('foo')  // => false
 * _.isStream(_([1,2,3]))  // => true
 */

_.isStream = function (x) {
    return _.isObject(x) && !!x.__HighlandStream__;
};

_._isStreamError = function (x) {
    return _.isObject(x) && !!x.__HighlandStreamError__;
};

_._isStreamRedirect = function (x) {
    return _.isObject(x) && !!x.__HighlandStreamRedirect__;
};

/**
 * Sends errors / data to consumers, observers and event handlers
 */

Stream.prototype._send = function (token) {
    // console.log(this.id, '_send', token, this._send_events);

    var err = null,
        x;

    if (_._isStreamError(token)) {
        err = token.error;
        this.readable = false;
    }
    else {
        x = token;
    }

    if (x === nil) {
        // Per https://nodejs.org/docs/v0.8.28/api/stream.html#stream_stream_readable
        // streams stop being readable when they end or are destroyed
        this.readable = false;
    }

    if (this._request) {
        // Allow pull to be called within the callback function.
        var cb = this._request;
        this._request = null;

        // If we have a request, then it was from a pull() and we need to
        // pause.
        this.pause();
        cb(err, x);
    }

    // this._observers may be changed from under us,
    // so we keep a copy.
    var observers = this._observers;
    for (var j = 0, len2 = observers.length; j < len2; j++) {
        observers[j].write(token);
    }

    if (this._send_events) {
        if (err) {
            this.emit('error', err);
        }
        else if (x === nil) {
            this.emit('end');
        }
        else {
            this.emit('data', x);
        }
    }

    if (x === nil) {
        this._onEnd();
    }
};

Stream.prototype._onEnd = function _onEnd() {
    if (this.ended) {
        return;
    }

    this.pause();

    this.ended = true;

    // Don't use _removeObserver for efficiency reasons.
    var i, len, observer;
    for (i = 0, len = this._observers.length; i < len; i++) {
        observer = this._observers[i];
        if (observer.source === this) {
            observer.source = null;
        }
    }

    for (i = 0, len = this._destructors.length; i < len; i++) {
        this._destructors[i].call(this);
    }

    this._outgoing.clear();
    this._observers = [];
    this._destructors = [];

    this._request = null;
    this._multiplexer = null;
    this._consumer = null;

    this._generator = null;
    this._generator_requested = false;
    this._defer_run_generator = false;
    this._run_generator_deferred = false;
};

/**
 * Pauses the stream. All Highland Streams start in the paused state.
 *
 * It is unlikely that you will need to manually call this method.
 *
 * @id pause
 * @section Stream Objects
 * @name Stream.pause()
 * @api public
 *
 * var xs = _(generator);
 * xs.pause();
 */

addMethod('pause', function () {
    //console.log(['pause', this.id]);
    this.paused = true;
});

/*
 * Emit as many buffered token as possible, but not to exceed num.
 * If num is null, then emit as much as possible.
 */

Stream.prototype._emitNext = function (num) {
    var emitted = 0;

    while ((num == null || emitted < num) &&
            this._outgoing.length &&
            !this.paused) {
        this._send(this._outgoing.dequeue());
        emitted++;
    }
};

/**
 * Resumes a paused Stream. This will either read from the Stream's incoming
 * buffer or request more data from an upstream source. Never call this method
 * on a stream that has been consumed (via a call to [consume](#consume) or any
 * other transform).
 *
 * @id resume
 * @section Stream Objects
 * @name Stream.resume()
 * @api public
 *
 * var xs = _(generator);
 * xs.resume();
 */

addMethod('resume', function () {
    // console.log(this.id, 'resume', this.paused);
    if (!this.paused ||
            (this._consumer && this._consumer.paused) ||
            (this._multiplexer && this._multiplexer.paused)) {
        return;
    }

    this.paused = false;

    // Emit all pending tokens in _outgoing.
    if (this._outgoing.length) {
        this._emitNext();

        // The emit may have caused the stream to pause.
        if (this.paused) {
            return;
        }
    }

    if (this._generator) {
        this._runGenerator();
    }
    else {
        // perhaps a node stream is being piped in
        this.emit('drain');
    }
});

/**
 * Ends a Stream. This is the same as sending a [nil](#nil) value as data.
 * You shouldn't need to call this directly, rather it will be called by
 * any [Node Readable Streams](http://nodejs.org/api/stream.html#stream_class_stream_readable)
 * you pipe in.
 *
 * Only call this function on streams that were constructed with no source
 * (i.e., with `_()`).
 *
 * @id end
 * @section Stream Objects
 * @name Stream.end()
 * @aprototype.ppi public
 *
 * mystream.end();
 */

addMethod('end', function () {
    if (this._nil_pushed) {
        // Allow ending multiple times.
        return;
    }

    this.write(nil);
});

/**
 * Pipes a Highland Stream to a [Node Writable
 * Stream](http://nodejs.org/api/stream.html#stream_class_stream_writable).
 * This will pull all the data from the source Highland Stream and write it to
 * the destination, automatically managing flow so that the destination is not
 * overwhelmed by a fast source.
 *
 * Users may optionally pass an object that may contain any of these fields:
 *
 * - `end` - Ends the destination when this stream ends. Default: `true`. This
 *   option has no effect if the destination is either `process.stdout` or
 *   `process.stderr`. Those two streams are never ended.
 *
 * Like [Readable#pipe](https://nodejs.org/api/stream.html#stream_readable_pipe_destination_options),
 * this function will throw errors if there is no `error` handler installed on
 * the stream.
 *
 * This function returns the destination so you can chain together `pipe` calls.
 *
 * **NOTE**: While Highland streams created via `_()` and [pipeline](#pipeline)
 * support being piped to, it is almost never appropriate to `pipe` from a
 * Highland stream to another Highland stream. Those two cases are meant for
 * use when piping from *Node* streams. You might be tempted to use `pipe` to
 * construct reusable transforms. Do not do it. See [through](#through) for a
 * better way.
 *
 * @id pipe
 * @section Consumption
 * @name Stream.pipe(dest, options)
 * @param {Writable Stream} dest - the destination to write all data to
 * @param {Object} options - (optional) pipe options.
 * @api public
 *
 * var source = _(generator);
 * var dest = fs.createWriteStream('myfile.txt')
 * source.pipe(dest);
 *
 * // chained call
 * source.pipe(through).pipe(dest);
 *
 * // DO NOT do this! It will not work. The stream returned by oddDoubler does
 * // not support being piped to.
 * function oddDoubler() {
 *     return _()
 *         return x % 2; // odd numbers only
 *     })
 *     .map(function (x) {
 *         return x * 2;
 *     });
 * }
 *
 * _([1, 2, 3, 4]).pipe(oddDoubler()) // => Garbage
 */

addMethod('pipe', function (dest, options) {
    options = options || {};

    // stdout and stderr are special case writables that cannot be closed
    var canClose = dest !== process.stdout && dest !== process.stderr && options.end !== false;

    var end;
    if (canClose) {
        end = dest.end;
    }
    else {
        end = nop;
    }

    return pipeStream(this, dest, dest.write, end, false);
});

/**
 * Destroys a stream by unlinking it from any consumers and sources. This will
 * stop all consumers from receiving events from this stream and removes this
 * stream as a consumer of any source stream.
 *
 * This function calls end() on the stream and unlinks it from any piped-to streams.
 *
 * @id destroy
 * @section Stream Objects
 * @name Stream.destroy()
 * @api public
 */

addMethod('destroy', function () {
    this._explicitly_destroyed = true;

    // Already destroyed.
    if (this.ended) {
        return;
    }

    this.readable = this.writable = false;

    if (!this._nil_pushed) {
        this.end();
    }

    this._onEnd();
});

Stream.prototype._writeOutgoing = function _writeOutgoing(token) {
    if (this._explicitly_destroyed) {
        return;
    }

    if (this._nil_pushed) {
        throw new Error('Cannot write to stream after nil');
    }

    if (token === _.nil) {
        this._nil_pushed = true;
    }

    //console.log('_writeOutgoing', token, this.id);
    if (token === nil || _._isStreamError(token)) {
        // Per https://nodejs.org/docs/v0.8.28/api/stream.html#stream_stream_writable
        // writable should turn false after end is called or an error occurs
        this.writable = false;
    }

    if (this.paused) {
        this._outgoing.enqueue(token);
    }
    else {
        this._send(token);
    }
};

/**
 * Runs the generator function for this Stream. If the generator is already
 * running (it has been called and not called next() yet) then this function
 * will do nothing.
 */

Stream.prototype._runGenerator = function () {
    //console.log(this.id, '_runGenerator');
    // if _generator already running, exit
    if (!this._generator_requested) {
        return;
    }

    if (this._defer_run_generator) {
        this._run_generator_deferred = true;
        return;
    }

    this._defer_run_generator = true;
    do {
        this._run_generator_deferred = false;
        this._generator_requested = false;

        // this._generator(this._push_fn, this._next_fn);

        var gen = this._generator;

        // Special handling for consume generators.
        if (gen.__ConsumeGenerator__) {
            var source = gen.source;
            if (source._outgoing.length) {
                var token = source._outgoing.dequeue();

                // Inline the pull -> resume -> _emitNext call chain.
                source._request = gen.pullCb;
                source.paused = false;
                source._send(token);
            }
            else {
                // Inline pull.
                source._request = gen.pullCb;
                source.resume();
            }
        }
        else {
            gen.call(this, this._push_fn, this._next_fn);
        }
    } while (this._run_generator_deferred);
    this._defer_run_generator = false;
};

/**
 * Removes an observer from this Stream.
 */

Stream.prototype._removeObserver = function (s) {
    this._observers = this._observers.filter(function (o) {
        return o !== s;
    });
    if (s.source === this) {
        s.source = null;
    }
};

/**
 * Consumes values from a Stream (once resumed) and returns a new Stream for
 * you to optionally push values onto using the provided push / next functions.
 *
 * This function forms the basis of many higher-level Stream operations.
 * It will not cause a paused stream to immediately resume, but behaves more
 * like a 'through' stream, handling values as they are read.
 *
 * @id consume
 * @section Transforms
 * @name Stream.consume(f)
 * @param {Function} f - the function to handle errors and values
 * @api public
 *
 * var filter = function (f, source) {
 *     return source.consume(function (err, x, push, next) {
 *         if (err) {
 *             // pass errors along the stream and consume next value
 *             push(err);
 *             next();
 *         }
 *         else if (x === _.nil) {
 *             // pass nil (end event) along the stream
 *             push(null, x);
 *         }
 *         else {
 *             // pass on the value only if the value passes the predicate
 *             if (f(x)) {
 *                 push(null, x);
 *             }
 *             next();
 *         }
 *     });
 * };
 */

addMethod('consume', function (f) {
    var source = this,
        consumer;

    if (this._consumer) {
        throw new Error(
            'Stream already being consumed, you must either fork() or observe()'
        );
    }

    if (this._multiplexer) {
        throw new Error(
            'Stream has been forked. You must either fork() or observe().'
        );
    }

    // This should be a subclass, but prototype resolution is slow, and
    // consume is on the critical path, so we inline it.
    var gen = function () {
        // Important. next may not be called outside of
        // pullCb.
        source.pull(pullCb);
    };

    gen.__ConsumeGenerator__ = true;
    gen.pullCb = pullCb;
    gen.source = source;

    consumer = this._consumer = this.createChild(gen);

    consumer.id = 'consume:' + consumer.id;

    return consumer;

    function pullCb(err, x) {
        // Minor optimization to immediately call the
        // generator if requested.
        if (consumer._defer_run_generator) {
            f(err, x, consumer._push_fn, consumer._next_fn);
        }
        else {
            consumer._defer_run_generator = true;
            f(err, x, consumer._push_fn, consumer._next_fn);
            consumer._defer_run_generator = false;

            if (consumer._run_generator_deferred) {
                consumer._runGenerator();
            }
        }
    }
});

/**
 * Consumes a single item from the Stream. Unlike consume, this function will
 * not provide a new stream for you to push values onto, and it will unsubscribe
 * as soon as it has a single error, value or nil from the source.
 *
 * You probably won't need to use this directly, but it is used internally by
 * some functions in the Highland library.
 *
 * @id pull
 * @section Consumption
 * @name Stream.pull(f)
 * @param {Function} f - the function to handle data
 * @api public
 *
 * xs.pull(function (err, x) {
 *     // do something
 * });
 */

addMethod('pull', function (f) {
    // console.log(this.id, 'pull', this._outgoing.toArray(), this.paused);
    if (f == null) {
        throw new Error('Cannot pull() with a null callback.');
    }

    if (this._request) {
        f(new Error('Cannot service a second pull() request while one is in progress.'));
    }

    // Register the callback and send a message.
    // Don't need to pause. _send will do it for us.
    this._request = f;
    this.resume();
});

/**
 * Writes a value to the Stream. If the Stream is paused it will go into the
 * Stream's incoming buffer, otherwise it will be immediately processed and
 * sent to the Stream's consumers (if any). Returns false if the Stream is
 * paused, true otherwise. This lets Node's pipe method handle back-pressure.
 *
 * You shouldn't need to call this yourself, but it may be called by Node
 * functions which treat Highland Streams as a [Node Writable Stream](http://nodejs.org/api/stream.html#stream_class_stream_writable).
 *
 * Only call this function on streams that were constructed with no source
 * (i.e., with `_()`).

 * @id write
 * @section Stream Objects
 * @name Stream.write(x)
 * @param x - the value to write to the Stream
 * @api public
 *
 * var xs = _();
 * xs.write(1);
 * xs.write(2);
 * xs.end();
 *
 * xs.toArray(function (ys) {
 *     // ys will be [1, 2]
 * });
 *
 * // Do *not* do this.
 * var xs2 = _().toArray(_.log);
 * xs2.write(1); // This call is illegal.
 */

addMethod('write', function (x) {
    // console.log(this.id, 'write', x, this.paused);
    this._writeOutgoing(x);
    return !this.paused;
});

/**
 * Forks a stream, allowing you to add additional consumers with shared
 * back-pressure. A stream forked to multiple consumers will only pull values
 * from its source as fast as the slowest consumer can handle them.
 *
 * **NOTE**: Do not depend on a consistent execution order between the forks.
 * This transform only guarantees that all forks will process a value `foo`
 * before any will process a second value `bar`. It does *not* guarantee the
 * order in which the forks process `foo`.
 *
 * **TIP**: Be careful about modifying stream values within the forks (or using
 * a library that does so). Since the same value will be passed to every fork,
 * changes made in one fork will be visible in any fork that executes after it.
 * Add to that the inconsistent execution order, and you can end up with subtle
 * data corruption bugs. If you need to modify any values, you should make a
 * copy and modify the copy instead.
 *
 * @id fork
 * @section Higher-order Streams
 * @name Stream.fork()
 * @api public
 *
 * var xs = _([1, 2, 3, 4]);
 * var ys = xs.fork();
 * var zs = xs.fork();
 *
 * // no values will be pulled from xs until zs also resume
 * ys.resume();
 *
 * // now both ys and zs will get values from xs
 * zs.resume();
 */

addMethod('fork', function () {
    if (this._requests) {
        throw new Error('Cannot fork a stream with an outstanding pull() request.');
    }

    if (this._consumer) {
        throw new Error('Cannot fork a stream that has already been consumed().');
    }

    if (!this._multiplexer) {
        this._multiplexer = new StreamMultiplexer(this);
    }

    var s = this._multiplexer.newStream();
    s.id = 'fork:' + s.id;
    return s;
});

/**
 * Observes a stream, allowing you to handle values as they are emitted, without
 * adding back-pressure or causing data to be pulled from the source. This can
 * be useful when you are performing two related queries on a stream where one
 * would block the other. Just be aware that a slow observer could fill up its
 * buffer and cause memory issues. Where possible, you should use [fork](#fork).
 *
 * @id observe
 * @section Higher-order Streams
 * @name Stream.observe()
 * @api public
 *
 * var xs = _([1, 2, 3, 4]);
 * var ys = xs.fork();
 * var zs = xs.observe();
 *
 * // now both zs and ys will receive data as fast as ys can handle it
 * ys.resume();
 */

addMethod('observe', function () {
    var s = this.create();
    s.id = 'observe:' + s.id;
    s.writable = false;

    s.onDestroy(this._removeObserver.bind(this, s));

    // s.source = this;
    this._observers.push(s);
    return s;
});

/**
 * Extracts errors from a Stream and applies them to an error handler
 * function. Returns a new Stream with the errors removed (unless the error
 * handler chooses to rethrow them using `push`). Errors can also be
 * transformed and put back onto the Stream as values.
 *
 * @id errors
 * @section Transforms
 * @name Stream.errors(f)
 * @param {Function} f - the function to pass all errors to
 * @api public
 *
 * getDocument.errors(function (err, push) {
 *     if (err.statusCode === 404) {
 *         // not found, return empty doc
 *         push(null, {});
 *     }
 *     else {
 *         // otherwise, re-throw the error
 *         push(err);
 *     }
 * });
 */

addMethod('errors', function (f) {
    return this.consume(function (err, x, push, next) {
        if (err) {
            f(err, push);
            next();
        }
        else if (x === nil) {
            push(null, nil);
        }
        else {
            push(null, x);
            next();
        }
    });
});

/**
 * Like the [errors](#errors) method, but emits a Stream end marker after
 * an Error is encountered.
 *
 * @id stopOnError
 * @section Transforms
 * @name Stream.stopOnError(f)
 * @param {Function} f - the function to handle an error
 * @api public
 *
 * brokenStream.stopOnError(function (err) {
 *     //console.error('Something broke: ' + err);
 * });
 */

addMethod('stopOnError', function (f) {
    return this.consume(function (err, x, push, next) {
        if (err) {
            f(err, push);
            push(null, nil);
        }
        else if (x === nil) {
            push(null, nil);
        }
        else {
            push(null, x);
            next();
        }
    });
});

/**
 * Iterates over every value from the Stream, calling the iterator function
 * on each of them. This method consumes the Stream.
 *
 * If an error from the Stream reaches this call, it will emit an `error` event
 * (i.e., it will call `emit('error')` on the stream being consumed).  This
 * event will cause an error to be thrown if unhandled.
 *
 * While `each` consumes the stream, it is possible to chain [done](#done) (and
 * *only* `done`) after it.
 *
 * @id each
 * @section Consumption
 * @name Stream.each(f)
 * @param {Function} f - the iterator function
 * @api public
 *
 * _([1, 2, 3, 4]).each(function (x) {
 *     // will be called 4 times with x being 1, 2, 3 and 4
 * });
 */

addMethod('each', function (f) {
    var self = this;
    var s = this.consume(function (err, x, push, next) {
        if (err) {
            self.emit('error', err);
        }
        else if (x === nil) {
            push(null, nil);
        }
        else {
            f(x);
            next();
        }
    });
    s.resume();
    return s;
});

/**
 * Applies all values from a Stream as arguments to a function. This method consumes the stream.
 * `f` will always be called when the `nil` token is encountered, even when the stream is empty.
 *
 * @id apply
 * @section Consumption
 * @name Stream.apply(f)
 * @param {Function} f - the function to apply arguments to
 * @api public
 *
 * _([1, 2, 3]).apply(function (a, b, c) {
 *     // a === 1
 *     // b === 2
 *     // c === 3
 * });
 *
 * _([1, 2, 3]).apply(function (a) {
 *     // arguments.length === 3
 *     // a === 1
 * });
 */

addMethod('apply', function (f) {
    return this.toArray(function (args) {
        f.apply(null, args);
    });
});

/**
 * Collects all values from a Stream into an Array and calls a function with
 * the result. This method consumes the stream.
 *
 * If an error from the Stream reaches this call, it will emit an `error` event
 * (i.e., it will call `emit('error')` on the stream being consumed).  This
 * event will cause an error to be thrown if unhandled.
 *
 * @id toArray
 * @section Consumption
 * @name Stream.toArray(f)
 * @param {Function} f - the callback to provide the completed Array to
 * @api public
 *
 * _([1, 2, 3, 4]).toArray(function (x) {
 *     // parameter x will be [1,2,3,4]
 * });
 */

addMethod('toArray', function (f) {
    var self = this;
    return this.collect().pull(function (err, x) {
        if (err) {
            self.emit('error', err);
        }
        else {
            f(x);
        }
    });
});

/**
 * Calls a function once the Stream has ended. This method consumes the stream.
 * If the Stream has already ended, the function is called immediately.
 *
 * If an error from the Stream reaches this call, it will emit an `error` event
 * (i.e., it will call `emit('error')` on the stream being consumed).  This
 * event will cause an error to be thrown if unhandled.
 *
 * As a special case, it is possible to chain `done` after a call to
 * [each](#each) even though both methods consume the stream.
 *
 * @id done
 * @section Consumption
 * @name Stream.done(f)
 * @param {Function} f - the callback
 * @api public
 *
 * var total = 0;
 * _([1, 2, 3, 4]).each(function (x) {
 *     total += x;
 * }).done(function () {
 *     // total will be 10
 * });
 */

addMethod('done', function (f) {
    if (this.ended) {
        f();
        return null;
    }
    var self = this;
    return this.consume(function (err, x, push, next) {
        if (err) {
            self.emit('error', err);
        }
        else if (x === nil) {
            f();
        }
        else {
            next();
        }
    }).resume();
});

/**
 * Registers a callback that will be called when the stream is destroyed. The
 * callback will have its `this` variable bound to the stream being destroyed.
 *
 * This method can be used to free any resources that were allocated when
 * creating the stream.
 *
 * @id onDestroy
 * @section Consumption
 * @name Stream.onDestroy(f)
 * @param {Function} f - the callback
 * @api public
 *
 * var _([1]).onDestroy(function () {
 *     console.log('freed');
 * }).each(console.log);
 * // => 1
 * // => freed
 */

Stream.prototype.onDestroy = function onDestroy(f) {
    this._destructors.push(f);
    return this;
};

/**
 *
 * @id toCallbackHandler
 * @param {string} transformName Description to compose user-friendly error messages
 * @param {function} cb Node.js style callback
 * @return {function} Function passed to .consume
 * @private
 */
function toCallbackHandler(transformName, cb) {
    var value;
    var hasValue = false; // In case an emitted value === null or === undefined.
    return function (err, x, push, next) {
        if (err) {
            push(null, nil);
            if (hasValue) {
                cb(new Error(transformName + ' called on stream emitting multiple values'));
            }
            else {
                cb(err);
            }
        }
        else if (x === nil) {
            if (hasValue) {
                cb(null, value);
            }
            else {
                cb();
            }
        }
        else {
            if (hasValue) {
                push(null, nil);
                cb(new Error(transformName + ' called on stream emitting multiple values'));
            }
            else {
                value = x;
                hasValue = true;
                next();
            }
        }
    };
}


/**
 * Returns the result of a stream to a nodejs-style callback function.
 *
 * If the stream contains a single value, it will call `cb`
 * with the single item emitted by the stream (if present).
 * If the stream is empty, `cb` will be called without any arguments.
 * If an error is encountered in the stream, this function will stop
 * consumption and call `cb` with the error.
 * If the stream contains more than one item, it will stop consumption
 * and call `cb` with an error.
 *
 * @id toCallback
 * @section Consumption
 * @name Stream.toCallback(cb)
 * @param {Function} cb - the callback to provide the error/result to
 * @api public
 *
 * _([1, 2, 3, 4]).collect().toCallback(function (err, result) {
 *     // parameter result will be [1,2,3,4]
 *     // parameter err will be null
 * });
 */

addMethod('toCallback', function (cb) {
    this.consume(toCallbackHandler('toCallback', cb)).resume();
});


/**
 * Converts the result of a stream to Promise.
 *
 * If the stream contains a single value, it will return
 * with the single item emitted by the stream (if present).
 * If the stream is empty, `undefined` will be returned.
 * If an error is encountered in the stream, this function will stop
 * consumption and call `cb` with the error.
 * If the stream contains more than one item, it will stop consumption
 * and reject with an error.
 *
 * @id toPromise
 * @section Consumption
 * @name Stream.toPromise(PromiseCtor)
 * @param {Function} PromiseCtor - Promises/A+ compliant constructor
 * @api public
 *
 * _([1, 2, 3, 4]).collect().toPromise(Promise).then(function (result) {
 *     // parameter result will be [1,2,3,4]
 * });
 */

addMethod('toPromise', function (PromiseCtor) {
    var self = this;
    return new PromiseCtor(function(resolve, reject) {
        self.consume(toCallbackHandler('toPromise', function(err, res) {
            if (err) {
                reject(err);
            }
            else {
                resolve(res);
            }
        })).resume();
    });
});


/**
 * Creates a new Stream of transformed values by applying a function to each
 * value from the source.
 *
 * @id map
 * @section Transforms
 * @name Stream.map(f)
 * @param {Function} f - the transformation function
 * @api public
 *
 * var doubled = _([1, 2, 3, 4]).map(function (x) {
 *     return x * 2;
 * }); // => 2, 4, 6, 8
 */

addMethod('map', function (f) {
    if (!_.isFunction(f)) {
        throw new Error('map expects a function as its only argument.');
    }
    return this.consume(function (err, x, push, next) {
        if (err) {
            push(err);
            next();
        }
        else if (x === nil) {
            push(err, x);
        }
        else {
            var fnVal, fnErr;
            try {
                fnVal = f(x);
            }
            catch (e) {
                fnErr = e;
            }
            push(fnErr, fnVal);
            next();
        }
    });
});

/**
 * Creates a new Stream which applies a function to each value from the source
 * and re-emits the source value. Useful when you want to mutate the value or
 * perform side effects
 *
 * @id doto
 * @section Transforms
 * @name Stream.doto(f)
 * @param {Function} f - the function to apply
 * @api public
 *
 * var appended = _([[1], [2], [3], [4]]).doto(function (x) {
 *     x.push(1);
 * });
 *
 * _([1, 2, 3]).doto(console.log)
 * // 1
 * // 2
 * // 3
 * // => 1, 2, 3
 */

addMethod('doto', function (f) {
    return this.map(function (x) {
        f(x);
        return x;
    });
});

/**
 * An alias for the [doto](#doto) method.
 *
 * @id tap
 * @section Transforms
 * @name Stream.tap(f)
 * @param {Function} f - the function to apply
 * @api public
 *
 * _([1, 2, 3]).tap(console.log)
 */

Stream.prototype.tap = Stream.prototype.doto;
_.tap = _.doto;

/**
 * Limits number of values through the stream to a maximum of number of values
 * per window. Errors are not limited but allowed to pass through as soon as
 * they are read from the source.
 *
 * @id ratelimit
 * @section Transforms
 * @name Stream.ratelimit(num, ms)
 * @param {Number} num - the number of operations to perform per window
 * @param {Number} ms - the window of time to limit the operations in (in ms)
 * @api public
 *
 * _([1, 2, 3, 4, 5]).ratelimit(2, 100);
 *
 * // after 0ms => 1, 2
 * // after 100ms => 1, 2, 3, 4
 * // after 200ms => 1, 2, 3, 4, 5
 */

addMethod('ratelimit', function (num, ms) {
    if (num < 1) {
        throw new Error('Invalid number of operations per ms: ' + num);
    }
    var sent = 0;
    return this.consume(function (err, x, push, next) {
        if (err) {
            push(err);
            next();
        }
        else if (x === nil) {
            push(null, nil);
        }
        else {
            if (sent < num) {
                sent++;
                push(null, x);
                next();
            }
            else {
                setTimeout(function () {
                    sent = 1;
                    push(null, x);
                    next();
                }, ms);
            }
        }
    });
});

/**
 * Creates a new Stream of values by applying each item in a Stream to an
 * iterator function which must return a (possibly empty) Stream. Each item on
 * these result Streams are then emitted on a single output Stream.
 *
 * This transform is functionally equivalent to `.map(f).sequence()`.
 *
 * @id flatMap
 * @section Higher-order Streams
 * @name Stream.flatMap(f)
 * @param {Function} f - the iterator function
 * @api public
 *
 * var readFile = _.wrapCallback(fs.readFile);
 * filenames.flatMap(readFile)
 */

addMethod('flatMap', function (f) {
    return this.map(f).sequence();
});

/**
 * Retrieves values associated with a given property from all elements in
 * the collection.
 *
 * @id pluck
 * @section Transforms
 * @name Stream.pluck(property)
 * @param {String} prop - the property to which values should be associated
 * @api public
 *
 * var docs = [
 *     {type: 'blogpost', title: 'foo'},
 *     {type: 'blogpost', title: 'bar'},
 *     {type: 'comment', title: 'baz'}
 * ];
 *
 * _(docs).pluck('title').toArray(function (xs) {
 *    // xs is now ['foo', 'bar', 'baz']
 * });
 */

addMethod('pluck', function (prop) {
    return this.consume(function (err, x, push, next) {
        if (err) {
            push(err);
            next();
        }
        else if (x === nil) {
            push(err, x);
        }
        else if (_.isObject(x)) {
            push(null, x[prop]);
            next();
        }
        else {
            push(new Error(
                'Expected Object, got ' + (typeof x)
            ));
            next();
        }
    });
});

/**
 * Only applies the transformation strategy on Objects.
 * This helper is used in `pick` and `pickBy`
 **/

var objectOnly = _.curry(function(strategy, x) {
    if (_.isObject(x)) {
        return strategy(x);
    }
    else {
        throw new Error(
            'Expected Object, got ' + (typeof x)
        );
    }
});


/**
 *
 * Retrieves copies of all the elements in the collection
 * that satisfy a given predicate. Note: When using ES3,
 * only enumerable elements are selected. Both enumerable
 * and non-enumerable elements are selected when using ES5.
 *
 * @id pickBy
 * @section Transforms
 * @name Stream.pickBy(f)
 * @param {Function} f - the predicate function
 * @api public
 *
 *  var dogs = [
 *      {breed: 'chihuahua', name: 'Princess', age: 5},
 *      {breed: 'labrador', name: 'Rocky', age: 3},
 *      {breed: 'german-shepherd', name: 'Waffles', age: 9}
 *  ];

 *  _(dogs).pickBy(function (value, key) {
 *      return value > 4;
 *  }).toArray(function (xs) {
 *    // xs is now:
 *    [
 *      { age: 5 },
 *      {},
 *      { age: 9 }
 *    ]
 *  });
 */

addMethod('pickBy', function (f) {
    return this.map(objectOnly(function (x) {
        var out = {};

        // prevents testing overridden properties multiple times.
        var seen = isES5 ? Object.create(null) : {};
        var obj = x;  // variable used to traverse prototype chain
        function testAndAdd (prop) {
            if (seen[prop] !== true && f(x[prop], prop)) {
                out[prop] = x[prop];
                seen[prop] = true;
            }
        }
        if (isES5) {
            do {
                Object.getOwnPropertyNames(obj).forEach(testAndAdd);
                obj = Object.getPrototypeOf(obj);
            } while (obj);
        }
        else {
            for (var k in x) {
                testAndAdd(k);
            }
        }
        return out;
    }));
});

/**
 *
 * Retrieves copies of all elements in the collection,
 * with only the whitelisted keys. If one of the whitelisted
 * keys does not exist, it will be ignored.
 *
 * @id pick
 * @section Transforms
 * @name Stream.pick(properties)
 * @param {Array} properties - property names to white filter
 * @api public
 *
 * var dogs = [
 *      {breed: 'chihuahua', name: 'Princess', age: 5},
 *      {breed: 'labrador', name: 'Rocky', age: 3},
 *      {breed: 'german-shepherd', name: 'Waffles', age: 9}
 * ];
 *
 * _(dogs).pick(['breed', 'age']).toArray(function (xs) {
 *       // xs is now:
 *       [
 *           {breed: 'chihuahua', age: 5},
 *           {breed: 'labrador', age: 3},
 *           {breed: 'german-shepherd', age: 9}
 *       ]
 * });
 *
 * _(dogs).pick(['owner']).toArray(function (xs) {
 *      // xs is now:
 *      [
 *          {},
 *          {},
 *          {}
 *      ]
 * });*/

addMethod('pick', function (properties) {
    return this.map(objectOnly(function(x) {
        var out = {};
        for (var i = 0, length = properties.length; i < length; i++) {
            var p = properties[i];
            if (p in x) {
                out[p] = x[p];
            }
        }
        return out;
    }));
});

/**
 * Creates a new Stream that includes only the values that pass a truth test.
 *
 * @id filter
 * @section Transforms
 * @name Stream.filter(f)
 * @param {Function} f - the truth test function
 * @api public
 *
 * var evens = _([1, 2, 3, 4]).filter(function (x) {
 *     return x % 2 === 0;
 * });
 */

addMethod('filter', function (f) {
    return this.consume(function (err, x, push, next) {
        if (err) {
            push(err);
            next();
        }
        else if (x === nil) {
            push(err, x);
        }
        else {
            var fnVal, fnErr;
            try {
                fnVal = f(x);
            }
            catch (e) {
                fnErr = e;
            }

            if (fnErr) {
                push(fnErr);
            }
            else if (fnVal) {
                push(null, x);
            }
            next();
        }
    });
});

/**
 * Filters using a predicate which returns a Stream. If you need to check
 * against an asynchronous data source when filtering a Stream, this can
 * be convenient. The Stream returned from the filter function should have
 * a Boolean as its first value (all other values on the Stream will be
 * disregarded).
 *
 * @id flatFilter
 * @section Higher-order Streams
 * @name Stream.flatFilter(f)
 * @param {Function} f - the truth test function which returns a Stream
 * @api public
 *
 * var checkExists = _.wrapCallback(fs.access);
 *
 * filenames.flatFilter(checkExists)
 */

addMethod('flatFilter', function (f) {
    return this.flatMap(function (x) {
        return f(x).take(1).otherwise(errorStream())
        .flatMap(function (bool) {
            return _(bool ? [x] : []);
        });
    });

    function errorStream() {
        return _(function (push) {
            push(new Error('Stream returned by function was empty.'));
            push(null, _.nil);
        });
    }
});

/**
 * The inverse of [filter](#filter).
 *
 * @id reject
 * @section Transforms
 * @name Stream.reject(f)
 * @param {Function} f - the truth test function
 * @api public
 *
 * var odds = _([1, 2, 3, 4]).reject(function (x) {
 *     return x % 2 === 0;
 * });
 */

addMethod('reject', function (f) {
    return this.filter(_.compose(_.not, f));
});

/**
 * A convenient form of [filter](#filter), which returns the first object from a
 * Stream that passes the provided truth test.
 *
 * @id find
 * @section Transforms
 * @name Stream.find(f)
 * @param {Function} f - the truth test function which returns a Stream
 * @api public
 *
 * var docs = [
 *     {type: 'blogpost', title: 'foo'},
 *     {type: 'blogpost', title: 'bar'},
 *     {type: 'comment', title: 'foo'}
 * ];
 *
 * var f = function (x) {
 *     return x.type == 'blogpost';
 * };
 *
 * _(docs).find(f);
 * // => {type: 'blogpost', title: 'foo'}
 *
 * // example with partial application
 * var firstBlogpost = _.find(f);
 *
 * firstBlogpost(docs)
 * // => {type: 'blogpost', title: 'foo'}
 */

addMethod('find', function (f) {
    return this.filter(f).take(1);
});

/**
 * A convenient form of [where](#where), which returns the first object from a
 * Stream that matches a set of property values. findWhere is to [where](#where) as [find](#find) is to [filter](#filter).
 *
 * @id findWhere
 * @section Transforms
 * @name Stream.findWhere(props)
 * @param {Object} props - the properties to match against
 * @api public
 *
 * var docs = [
 *     {type: 'blogpost', title: 'foo'},
 *     {type: 'blogpost', title: 'bar'},
 *     {type: 'comment', title: 'foo'}
 * ];
 *
 * _(docs).findWhere({type: 'blogpost'})
 * // => {type: 'blogpost', title: 'foo'}
 *
 * // example with partial application
 * var firstBlogpost = _.findWhere({type: 'blogpost'});
 *
 * firstBlogpost(docs)
 * // => {type: 'blogpost', title: 'foo'}
 */

addMethod('findWhere', function (props) {
    return this.where(props).take(1);
});


/**
 * A convenient form of [reduce](#reduce), which groups items based on a function or property name
 *
 * @id group
 * @section Transforms
 * @name Stream.group(f)
 * @param {Function | String} f - the function or property name on which to group,
 *                              toString() is called on the result of a function.
 * @api public
 *
 * var docs = [
 *     {type: 'blogpost', title: 'foo'},
 *     {type: 'blogpost', title: 'bar'},
 *     {type: 'comment', title: 'foo'}
 * ];
 *
 * var f = function (x) {
 *     return x.type;
 * };
 *
 * _(docs).group(f); OR _(docs).group('type');
 * // => {
 * // =>    'blogpost': [{type: 'blogpost', title: 'foo'}, {type: 'blogpost', title: 'bar'}]
 * // =>    'comment': [{type: 'comment', title: 'foo'}]
 * // =>  }
 *
 */

addMethod('group', function (f) {
    var lambda = _.isString(f) ? _.get(f) : f;
    return this.reduce(function (m, o) {
        var key = lambda(o);
        if (!hasOwn.call(m, key)) { m[key] = []; }
        m[key].push(o);
        return m;
    }, {});
});

/**
 * Filters a Stream to drop all non-truthy values.
 *
 * @id compact
 * @section Transforms
 * @name Stream.compact()
 * @api public
 *
 * var compacted = _([0, 1, false, 3, null, undefined, 6]).compact();
 * // => 1, 3, 6
 */

addMethod('compact', function () {
    return this.filter(function (x) {
        return x;
    });
});

/**
 * A convenient form of [filter](#filter), which returns all objects from a Stream
 * which match a set of property values.
 *
 * @id where
 * @section Transforms
 * @name Stream.where(props)
 * @param {Object} props - the properties to match against
 * @api public
 *
 * var docs = [
 *     {type: 'blogpost', title: 'foo'},
 *     {type: 'blogpost', title: 'bar'},
 *     {type: 'comment', title: 'foo'}
 * ];
 *
 * _(docs).where({title: 'foo'})
 * // => {type: 'blogpost', title: 'foo'}
 * // => {type: 'comment', title: 'foo'}
 *
 * // example with partial application
 * var getBlogposts = _.where({type: 'blogpost'});
 *
 * getBlogposts(docs)
 * // => {type: 'blogpost', title: 'foo'}
 * // => {type: 'blogpost', title: 'bar'}
 */

addMethod('where', function (props) {
    return this.filter(function (x) {
        for (var k in props) {
            if (x[k] !== props[k]) {
                return false;
            }
        }
        return true;
    });
});

/**
 * Filters out all duplicate values from the stream and keeps only the first
 * occurence of each value, using the provided function to define equality.
 *
 * Note:
 *
 * - Memory: In order to guarantee that each unique item is chosen only once,
 *   we need to keep an internal buffer of all unique values. This may outgrow
 *   the available memory if you are not cautious about the size of your stream
 *   and the number of unique objects you may receive on it.
 * - Errors: The comparison function should never throw an error. However, if
 *   it does, this transform will emit an error for each all that throws. This
 *   means that one value may turn into multiple errors.
 *
 * @id uniqBy
 * @section Transforms
 * @name Stream.uniqBy(compare)
 * @param {Function} compare - custom equality predicate
 * @api public
 *
 * var colors = [ 'blue', 'red', 'red', 'yellow', 'blue', 'red' ]
 *
 * _(colors).uniqBy(function(a, b) { return a[1] === b[1]; })
 * // => 'blue'
 * // => 'red'
 *
 */

addMethod('uniqBy', function (compare) {
    var uniques = [];
    return this.consume(function (err, x, push, next) {
        if (err) {
            push(err);
            next();
        }
        else if (x === nil) {
            push(err, x);
        }
        else {
            var seen = false;
            var hasErr;
            for (var i = 0, len = uniques.length; i < len; i++) {
                try {
                    seen = compare(x, uniques[i]);
                }
                catch (e) {
                    hasErr = e;
                    seen = true;
                }
                if (seen) {
                    break;
                }
            }
            if (!seen) {
                uniques.push(x);
                push(null, x);
            }
            if (hasErr) {
                push(hasErr);
            }
            next();
        }
    });
});

/**
 * Filters out all duplicate values from the stream and keeps only the first
 * occurence of each value, using `===` to define equality.
 *
 * Like [uniqBy](#uniqBy), this transform needs to store a buffer containing
 * all unique values that has been encountered. Be careful about using this
 * transform on a stream that has many unique values.
 *
 * @id uniq
 * @section Transforms
 * @name Stream.uniq()
 * @api public
 *
 * var colors = [ 'blue', 'red', 'red', 'yellow', 'blue', 'red' ]
 *
 * _(colors).uniq()
 * // => 'blue'
 * // => 'red'
 * // => 'yellow'
 */

addMethod('uniq', function () {
    if (!_.isUndefined(_global.Set)) {
        var uniques = new _global.Set(),
            size = uniques.size;

        return this.consume(function (err, x, push, next) {
            if (err) {
                push(err);
                next();
            }
            else if (x === nil) {
                push(err, x);
            }
            // pass NaN through as Set does not respect strict
            // equality in this case.
            else if (x !== x) {
                push(null, x);
                next();
            }
            else {
                uniques.add(x);
                if (uniques.size > size) {
                    size = uniques.size;
                    push(null, x);
                }
                next();
            }
        });
    }
    return this.uniqBy(function (a, b) {
        return a === b;
    });
});

/**
 * Takes a *finite* stream of streams and returns a stream where the first
 * element from each separate stream is combined into a single data event,
 * followed by the second elements of each stream and so on until the shortest
 * input stream is exhausted.
 *
 * @id zipAll
 * @section Higher-order Streams
 * @name Stream.zipAll()
 * @api public
 *
 * _([
 *     _([1, 2, 3]),
 *     _([4, 5, 6]),
 *     _([7, 8, 9]),
 *     _([10, 11, 12])
 * ]).zipAll()
 * // => [1, 4, 7, 10], [2, 5, 8, 11], [3, 6, 9, 12]
 *
 * // shortest stream determines length of output stream
 * _([
 *     _([1, 2, 3, 4]),
 *     _([5, 6, 7, 8]),
 *     _([9, 10, 11, 12]),
 *     _([13, 14])
 * ]).zipAll()
 * // => [1, 5, 9, 13], [2, 6, 10, 14]
 */

addMethod('zipAll', function () {
    var returned = 0;
    var z = [];
    var finished = false;

    function nextValue(index, max, src, push, next) {
        src.pull(function (err, x) {
            if (err) {
                push(err);
                nextValue(index, max, src, push, next);
            }
            else if (x === _.nil) {
                if (!finished) {
                    finished = true;
                    push(null, nil);
                }
            }
            else {
                returned++;
                z[index] = x;
                if (returned === max) {
                    push(null, z);
                    next();
                }
            }
        });
    }

    var self = this;
    return self.collect().flatMap(function (array) {
        if (!array.length) {
            return self.create([]);
        }
        return self.create(function (push, next) {
            returned = 0;
            z = [];
            for (var i = 0, length = array.length; i < length; i++) {
                nextValue(i, length, array[i], push, next);
            }
        });
    });

});

/**
 * Takes a stream and a *finite* stream of `N` streams
 * and returns a stream of the corresponding `(N+1)`-tuples.
 *
 * @id zipEach
 * @section Higher-order Streams
 * @name Stream.zipEach(ys)
 * @param {Array | Stream} ys - the array of streams to combine values with
 * @api public
 *
 * _([1,2,3]).zipEach([[4, 5, 6], [7, 8, 9], [10, 11, 12]])
 * // => [1, 4, 7, 10], [2, 5, 8, 11], [3, 6, 9, 12]
 *
 * // shortest stream determines length of output stream
 * _([1, 2, 3, 4]).zipEach([[5, 6, 7, 8], [9, 10, 11, 12], [13, 14]])
 * // => [1, 5, 9, 13], [2, 6, 10, 14]
 */

addMethod('zipEach', function (ys) {
    return this.create([this]).concat(this.create(ys).map(this.create.bind(this))).zipAll();
});

/**
 * Takes two Streams and returns a Stream of corresponding pairs. The size of
 * the resulting stream is the smaller of the two source streams.
 *
 * @id zip
 * @section Higher-order Streams
 * @name Stream.zip(ys)
 * @param {Array | Stream} ys - the other stream to combine values with
 * @api public
 *
 * _(['a', 'b', 'c']).zip([1, 2, 3])  // => ['a', 1], ['b', 2], ['c', 3]
 *
 * _(['a', 'b', 'c']).zip(_([1]))  // => ['a', 1]
 */

addMethod('zip', function (ys) {
    return this.create([this, this.create(ys)]).zipAll();
});

/**
 * Takes one Stream and batches incoming data into arrays of given length
 *
 * @id batch
 * @section Transforms
 * @name Stream.batch(n)
 * @param {Number} n - length of the array to batch
 * @api public
 *
 * _([1, 2, 3, 4, 5]).batch(2)  // => [1, 2], [3, 4], [5]
 */

addMethod('batch', function (n) {
    return this.batchWithTimeOrCount(-1, n);
});

/**
 * Takes one Stream and batches incoming data within a maximum time frame
 * into arrays of a maximum length.
 *
 * @id batchWithTimeOrCount
 * @section Transforms
 * @name Stream.batchWithTimeOrCount(ms, n)
 * @param {Number} ms - the maximum milliseconds to buffer a batch
 * @param {Number} n - the maximum length of the array to batch
 * @api public
 *
 * _(function (push) {
 *     push(1);
 *     push(2);
 *     push(3);
 *     setTimeout(push, 20, 4);
 * }).batchWithTimeOrCount(10, 2)
 *
 * // => [1, 2], [3], [4]
 */

addMethod('batchWithTimeOrCount', function (ms, n) {
    var batched = [],
        timeout;

    return this.consume(function (err, x, push, next) {
        if (err) {
            push(err);
            next();
        }
        else if (x === nil) {
            if (batched.length > 0) {
                push(null, batched);
                clearTimeout(timeout);
            }

            push(null, nil);
        }
        else {
            batched.push(x);

            if (batched.length === n) {
                push(null, batched);
                batched = [];
                clearTimeout(timeout);
            }
            else if (batched.length === 1 && ms >= 0) {
                timeout = setTimeout(function () {
                    push(null, batched);
                    batched = [];
                }, ms);
            }

            next();
        }
    });
});

/**
 * Creates a new Stream with the separator interspersed between the elements of the source.
 *
 * `intersperse` is effectively the inverse of [splitBy](#splitBy).
 *
 * @id intersperse
 * @section Transforms
 * @name Stream.intersperse(sep)
 * @param {String} sep - the value to intersperse between the source elements
 * @api public
 *
 * _(['ba', 'a', 'a']).intersperse('n')  // => 'ba', 'n', 'a', 'n', 'a'
 * _(['mississippi']).splitBy('ss').intersperse('ss')  // => 'mi', 'ss', 'i', 'ss', 'ippi'
 * _(['foo']).intersperse('bar')  // => 'foo'
 */

addMethod('intersperse', function (separator) {
    var started = false;
    return this.consume(function (err, x, push, next) {
        if (err) {
            push(err);
            next();
        }
        else if (x === nil) {
            push(null, nil);
        }
        else {
            if (started) {
                push(null, separator);
            }
            else {
                started = true;
            }
            push(null, x);
            next();
        }
    });
});

/**
 * Splits the source Stream by a separator and emits the pieces in between, much like splitting a string.
 *
 * `splitBy` is effectively the inverse of [intersperse](#intersperse).
 *
 * @id splitBy
 * @section Transforms
 * @name Stream.splitBy(sep)
 * @param {String | RegExp} sep - the separator to split on
 * @api public
 *
 * _(['mis', 'si', 's', 'sippi']).splitBy('ss')  // => 'mi', 'i', 'ippi'
 * _(['ba', 'a', 'a']).intersperse('n').splitBy('n')  // => 'ba', 'a', 'a'
 * _(['foo']).splitBy('bar')  // => 'foo'
 */

addMethod('splitBy', function (sep) {
    var decoder = new Decoder();
    var buffer = false;

    function drain(x, push) {
        buffer = (buffer || '') + decoder.write(x);
        var pieces = buffer.split(sep);
        buffer = pieces.pop();

        pieces.forEach(function (piece) {
            push(null, piece);
        });
    }

    return this.consume(function (err, x, push, next) {
        if (err) {
            push(err);
            next();
        }
        else if (x === nil) {
            if (_.isString(buffer)) {
                drain(decoder.end(), push);
                push(null, buffer);
            }
            push(null, nil);
        }
        else {
            drain(x, push);
            next();
        }
    });
});

/**
 * [splitBy](#splitBy) over newlines.
 *
 * @id split
 * @section Transforms
 * @name Stream.split()
 * @api public
 *
 * _(['a\n', 'b\nc\n', 'd', '\ne']).split()  // => 'a', 'b', 'c', 'd', 'e'
 * _(['a\r\nb\nc']]).split()  // => 'a', 'b', 'c'
 */

addMethod('split', function () {
    return this.splitBy(/\r?\n/);
});

/**
 * Creates a new Stream with the values from the source in the range of `start`
 * (inclusive) to `end` (exclusive).
 *
 * @id slice
 * @section Transforms
 * @name Stream.slice(start, end)
 * @param {Number} start - (optional) integer representing index to start
 *     reading from source (inclusive). Defaults to `0` if not specified.
 * @param {Number} stop - (optional) integer representing index to stop
 *     reading from source (exclusive). Defaults to `Infinity` if not
 *     specified.
 * @throws {TypeError} if either parameters are not numbers.
 * @throws {RangeError} if either parameters are negative.
 * @api public
 *
 * _([1, 2, 3, 4]).slice(1, 3) // => 2, 3
 */

addMethod('slice', function(start, end) {
    if (start == null) {
        start = 0;
    }

    if (end == null) {
        end = Infinity;
    }

    checkIsNumber(start, 'start');
    checkIsNumber(end, 'end');
    checkRange(start >= 0, 'start cannot be negative.');
    checkRange(end >= 0, 'end cannot be negative.');

    var index = 0;

    if (start === 0 && end === Infinity) {
        return this;
    }
    else if (start >= end) {
        return _([]);
    }
    var s = this.consume(function (err, x, push, next) {
        var done = x === nil;
        if (err) {
            push(err);
        }
        else if (!done && index++ >= start) {
            push(null, x);
        }

        if (!done && index < end) {
            next();
        }
        else {
            push(null, nil);
        }
    });
    s.id = 'slice:' + s.id;
    return s;
});

/**
 * Creates a new Stream with the first `n` values from the source.
 *
 * @id take
 * @section Transforms
 * @name Stream.take(n)
 * @param {Number} n - integer representing number of values to read from source
 * @throws {TypeError} if `n` is not a number.
 * @throws {RangeError} if `n` is negative.
 * @api public
 *
 * _([1, 2, 3, 4]).take(2) // => 1, 2
 */

addMethod('take', function (n) {
    var s = this.slice(0, n);
    s.id = 'take:' + s.id;
    return s;
});

/**
 * Acts as the inverse of [`take(n)`](#take) - instead of returning the first
 * `n` values, it ignores the first `n` values and then emits the rest. All
 * errors (even ones emitted before the nth value) will be emitted.
 *
 * @id drop
 * @section Transforms
 * @name Stream.drop(n)
 * @param {Number} n - integer representing number of values to read from source
 * @throws {TypeError} if `n` is not a number.
 * @throws {RangeError} if `n` is negative.
 * @api public
 *
 * _([1, 2, 3, 4]).drop(2) // => 3, 4
 */

addMethod('drop', function (n) {
    return this.slice(n, Infinity);
});

/**
 * Creates a new Stream with only the first value from the source.
 *
 * @id head
 * @section Transforms
 * @name Stream.head()
 * @api public
 *
 * _([1, 2, 3, 4]).head() // => 1
 */

addMethod('head', function () {
    return this.take(1);
});

/**
 * Drops all values from the Stream apart from the last one (if any).
 *
 * @id last
 * @section Transforms
 * @name Stream.last()
 * @api public
 *
 * _([1, 2, 3, 4]).last()  // => 4
 */

addMethod('last', function () {
    var nothing = {};
    var prev = nothing;
    return this.consume(function (err, x, push, next) {
        if (err) {
            push(err);
            next();
        }
        else if (x === nil) {
            if (prev !== nothing) {
                push(null, prev);
            }
            push(null, nil);
        }
        else {
            prev = x;
            next();
        }
    });
});

/**
 * Collects all values together then emits each value individually in sorted
 * order. The method for sorting the elements is defined by the comparator
 * function supplied as a parameter.
 *
 * The comparison function takes two arguments `a` and `b` and should return
 *
 * - a negative number if `a` should sort before `b`.
 * - a positive number if `a` should sort after `b`.
 * - zero if `a` and `b` may sort in any order (i.e., they are equal).
 *
 * This function must also define a [partial
 * order](https://en.wikipedia.org/wiki/Partially_ordered_set). If it does not,
 * the resulting ordering is undefined.
 *
 * @id sortBy
 * @section Transforms
 * @name Stream.sortBy(f)
 * @param {Function} f - the comparison function
 * @api public
 *
 * var sorts = _([3, 1, 4, 2]).sortBy(function (a, b) {
 *     return b - a;
 * }).toArray(_.log);
 *
 * //=> [4, 3, 2, 1]
 */

addMethod('sortBy', function (f) {
    return this.collect().invoke('sort', [f]).sequence();
});

/**
 * Collects all values together then emits each value individually but in sorted order.
 * The method for sorting the elements is ascending lexical.
 *
 * @id sort
 * @section Transforms
 * @name Stream.sort()
 * @api public
 *
 * var sorted = _(['b', 'z', 'g', 'r']).sort().toArray(_.log);
 * // => ['b', 'g', 'r', 'z']
 */

addMethod('sort', function () {
    return this.sortBy();
});


/**
 * Transforms a stream using an arbitrary target transform.
 *
 * If `target` is a function, this transform passes the current Stream to it,
 * returning the result.
 *
 * If `target` is a [Duplex
 * Stream](https://nodejs.org/api/stream.html#stream_class_stream_duplex_1),
 * this transform pipes the current Stream through it. It will always return a
 * Highland Stream (instead of the piped to target directly as in
 * [pipe](#pipe)). Any errors emitted will be propagated as Highland errors.
 *
 * **TIP**: Passing a function to `through` is a good way to implement complex
 * reusable stream transforms. You can even construct the function dynamically
 * based on certain inputs. See examples below.
 *
 * @id through
 * @section Higher-order Streams
 * @name Stream.through(target)
 * @param {Function | Duplex Stream} target - the stream to pipe through or a
 * function to call.
 * @api public
 *
 * // This is a static complex transform.
 * function oddDoubler(s) {
 *     return s.filter(function (x) {
 *         return x % 2; // odd numbers only
 *     })
 *     .map(function (x) {
 *         return x * 2;
 *     });
 * }
 *
 * // This is a dynamically-created complex transform.
 * function multiplyEvens(factor) {
 *     return function (s) {
 *         return s.filter(function (x) {
 *             return x % 2 === 0;
 *         })
 *         .map(function (x) {
 *             return x * factor;
 *         });
 *     };
 * }
 *
 * _([1, 2, 3, 4]).through(oddDoubler); // => 2, 6
 *
 * _([1, 2, 3, 4]).through(multiplyEvens(5)); // => 10, 20
 *
 * // Can also be used with Node Through Streams
 * _(filenames).through(jsonParser).map(function (obj) {
 *     // ...
 * });
 *
 * // All errors will be propagated as Highland errors
 * _(['zz{"a": 1}']).through(jsonParser).errors(function (err) {
 *   console.log(err); // => SyntaxError: Unexpected token z
 * });
 */

addMethod('through', function (target) {
    var output;

    if (_.isFunction(target)) {
        return target(this);
    }
    else {
        target.pause();
        output = this.createChild();
        this.on('error', writeErr);
        target.on('error', writeErr);
        return this.pipe(target).pipe(output);
    }

    function writeErr(err) {
        output.write(new StreamError(err));
    }
});

/**
 * Creates a 'Through Stream', which passes data through a pipeline
 * of functions or other through Streams. This is particularly useful
 * when combined with partial application of Highland functions to expose a
 * Node-compatible Through Stream.
 *
 * This is not a method on a Stream, and it only exposed at the top-level
 * as `_.pipeline`. It takes an arbitrary number of arguments.
 *
 * @id pipeline
 * @section Higher-order Streams
 * @name _.pipeline(...)
 * @api public
 *
 * var through = _.pipeline(
 *     _.map(parseJSON),
 *     _.filter(isBlogpost),
 *     _.reduce(collectCategories)
 *     _.through(otherPipeline)
 * );
 *
 * readStream.pipe(through).pipe(outStream);
 *
 * // Alternatively, you can use pipeline to manipulate a stream in
 * // the chained method call style:
 *
 * var through2 = _.pipeline(function (s) {
 *     return s.map(parseJSON).filter(isBlogpost); // etc.
 * });
 */

addToplevelMethod('pipeline', function (/*through...*/) {
    if (!arguments.length) {
        return this();
    }
    var start = arguments[0], rest, startHighland;
    if (!_.isStream(start) && !_.isFunction(start.resume)) {
        // not a Highland stream or Node stream, start with empty stream
        start = this();
        startHighland = start;
        rest = slice.call(arguments);
    }
    else {
        // got a stream as first argument, co-erce to Highland stream
        startHighland = this(start);
        rest = slice.call(arguments, 1);
    }

    var end = rest.reduce(function (src, dest) {
        return src.through(dest);
    }, startHighland);

    var wrapper = this(function (push, next) {
        end.pull(function (err, x) {
            push(err, x);
            if (x !== nil) {
                next();
            }
        });
    });

    wrapper.writable = true;

    wrapper.write = function (x) {
        return start.write(x);
    };

    wrapper.end = function () {
        wrapper.writable = false;
        return start.end();
    };

    start.on('drain', function () {
        wrapper.emit('drain');
    });

    return wrapper;
});

/**
 * Reads values from a Stream of Streams or Arrays, emitting them on a single
 * output Stream. This can be thought of as a [flatten](#flatten), just one
 * level deep, often used for resolving asynchronous actions such as a HTTP
 * request or reading a file.
 *
 * @id sequence
 * @section Higher-order Streams
 * @name Stream.sequence()
 * @api public
 *
 * var nums = _([
 *     _([1, 2, 3]),
 *     _([4, 5, 6])
 * ]);
 *
 * nums.sequence()  // => 1, 2, 3, 4, 5, 6
 *
 * // using sequence to read from files in series
 * var readFile = _.wrapCallback(fs.readFile);
 * filenames.map(readFile).sequence()
 */

addMethod('sequence', function () {
    var original = this;
    var curr = this;
    return this.create(function (push, next) {
        curr.pull(function (err, x) {
            if (err) {
                push(err);
                next();
            }
            else if (_.isArray(x)) {
                if (onOriginalStream()) {
                    // just send all values from array directly
                    x.forEach(function (y) {
                        push(null, y);
                    });
                }
                else {
                    push(null, x);
                }
                next();
            }
            else if (_.isStream(x)) {
                if (onOriginalStream()) {
                    // switch to reading new stream
                    curr = x;
                    next();
                }
                else {
                    // sequence only goes 1 level deep
                    push(null, x);
                    next();
                }
            }
            else if (x === nil) {
                if (onOriginalStream()) {
                    push(null, nil);
                }
                else {
                    // resume reading from original
                    curr = original;
                    next();
                }
            }
            else {
                if (onOriginalStream()) {
                    // we shouldn't be getting non-stream (or array)
                    // values from the top-level stream
                    push(new Error(
                        'Expected Stream, got ' + (typeof x)
                    ));
                    next();
                }
                else {
                    push(null, x);
                    next();
                }
            }
        });
    });

    function onOriginalStream() {
        return curr === original;
    }
});

/**
 * An alias for the [sequence](#sequence) method.
 *
 * @id series
 * @section Higher-order Streams
 * @name Stream.series()
 * @api public
 *
 * var readFile = _.wrapCallback(fs.readFile);
 * filenames.map(readFile).series()
 */

Stream.prototype.series = Stream.prototype.sequence;
_.series = _.sequence;

/**
 * Recursively reads values from a Stream which may contain nested Streams
 * or Arrays. As values or errors are encountered, they are emitted on a
 * single output Stream.
 *
 * @id flatten
 * @section Higher-order Streams
 * @name Stream.flatten()
 * @api public
 *
 * _([1, [2, 3], [[4]]]).flatten();  // => 1, 2, 3, 4
 *
 * var nums = _(
 *     _([1, 2, 3]),
 *     _([4, _([5, 6]) ])
 * );
 *
 * nums.flatten();  // => 1, 2, 3, 4, 5, 6
 */

addMethod('flatten', function () {
    var curr = this;
    var stack = [];
    return this.createChild(function (push, next) {
        curr.pull(function (err, x) {
            if (err) {
                push(err);
                next();
                return;
            }
            if (_.isArray(x)) {
                x = _(x);
            }
            if (_.isStream(x)) {
                stack.push(curr);
                curr = x;
                next();
            }
            else if (x === nil) {
                if (stack.length) {
                    curr = stack.pop();
                    next();
                }
                else {
                    push(null, nil);
                }
            }
            else {
                push(null, x);
                next();
            }
        });
    });
});

/**
 * Takes a Stream of Streams and reads from them in parallel, buffering
 * the results until they can be returned to the consumer in their original
 * order.
 *
 * @id parallel
 * @section Higher-order Streams
 * @name Stream.parallel(n)
 * @param {Number} n - the maximum number of concurrent reads/buffers
 * @api public
 *
 * var readFile = _.wrapCallback(fs.readFile);
 * var filenames = _(['foo.txt', 'bar.txt', 'baz.txt']);
 *
 * // read from up to 10 files at once
 * filenames.map(readFile).parallel(10);
 */

addMethod('parallel', function (n) {
    var source = this;
    var running = [];
    var ended = false;
    var reading_source = false;

    if (typeof n !== 'number') {
        throw new Error('Must specify a number to parallel().');
    }

    if (n <= 0) {
        throw new Error('The parallelism factor must be positive');
    }

    return this.create(function (push, next) {
        if (running.length < n && !ended && !reading_source) {
            // get another stream if not already waiting for one
            reading_source = true;
            source.pull(function (err, x) {
                reading_source = false;
                if (err) {
                    push(err);
                }
                else if (x === nil) {
                    ended = true;
                }
                else if (!_.isStream(x)) {
                    push(new Error('Expected Stream, got ' + (typeof x)));
                }
                else {
                    // got a new source, add it to the running array
                    var run = {stream: x, buffer: []};
                    running.push(run);
                    x.consume(function (_err, y, _push, _next) {
                        if (running[0] === run) {
                            // current output stream
                            if (y === nil) {
                                // remove self from running and check
                                // to see if we need to read from source again
                                running.shift();
                                flushBuffer();
                                next();

                            }
                            else {
                                // push directly onto parallel output stream
                                push(_err, y);
                            }
                        }
                        else {
                            // we're reading ahead, buffer the output
                            run.buffer.push([_err, y]);
                        }
                        if (y !== nil) {
                            // keep reading until we hit nil
                            _next();
                        }
                    }).resume();
                }
                // check if we need to get any more streams
                return next();
            });
        }
        else if (!running.length && ended) {
            // nothing more to do
            push(null, nil);
        }

        function flushBuffer() {
            while (running.length && running[0].buffer.length) {
                var buf = running[0].buffer;
                for (var i = 0; i < buf.length; i++) {
                    if (buf[i][1] === nil) {
                        // this stream has ended
                        running.shift();
                        break;
                    }
                    else {
                        // send the buffered output
                        push.apply(null, buf[i]);
                    }
                }
                buf.length = 0;
            }
        }
        // else wait for more data to arrive from running streams
    });
});

/**
 * Switches source to an alternate Stream if the current Stream is empty.
 *
 * @id otherwise
 * @section Higher-order Streams
 * @name Stream.otherwise(ys)
 * @param {Stream | Function} ys - alternate stream (or stream-returning function) to use if this stream is empty
 * @api public
 *
 * _([1,2,3]).otherwise(['foo'])  // => 1, 2, 3
 * _([]).otherwise(['foo'])       // => 'foo'
 *
 * _.otherwise(_(['foo']), _([1,2,3]))    // => 1, 2, 3
 * _.otherwise(_(['foo']), _([]))         // => 'foo'
 */

addMethod('otherwise', function (ys) {
    var xs = this;
    return xs.consume(function (err, x, push, next) {
        if (err) {
            // got an error, just keep going
            push(err);
            next();
        }
        else if (x === nil) {
            // hit the end without redirecting to xs, use alternative
            if (_.isFunction(ys)) {
                next(ys());
            }
            else {
                next(ys);
            }
        }
        else {
            // got a value, push it, then redirect to xs
            push(null, x);
            next(xs);
        }
    });
});

/**
 * Adds a value to the end of a Stream.
 *
 * @id append
 * @section Transforms
 * @name Stream.append(y)
 * @param y - the value to append to the Stream
 * @api public
 *
 * _([1, 2, 3]).append(4)  // => 1, 2, 3, 4
 */

addMethod('append', function (y) {
    return this.consume(function (err, x, push, next) {
        if (x === nil) {
            push(null, y);
            push(null, _.nil);
        }
        else {
            push(err, x);
            next();
        }
    });
});

/**
 * Boils down a Stream to a single value. The memo is the initial state
 * of the reduction, and each successive step of it should be returned by
 * the iterator function. The iterator is passed two arguments:
 * the memo and the next value.
 *
 * If the iterator throws an error, the reduction stops and the resulting
 * stream will emit that error instead of a value.
 *
 * @id reduce
 * @section Transforms
 * @name Stream.reduce(iterator, memo)
 * @param memo - the initial state of the reduction
 * @param {Function} iterator - the function which reduces the values
 * @api public
 *
 * var add = function (a, b) {
 *     return a + b;
 * };
 *
 * _([1, 2, 3, 4]).reduce(add, 0)  // => 10
 */

addMethod('reduce', function (f, z) {
    // This can't be implemented with scan(), because we don't know if the
    // errors that we see from the scan were thrown by the iterator or just
    // passed through from the source stream.
    return this.consume(function (err, x, push, next) {
        if (x === nil) {
            push(null, z);
            push(null, _.nil);
        }
        else if (err) {
            push(err);
            next();
        }
        else {
            try {
                z = f(z, x);
            }
            catch (e) {
                push(e);
                push(null, _.nil);
                return;
            }

            next();
        }
    });
});

/**
 * Same as [reduce](#reduce), but uses the first element as the initial
 * state instead of passing in a `memo` value.
 *
 * @id reduce1
 * @section Transforms
 * @name Stream.reduce1(iterator)
 * @param {Function} iterator - the function which reduces the values
 * @api public
 *
 * _([1, 2, 3, 4]).reduce1(add)  // => 10
 */

addMethod('reduce1', function (f) {
    var self = this;
    return self.createChild(function (push, next) {
        self.pull(function (err, x) {
            if (err) {
                push(err);
                next();
            }
            else if (x === nil) {
                push(null, nil);
            }
            else {
                next(self.reduce(f, x));
            }
        });
    });
});

/**
 * Groups all values into an Array and passes down the stream as a single
 * data event. This is a bit like doing [toArray](#toArray), but instead
 * of accepting a callback and consuming the stream, it passes the value on.
 *
 * @id collect
 * @section Transforms
 * @name Stream.collect()
 * @api public
 *
 * _(['foo', 'bar']).collect().toArray(function (xs) {
 *     // xs will be [['foo', 'bar']]
 * });
 */

addMethod('collect', function () {
    var xs = [];
    return this.consume(function (err, x, push, next) {
        if (err) {
            push(err);
            next();
        }
        else if (x === nil) {
            push(null, xs);
            push(null, nil);
        }
        else {
            xs.push(x);
            next();
        }
    });
});

/**
 * Like [reduce](#reduce), but emits each intermediate value of the
 * reduction as it is calculated.
 *
 * If the iterator throws an error, the scan will stop and the stream will
 * emit that error. Any intermediate values that were produced before the
 * error will still be emitted.
 *
 * @id scan
 * @section Transforms
 * @name Stream.scan(iterator, memo)
 * @param memo - the initial state of the reduction
 * @param {Function} iterator - the function which reduces the values
 * @api public
 *
 * _([1, 2, 3, 4]).scan(add, 0)  // => 0, 1, 3, 6, 10
 */

addMethod('scan', function (f, z) {
    var self = this;
    return this.create([z]).concat(
        self.consume(function (err, x, push, next) {
            if (x === nil) {
                push(null, _.nil);
            }
            else if (err) {
                push(err);
                next();
            }
            else {
                try {
                    z = f(z, x);
                }
                catch (e) {
                    push(e);
                    push(null, _.nil);
                    return;
                }

                push(null, z);
                next();
            }
        })
    );
});

/**
 * Same as [scan](#scan), but uses the first element as the initial
 * state instead of passing in a `memo` value.
 *
 * @id scan1
 * @section Transforms
 * @name Stream.scan1(iterator)
 * @param {Function} iterator - the function which reduces the values
 * @api public
 *
 * _([1, 2, 3, 4]).scan1(add)  // => 1, 3, 6, 10
 */

addMethod('scan1', function (f) {
    var self = this;
    return self.createChild(function (push, next) {
        self.pull(function (err, x) {
            if (err) {
                push(err);
                next();
            }
            else if (x === nil) {
                push(null, nil);
            }
            else {
                next(self.scan(f, x));
            }
        });
    });
});

function HighlandTransform(push) {
    this.push = push;
}

HighlandTransform.prototype['@@transducer/init'] = function () {
    return this.push;
};

HighlandTransform.prototype['@@transducer/result'] = function (push) {
    // Don't push nil here. Otherwise, we can't catch errors from `result`
    // and propagate them. The `transduce` implementation will do it.
    return push;
};

HighlandTransform.prototype['@@transducer/step'] = function (push, input) {
    push(null, input);
    return push;
};

/**
 * Applies the transformation defined by the the given *transducer* to the
 * stream. A transducer is any function that follows the
 * [Transducer Protocol](https://github.com/cognitect-labs/transducers-js#transformer-protocol).
 * See
 * [transduce-js](https://github.com/cognitect-labs/transducers-js#transducers-js)
 * for more details on what transducers actually are.
 *
 * The `result` object that is passed in through the
 * [Transformer Protocol](https://github.com/cognitect-labs/transducers-js#transformer-protocol)
 * will be the `push` function provided by the [consume](#consume) transform.
 *
 * Like [scan](#scan), if the transducer throws an exception, the transform
 * will stop and emit that error. Any intermediate values that were produced
 * before the error will still be emitted.
 *
 * @id transduce
 * @section Transforms
 * @name Stream.transduce(xf)
 * @param {Function} xf - The transducer.
 * @api public
 *
 * var xf = require('transducer-js').map(_.add(1));
 * _([1, 2, 3, 4]).transduce(xf);
 * // => 2, 3, 4, 5
 */

addMethod('transduce', function transduce(xf) {
    var transform = null,
        memo = null;

    return this.consume(function (err, x, push, next) {
        if (transform == null) {
            transform = xf(new HighlandTransform(push));
            memo = transform['@@transducer/init']();
        }

        if (err) {
            // Pass through errors, like we always do.
            push(err);
            next();
        }
        else if (x === _.nil) {
            // Push may be different from memo depending on the transducer that
            // we get.
            runResult(push, memo);
        }
        else {
            var res = runStep(push, memo, x);

            if (!res) {
                return;
            }

            memo = res;
            if (memo['@@transducer/reduced']) {
                runResult(memo['@@transducer/value']);
            }
            else {
                next();
            }
        }
    });

    function runResult(push, _memo) {
        try {
            transform['@@transducer/result'](_memo);
        }
        catch (e) {
            push(e);
        }
        push(null, _.nil);
    }

    function runStep(push, _memo, x) {
        try {
            return transform['@@transducer/step'](_memo, x);
        }
        catch (e) {
            push(e);
            push(null, _.nil);
            return null;
        }
    }
});

/**
 * Concatenates a Stream to the end of this Stream.
 *
 * Be aware that in the top-level export, the args may be in the reverse
 * order to what you'd expect `_([a], [b]) => b, a`, as this follows the
 * convention of other top-level exported functions which do `x` to `y`.
 *
 * @id concat
 * @section Higher-order Streams
 * @name Stream.concat(ys)
 * @param {Stream | Array} ys - the values to concatenate onto this Stream
 * @api public
 *
 * _([1, 2]).concat([3, 4])  // => 1, 2, 3, 4
 * _.concat([3, 4], [1, 2])  // => 1, 2, 3, 4
 */

addMethod('concat', function (ys) {
    ys = _(ys);
    return this.consume(function (err, x, push, next) {
        if (x === nil) {
            next(ys);
        }
        else {
            push(err, x);
            next();
        }
    });
});

/**
 * Takes a Stream of Streams and merges their values and errors into a
 * single new Stream. The merged stream ends when all source streams have
 * ended.
 *
 * Note that no guarantee is made with respect to the order in which
 * values for each stream end up in the merged stream. Values in the
 * merged stream will, however, respect the order they were emitted from
 * their respective streams.
 *
 * @id merge
 * @section Higher-order Streams
 * @name Stream.merge()
 * @api public
 *
 * var readFile = _.wrapCallback(fs.readFile);
 *
 * var txt = _(['foo.txt', 'bar.txt']).map(readFile)
 * var md = _(['baz.md']).map(readFile)
 *
 * _([txt, md]).merge();
 * // => contents of foo.txt, bar.txt and baz.txt in the order they were read
 */

addMethod('merge', function () {
    var self = this;
    var srcs = [];

    var srcsNeedPull = [],
        first = true,
        async = false;

    return this.create(function (push, next) {
        if (first) {
            first = false;
            getSourcesSync(push, next);
        }

        if (srcs.length === 0) {
            push(null, nil);
        }
        else if (srcsNeedPull.length) {
            pullFromAllSources(push, next);
            next();
        }
        else {
            async = true;
        }
    });

    // Make a handler for the main merge loop.
    function srcPullHandler(push, next, src) {
        return function (err, x) {
            if (err) {
                push(err);
                srcsNeedPull.push(src);
            }
            else if (x === nil) {
                srcs = srcs.filter(function (s) {
                    return s !== src;
                });
            }
            else {
                if (src === self) {
                    srcs.push(x);
                    srcsNeedPull.push(x);
                    srcsNeedPull.unshift(self);
                }
                else {
                    push(null, x);
                    srcsNeedPull.push(src);
                }
            }

            if (async) {
                async = false;
                next();
            }
        };
    }


    function pullFromAllSources(push, next) {
        var _srcs = srcsNeedPull;
        srcsNeedPull = [];
        _srcs.forEach(function (src) {
            src.pull(srcPullHandler(push, next, src));
        });
    }

    // Pulls as many sources as possible from self synchronously.
    function getSourcesSync(push, next) {
        // Shadows the outer async variable.
        var asynchronous;
        var done = false;

        var pull_cb = function(err, x) {
            asynchronous = false;
            if (done) {
                // This means the pull was async. Handle like
                // regular async.
                srcPullHandler(push, next, self)(err, x);
            }
            else {
                if (err) {
                    push(err);
                }
                else if (x === nil) {
                    done = true;
                }
                else {
                    srcs.push(x);
                    srcsNeedPull.push(x);
                }
            }
        };

        while (!done) {
            asynchronous = true;
            self.pull(pull_cb);

            // Async behavior, record self as a src and return.
            if (asynchronous) {
                done = true;
                srcs.unshift(self);
            }
        }
    }
});

/**
 * Takes a Stream of Streams and merges their values and errors into a
 * single new Stream, limitting the number of unpaused streams that can
 * running at any one time.
 *
 * Note that no guarantee is made with respect to the order in which
 * values for each stream end up in the merged stream. Values in the
 * merged stream will, however, respect the order they were emitted from
 * their respective streams.
 *
 * @id mergeWithLimit
 * @section Higher-order Streams
 * @name Stream.mergeWithLimit(n)
 * @param {Number} n - the maximum number of streams to run in parallel
 * @api public
 *
 * var readFile = _.wrapCallback(fs.readFile);
 *
 * var txt = _(['foo.txt', 'bar.txt']).flatMap(readFile)
 * var md = _(['baz.md']).flatMap(readFile)
 * var js = _(['bosh.js']).flatMap(readFile)
 *
 * _([txt, md, js]).mergeWithLimit(2);
 * // => contents of foo.txt, bar.txt, baz.txt and bosh.js in the order
 * // they were read, but bosh.js is not read until either foo.txt and bar.txt
 * // has completely been read or baz.md has been read
 */


addMethod('mergeWithLimit', function mergeWithLimit(n){
    var self = this;
    var processCount = 0;
    var waiting = false;
    if (typeof n !== 'number' || n < 1) {
        throw new Error('mergeWithLimit expects a positive number, but got: ' + n);
    }

    if (n === Infinity) {
        return this.merge();
    }
    return this.create(function(push, next){
        self.pull(function(err, x){
            var done = x === nil;
            if (err){
                push(err);
                next();
            }
            else if (x === nil) {
                push(null, nil);
            }
            else {
                processCount++;
                push(err, x);
                // console.log('start', x.id);
                x.onDestroy(function() {
                    processCount--;
                    // console.log('end', x.id);
                    if (waiting) {
                        // console.log('get more');
                        waiting = false;
                        next();
                    }
                });
                if (!done && processCount < n) {
                    next();
                }
                else {
                    // console.log('wait till something ends');
                    waiting = true;
                }
            }
        });
    }).merge();
});

/**
 * Calls a named method on each object from the Stream - returning
 * a new stream with the result of those calls.
 *
 * @id invoke
 * @section Transforms
 * @name Stream.invoke(method, args)
 * @param {String} method - the method name to call
 * @param {Array} args - the arguments to call the method with
 * @api public
 *
 * _(['foo', 'bar']).invoke('toUpperCase', [])  // => 'FOO', 'BAR'
 *
 * var readFile = _.wrapCallback(fs.readFile);
 * filenames.flatMap(readFile).invoke('toString', ['utf8']);
 */

addMethod('invoke', function (method, args) {
    return this.map(function (x) {
        return x[method].apply(x, args);
    });
});

/**
 * Takes a Stream of callback-accepting node-style functions,
 * [wraps](#wrapCallback) each one into a stream-returning function,
 * calls them with the arguments provided, and returns the results
 * as a Stream.
 *
 * This can be used as a control flow shortcut and draws parallels
 * with some control flow functions from [async](https://github.com/caolan/async).
 * A few rough correspondences include:
 *
 * - `.nfcall([]).series()` to `async.series()`
 * - `.nfcall([]).parallel(n)` to `async.parallelLimit(n)`
 * - `.nfcall(args)` to `async.applyEach(..., args)`
 * - `.nfcall(args).series()` to `async.applyEachSeries(..., args)`
 *
 * @id nfcall
 * @section Transforms
 * @name Stream.nfcall(args)
 * @param {Array} args - the arguments to call each function with
 * @api public
 *
 * _([
 *   function (callback) {
 *     setTimeout(function () {
 *       callback(null, 'one');
 *     }, 200);
 *   },
 *   function (callback) {
 *     setTimeout(function () {
 *       callback(null, 'two');
 *     }, 100);
 *   }
 * ]).nfcall([]).parallel(2).toArray(function (xs) {
 *   // xs is ['one', 'two'] even though second function had a shorter timeout
 * });
 *
 * _([enableSearch, updateSchema]).nfcall(['bucket']).toArray(callback);
 * // does roughly the same as
 * async.applyEach([enableSearch, updateSchema], 'bucket', callback);
 *
 * _([
 *   fs.appendFile,
 *   fs.appendFile
 * ]).nfcall(['example.txt', 'hello']).series().toArray(function() {
 *   // example.txt now contains 'hellohello'
 * });
 *
 */

addMethod('nfcall', function (args) {
    var wrap = _.wrapCallback._relevel(this.create.bind(this));
    return this.map(function (x) {
        return wrap(x).apply(x, args);
    });
});

/**
 * Ensures that only one data event is push downstream (or into the buffer)
 * every `ms` milliseconds, any other values are dropped.
 *
 * @id throttle
 * @section Transforms
 * @name Stream.throttle(ms)
 * @param {Number} ms - the minimum milliseconds between each value
 * @api public
 *
 * _('mousemove', document).throttle(1000);
 */

addMethod('throttle', function (ms) {
    var last = 0 - ms;
    return this.consume(function (err, x, push, next) {
        var now = new Date().getTime();
        if (err) {
            push(err);
            next();
        }
        else if (x === nil) {
            push(null, nil);
        }
        else if (now - ms >= last) {
            last = now;
            push(null, x);
            next();
        }
        else {
            next();
        }
    });
});

/**
 * Holds off pushing data events downstream until there has been no more
 * data for `ms` milliseconds. Sends the last value that occurred before
 * the delay, discarding all other values.
 *
 * **Implementation Note**: This transform will will not wait the full `ms`
 * delay to emit a pending value (if any) once it see a `nil`, as that
 * guarantees that there will be no more values.
 *
 * @id debounce
 * @section Transforms
 * @name Stream.debounce(ms)
 * @param {Number} ms - the milliseconds to wait before sending data
 * @api public
 *
 * function delay(x, ms, push) {
 *     setTimeout(function () {
 *         push(null, x);
 *     }, ms);
 * }
 *
 * // sends last keyup event after user has stopped typing for 1 second
 * $('keyup', textbox).debounce(1000);
 *
 * // A nil triggers the emit immediately
 * _(function (push, next) {
 *     delay(0, 100, push);
 *     delay(1, 200, push);
 *     delay(_.nil, 250, push);
 * }).debounce(75);
 * // => after 175ms => 1
 * // => after 250ms (not 275ms!) => 1 2
 */

addMethod('debounce', function (ms) {
    var t = null;
    var nothing = {};
    var last = nothing;

    return this.consume(function (err, x, push, next) {
        if (err) {
            // let errors through regardless
            push(err);
            next();
        }
        else if (x === nil) {
            if (t) {
                clearTimeout(t);
            }
            if (last !== nothing) {
                push(null, last);
            }
            push(null, nil);
        }
        else {
            last = x;
            if (t) {
                clearTimeout(t);
            }
            t = setTimeout(push.bind(this, null, x), ms);
            next();
        }
    });
});

/**
 * Creates a new Stream, which when read from, only returns the last
 * seen value from the source. The source stream does not experience
 * back-pressure. Useful if you're using a Stream to model a changing
 * property which you need to query periodically.
 *
 * @id latest
 * @section Transforms
 * @name Stream.latest()
 * @api public
 *
 * // slowThing will always get the last known mouse position
 * // when it asks for more data from the mousePosition stream
 * mousePosition.latest().map(slowThing)
 */

addMethod('latest', function () {
    var nothing = {},
        latest = nothing,
        errors = [],
        ended = false,
        onValue = null;

    this.consume(function (err, x, push, next) {
        if (onValue != null) {
            var cb = onValue;
            onValue = null;
            cb(err, x);
        }

        if (err) {
            errors.push(err);
            next();
        }
        else if (x === nil) {
            ended = true;
        }
        else {
            latest = x;
            next();
        }
    }).resume();

    return this.create(function (push, next) {
        var oldErrors = errors;
        errors = [];

        if (!oldErrors.length && latest === nothing && !ended) {
            // We haven't gotten any data yet. We can't call next
            // because that might cause the stream to call the generator
            // again, resulting in an infinite loop. Thus, we stick a
            // a callback to be called whenever we get a value.
            onValue = function (err, x) {
                push(err, x);
                if (x !== nil) {
                    next();
                }
            };
        }
        else {
            oldErrors.forEach(push);
            if (latest !== nothing) {
                push(null, latest);
            }
            if (ended) {
                push(null, nil);
            }
            else {
                next();
            }
        }
    });
});

function StreamMultiplexer(stream) {
    this._stream = stream;

    this._consumers = new IntMap();
    this._requests = new IntMap();
    this._nonce = 0;
    this._emitting = false;
    this._repeatEmit = false;
    this._cached_value = null;
    this.paused = true;

    var self = this;
    this._pullCb = function _pullCb(err, x) {
        self.paused = true;
        if (self._requests.size === self._consumers.size) {
            self._send(err, x);
        }
        else {
            self._saved_token = [err, x];
        }
    };
}

/**
 * Emit downstream. The caller must guarantee that
 * this._consumers.size === this._requests.size.
 *
 * @param err - an error.
 * @param x - a value.
 */

StreamMultiplexer.prototype._send = function _send(err, x) {
    // Take a snapshot of the current request since calling the callbacks
    // may trigger more request to be registered.
    var requests = this._requests;
    this._requests = new IntMap();

    requests.forEach(function (requestCb) {
        requestCb(err, x);
    });
};

/**
 * Emit if we've met the backpressure requirements.
 */
StreamMultiplexer.prototype._resume = function _resume() {
    if (this._emitting) {
        this._repeatEmit = true;
        return;
    }

    this._emitting = true;
    do {
        // use a repeat flag to avoid recursing pull() calls
        this._repeatEmit = false;

        if (this._requests.size === this._consumers.size) {
            if (this._saved_token) {
                var token = this._saved_token;
                this._saved_token = null;
                this.paused = true;
                this._send(token[0], token[1]);
            }
            else if (this.paused) {
                this.paused = false;
                this._stream.pull(this._pullCb);
            }
        }
    } while (this._repeatEmit);
    this._emitting = false;
};

StreamMultiplexer.prototype.pull = function pull(id, cb) {
    if (!cb) {
        return;
    }

    if (this._requests.has(id)) {
        cb(new Error('Cannot service a second pull() request while one is in progress.'));
        return;
    }

    this._requests.set(id, cb);

    this._resume();
};

StreamMultiplexer.prototype.newStream = function newStream() {
    var self = this,
        id = self._nonce++;

    self._consumers.set(id, true);

    var pull = this.pull.bind(this, id);
    return new this._stream.constructor(newDelegateGenerator(pull))
        .onDestroy(function () {
            self.removeConsumer(id);
        });
};

StreamMultiplexer.prototype.removeConsumer = function removeConsumer(id) {
    if (!this._consumers.has(id)) {
        return;
    }

    this._consumers.delete(id);
    this._requests.delete(id);

    this._resume();
};

/**
 * Returns values from an Object as a Stream. Reads properties
 * lazily, so if you don't read from all keys on an object, not
 * all properties will be read from (may have an effect where getters
 * are used).
 *
 * @id values
 * @section Objects
 * @name _.values(obj)
 * @param {Object} obj - the object to return values from
 * @api public
 *
 * _.values({foo: 1, bar: 2, baz: 3})  // => 1, 2, 3
 */

_.values = function (obj) {
    return _.keys(obj).map(function (k) {
        return obj[k];
    });
};

/**
 * Returns keys from an Object as a Stream.
 *
 * @id keys
 * @section Objects
 * @name _.keys(obj)
 * @param {Object} obj - the object to return keys from
 * @api public
 *
 * _.keys({foo: 1, bar: 2, baz: 3})  // => 'foo', 'bar', 'baz'
 */

function keys (obj) {
    var keysArray = [];
    for (var k in obj) {
        if (hasOwn.call(obj, k)) {
            keysArray.push(k);
        }
    }
    return keysArray;
}

_.keys = function (obj) {
    return _(keys(obj));
};

/**
 * Returns key/value pairs for an Object as a Stream. Reads properties
 * lazily, so if you don't read from all keys on an object, not
 * all properties will be read from (may have an effect where getters
 * are used).
 *
 * @id pairs
 * @section Objects
 * @name _.pairs(obj)
 * @param {Object} obj - the object to return key/value pairs from
 * @api public
 *
 * _.pairs({foo: 1, bar: 2})  // => ['foo', 1], ['bar', 2]
 */

_.pairs = function (obj) {
    return _.keys(obj).map(function (k) {
        return [k, obj[k]];
    });
};

/**
 * Extends one object with the properties of another. **Note:** The
 * arguments are in the reverse order of other libraries such as
 * underscore. This is so it follows the convention of other functions in
 * this library and so you can more meaningfully partially apply it.
 *
 * @id extend
 * @section Objects
 * @name _.extend(a, b)
 * @param {Object} a - the properties to extend b with
 * @param {Object} b - the original object to extend
 * @api public
 *
 * _.extend({name: 'bar'}, {name: 'foo', price: 20})
 * // => {name: 'bar', price: 20}
 *
 * // example of partial application
 * var publish = _.extend({published: true});
 *
 * publish({title: 'test post'})
 * // => {title: 'test post', published: true}
 */

_.extend = _.curry(function (extensions, target) {
    for (var k in extensions) {
        if (hasOwn.call(extensions, k)) {
            target[k] = extensions[k];
        }
    }
    return target;
});

/**
 * Returns a property from an object.
 *
 * @id get
 * @section Objects
 * @name _.get(prop, obj)
 * @param {String} prop - the property to return
 * @param {Object} obj - the object to read properties from
 * @api public
 *
 * var obj = {foo: 'bar', baz: 123};
 * _.get('foo', obj) // => 'bar'
 *
 * // making use of partial application
 * var posts = [
 *   {title: 'one'},
 *   {title: 'two'},
 *   {title: 'three'}
 * ];
 *
 * _(posts).map(_.get('title'))  // => 'one', 'two', 'three'
 */

_.get = _.curry(function (prop, obj) {
    return obj[prop];
});

/**
 * Updates a property on an object, returning the updated object.
 *
 * @id set
 * @section Objects
 * @name _.set(prop, value, obj)
 * @param {String} prop - the property to return
 * @param value - the value to set the property to
 * @param {Object} obj - the object to set properties on
 * @api public
 *
 * var obj = {foo: 'bar', baz: 123};
 * _.set('foo', 'wheeee', obj) // => {foo: 'wheeee', baz: 123}
 *
 * // making use of partial application
 * var publish = _.set('published', true);
 *
 * publish({title: 'example'})  // => {title: 'example', published: true}
 */

_.set = _.curry(function (prop, val, obj) {
    obj[prop] = val;
    return obj;
});

/**
 * Logs values to the console, a simple wrapper around `console.log` that
 * it suitable for passing to other functions by reference without having to
 * call `bind`.
 *
 * @id log
 * @section Utils
 * @name _.log(args..)
 * @api public
 *
 * _.log('Hello, world!');
 *
 * _([1, 2, 3, 4]).each(_.log);
 */

_.log = function () {
    console.log.apply(console, arguments);
};

/**
 * Wraps a node-style async function which accepts a callback, transforming
 * it to a function which accepts the same arguments minus the callback and
 * returns a Highland Stream instead. The wrapped function keeps its context,
 * so you can safely use it as a method without binding (see the second
 * example below).
 *
 * `wrapCallback` also accepts an optional `mappingHint`, which specifies how
 * callback arguments are pushed to the stream. This can be used to handle
 * non-standard callback protocols that pass back more than one value.
 *
 * `mappingHint` can be a function, number, or array. See the documentation on
 * [EventEmitter Stream Objects](#Stream Objects) for details on the mapping
 * hint. If `mappingHint` is a function, it will be called with all but the
 * first argument that is passed to the callback. The first is still assumed to
 * be the error argument.
 *
 * @id wrapCallback
 * @section Utils
 * @name _.wrapCallback(f)
 * @param {Function} f - the node-style function to wrap
 * @param {Array | Function | Number} mappingHint - (optional) how to pass the
 * arguments to the callback
 * @api public
 *
 * var fs = require('fs');
 *
 * var readFile = _.wrapCallback(fs.readFile);
 *
 * readFile('example.txt').apply(function (data) {
 *     // data is now the contents of example.txt
 * });
 *
 * function Reader(file) {
 *     this.file = file;
 * }
 *
 * Reader.prototype.read = function(cb) {
 *     fs.readFile(this.file, cb);
 * };
 *
 * Reader.prototype.readStream = _.wrapCallback(Reader.prototype.read);
 */

/*eslint-disable no-multi-spaces */
addToplevelMethod('wrapCallback', function (f, /*optional*/mappingHint) {
    /*eslint-enable no-multi-spaces */
    var stream = this;
    var mapper = hintMapper(mappingHint);

    return function () {
        var self = this;
        var args = slice.call(arguments);
        return stream(function (push) {
            var cb = function (err) {
                if (err) {
                    push(err);
                }
                else {
                    var cbArgs = slice.call(arguments, 1);
                    var v = mapper.apply(this, cbArgs);
                    push(null, v);
                }
                push(null, nil);
            };
            f.apply(self, args.concat([cb]));
        });
    };
});

/**
 * Wraps a function that returns a promise, transforming it to a function
 * which accepts the same arguments and returns a Highland Stream instead.
 * The wrapped function keeps its context, so you can safely use it as a
 * method without binding.
 *
 * @id wrapAsync
 * @section Utils
 * @name _.wrapAsync(f)
 * @param {Function} f - the function that returns a promise
 * @api public
 *
 * var resolve = _.wrapAsync(Promise.resolve);
 * var reject = _.wrapAsync(Promise.reject);
 *
 * resolve([1, 2, 3]).apply(function (a, b, c) {
 *  // a === 1
 *  // b === 2
 *  // c === 3
 * });
 *
 * reject('boom').errors(function (err) {
 *   // err === 'boom'
 * });
 */

addToplevelMethod('wrapAsync', function (f) {
    var stream = this;
    return function () {
        var promise;
        try {
            promise = f.apply(this, arguments);
            if (!_.isObject(promise) || !_.isFunction(promise.then)) {
                return _.fromError(new Error('Wrapped function did not return a promise'));
            }
            return stream(promise);
        }
        catch (e) {
            return _.fromError(e);
        }
    };
});

/**
 * Takes an object or a constructor function and returns that object or
 * constructor with streamified versions of its function properties.
 * Passed constructors will also have their prototype functions
 * streamified.  This is useful for wrapping many node style async
 * functions at once, and for preserving those functions' context.
 *
 * @id streamifyAll
 * @section Utils
 * @name _.streamifyAll(source)
 * @param {Object | Function} source - the function or object with
 * node-style function properties.
 * @api public
 *
 * var fs = _.streamifyAll(require('fs'));
 *
 * fs.readFileStream('example.txt').apply(function (data) {
 *     // data is now the contents of example.txt
 * });
 */

function isClass (fn) {
    if (!(typeof fn === 'function' && fn.prototype)) { return false; }
    var getKeys = isES5 ? Object.getOwnPropertyNames : keys;
    var allKeys = getKeys(fn.prototype);
    return allKeys.length > 0 && !(allKeys.length === 1 &&
            allKeys[0] === 'constructor');
}

function inheritedKeys (obj) {
    var allProps = {};
    var curr = obj;
    var handleProp = function (prop) {
        allProps[prop] = true;
    };
    while (Object.getPrototypeOf(curr)) {
        var props = Object.getOwnPropertyNames(curr);
        props.forEach(handleProp);
        curr = Object.getPrototypeOf(curr);
    }
    return keys(allProps);
}

function streamifyAll (wrapCallback, inp, suffix) {
    // will not streamify inherited functions in ES3
    var getKeys = isES5 ? inheritedKeys : keys;
    var allKeys = getKeys(inp);

    for (var i = 0, len = allKeys.length; i < len; i++) {
        var key = allKeys[i];
        var val;

        // will skip context aware getters
        try {
            val = inp[key];
        }
        catch (e) {
            // Ignore
        }

        if (val && typeof val === 'function' && !isClass(val) &&
                !val.__HighlandStreamifiedFunction__) {

            var streamified = wrapCallback(val);
            streamified.__HighlandStreamifiedFunction__ = true;
            inp[key + suffix] = streamified;
        }
    }
    return inp;
}

addToplevelMethod('streamifyAll', function (arg) {
    if (typeof arg !== 'function' && typeof arg !== 'object') {
        throw new TypeError('takes an object or a constructor function');
    }
    var suffix = 'Stream';

    var ret = streamifyAll(this.wrapCallback, arg, suffix);
    if (isClass(arg)) {
        ret.prototype = streamifyAll(this.wrapCallback, arg.prototype, suffix);
    }
    return ret;
});

/**
 * Add two values. Can be partially applied.
 *
 * @id add
 * @section Operators
 * @name _.add(a, b)
 * @api public
 *
 * _.add(1, 2) === 3
 * _.add(1)(5) === 6
 */

_.add = _.curry(function (a, b) {
    return a + b;
});

/**
 * Perform logical negation on a value. If `x` is truthy then returns false,
 * otherwise returns true.
 *
 * @id not
 * @section Operators
 * @name _.not(x)
 * @param x - the value to negate
 * @api public
 *
 * _.not(true)   // => false
 * _.not(false)  // => true
 */

_.not = function (x) {
    return !x;
};
