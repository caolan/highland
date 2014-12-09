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
 * **EventEmitter / jQuery Elements -** Pass in both an event name and an
 * event emitter as the two arguments to the constructor and the first
 * argument emitted to the event handler will be written to the new Stream.
 *
 * You can also pass as an optional third parameter a function, an array of strings
 * or a number. In this case the event handler will try to wrap the arguments emitted
 * to it and write this object to the new stream.
 *
 * **Promise -** Accepts an ES6 / jQuery style promise and returns a
 * Highland Stream which will emit a single value (or an error).
 *
 * @id _(source)
 * @section Stream Objects
 * @name _(source)
 * @param {Array | Function | Readable Stream | Promise} source - (optional) source to take values from from
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
 * // creating a stream from events
 * _('click', btn).each(handleEvent);
 *
 * // creating a stream from events with mapping
 * _('request', httpServer, ['req', 'res']).each(handleEvent);
 *
 * // from a Promise object
 * var foo = _($.getJSON('/api/foo'));
 */

exports = module.exports = function (/*optional*/xs, /*optional*/ee, /*optional*/ mappingHint) {
    var s = null;
    if (xs === undefined) {
        s = new Stream();
    }
    else if (_.isStream(xs)) {
        s = xs;
    }
    else if (_.isArray(xs)) {
        s = new Stream();
        s._outgoing.enqueueAll(xs);
        s._outgoing.enqueue(_.nil);
    }
    else if (_.isFunction(xs)) {
        s = new Stream(xs);
    }
    else if (_.isObject(xs)) {
        if (_.isFunction(xs.then)) {
            // probably a promise
            s = new Stream(function (push) {
                xs.then(function (value) {
                    push(null, value);
                    return push(null, nil);
                },
                function (err) {
                    push(err);
                    return push(null, nil);
                });
            });
        }
        else {
            s = new Stream();
            // write any errors into the stream
            xs.on('error', s._push_fn);
            xs.on('end', s.write.bind(s, nil));
            // assume it's a pipeable stream as a source
            xs.pipe(s);
        }
    }
    else if (typeof xs === 'string') {
        var mappingHintType = (typeof mappingHint);
        var mapper;

        if (mappingHintType === 'function') {
            mapper = mappingHint;
        } else if (mappingHintType === 'number') {
            mapper = function () {
                return slice.call(arguments, 0, mappingHint);
            };
        } else if (_.isArray(mappingHint)) {
            mapper = function () {
                var args = arguments;
                return mappingHint.reduce(function (ctx, hint, idx) {
                    ctx[hint] = args[idx];
                    return ctx;
                }, {});
            };
        } else {
            mapper = function (x) { return x; };
        }

        s = new Stream();
        ee.on(xs, function () {
            var ctx = mapper.apply(this, arguments);
            s.write(ctx);
        });
    }
    else {
        throw new Error(
            'Unexpected argument type to Stream constructor: ' + (typeof xs)
        );
    }

    return s;//new Stream(xs, ee, mappingHint);
};

var _ = exports;


// Save bytes in the minified (but not gzipped) version:
var ArrayProto = Array.prototype,
    ObjProto = Object.prototype;

// Create quick reference variables for speed access to core prototypes.
var slice = ArrayProto.slice,
    toString = ObjProto.toString;


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
    return toString.call(x) === '[object Array]';
};

// setImmediate implementation with browser and older node fallbacks
if (typeof setImmediate === 'undefined') {
    if (typeof process === 'undefined' || !(process.nextTick)) {
        _.setImmediate = function (fn) {
            setTimeout(fn, 0);
        };
    }
    else {
        // use nextTick on old node versions
        _.setImmediate = process.nextTick;
    }
}
// check no process.stdout to detect browserify
else if (typeof process === 'undefined' || !(process.stdout)) {
    // modern browser - but not a direct alias for IE10 compatibility
    _.setImmediate = function (fn) {
        setImmediate(fn);
    };
}
else {
    _.setImmediate = setImmediate;
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
var _global = this;
if (typeof global !== 'undefined') {
    _global = global;
}
else if (typeof window !== 'undefined') {
    _global = window;
}
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
 * @name curry(fn, [*arguments])
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
 * @name ncurry(n, fn, [args...])
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
    return function () {
        var args = largs.concat(slice.call(arguments));
        if (args.length < n) {
            return _.ncurry.apply(this, [n, fn].concat(args));
        }
        return fn.apply(this, args.slice(0, n));
    };
};

/**
 * Partially applies the function (regardless of whether it has had curry
 * called on it). This will always postpone execution until at least the next
 * call of the partially applied function.
 *
 * @id partial
 * @name partial(fn, args...)
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
 * @name flip(fn, [x, y])
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
 * @name compose(fn1, fn2, ...)
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
 * The reversed version of compose. Where arguments are in the order of
 * application.
 *
 * @id seq
 * @name seq(fn1, fn2, ...)
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
            return;
        }
        var r = fns[0].apply(this, arguments);
        for (var i = 1; i < fns.length; i++) {
            r = fns[i].call(this, r);
        }
        return r;
    };
};

function newPullFunction(xs) {
    return function pull(cb) {
        xs.pull(cb);
    };
}

function newDelegateGenerator(pull) {
    return function delegateGenerator(push, next) {
        pull(function (err, x) {
            push(err, x);
            if (x !== nil) {
                next();
            }
        });
    };
}

/**
 * Actual Stream constructor wrapped the the main exported function
 */

function Stream(generator) {///*optional*/xs, /*optional*/ee, /*optional*/mappingHint) {
    // if (xs && _.isStream(xs)) {
    //     // already a Stream
    //     return xs;
    // }

    EventEmitter.call(this);
    var self = this;

    // used to detect Highland Streams using isStream(x), this
    // will work even in cases where npm has installed multiple
    // versions, unlike an instanceof check
    self.__HighlandStream__ = true;

    self.id = ('' + Math.random()).substr(2, 6);

    self.paused = true;
    self._outgoing = new Queue();
    self._observers = [];
    self._destructors = [];
    self._send_events = false;

    self.ended = false;
    self._request = null;
    self._multiplexer = null;
    self._consumer = null;

    self._generator = generator;

    // These are defined here instead of on the prototype
    // because bind is super slow.
    self._push_fn = function (err, x) {
        self._writeOutgoing(err ? new StreamError(err) : x);
    };

    self._next_fn = function (xs) {
        // console.log(self.id, '_next', xs, self.paused);
        self._generator_running = false;
        if (xs) {
            xs = _(xs);
            var pull = newPullFunction(xs);
            self._generator = newDelegateGenerator(pull);
        }

        if (!self.paused) {
            self._runGenerator();
        }
    };

    self._generator_running = false;
    self._repeat_run_generator = true;

    // Old-style node Stream.pipe() checks for this
    self.writable = true;

    self.on('newListener', function (ev) {
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
    self.on('removeListener', function (ev) {
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

/**
 * adds a top-level _.foo(mystream) style export for Stream methods
 */

function exposeMethod(name) {
    var f = Stream.prototype[name];
    var n = f.length;
    _[name] = _.ncurry(n + 1, function () {
        var args = slice.call(arguments);
        var s = _(args.pop());
        return f.apply(s, args);
    });
}

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
 * @api public
 *
 * _.isStream('foo')  // => false
 * _.isStream(_([1,2,3]))  // => true
 */

_.isStream = function (x) {
    return _.isObject(x) && x.__HighlandStream__;
};

_._isStreamError = function (x) {
    return _.isObject(x) && x.__HighlandStreamError__;
};

_._isStreamRedirect = function (x) {
    return _.isObject(x) && x.__HighlandStreamRedirect__;
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
    }
    else {
        x = token;
    }

    if (x === nil) {
        this.ended = true;
        this._onEnd();
    }

    if (this._request) {
        // Allow pull to be called within the callback function.
        var cb = this._request;
        this._request = null;

        // If we have a request, then it was from a pull() and we need to
        // pause.
        this.paused = true;
        cb(err, x);
    }

    for (var j = 0, len = this._observers.length; j < len; j++) {
        this._observers[j].write(token);
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
};

/**
 * Called when the stream end.
 */
Stream.prototype._onEnd = function _onEnd() {
    this.pause();
};

/**
 * Pauses the stream. All Highland Streams start in the paused state.
 *
 * @id pause
 * @section Stream Objects
 * @name Stream.pause()
 * @api public
 *
 * var xs = _(generator);
 * xs.pause();
 */

Stream.prototype.pause = function () {
    //console.log(['pause', this.id]);
    this.paused = true;
};

/**
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
 * buffer or request more data from an upstream source.
 *
 * @id resume
 * @section Stream Objects
 * @name Stream.resume()
 * @api public
 *
 * var xs = _(generator);
 * xs.resume();
 */

Stream.prototype.resume = function () {
    // console.log(this.id, 'resume', this.paused);
    if (!this.paused ||
            (this._consumer && this._consumer.paused) ||
            (this._multiplexer && this._multiplexer.paused)) {
        return;
    }

    this.paused = false;

    // Emit all pending tokens in _outgoing.
    this._emitNext();

    if (this.paused) {
        return;
    }

    if (this._generator) {
        this._runGenerator();
    }
    else {
        // perhaps a node stream is being piped in
        this.emit('drain');
    }
};

/**
 * Ends a Stream. This is the same as sending a [nil](#nil) value as data.
 * You shouldn't need to call this directly, rather it will be called by
 * any [Node Readable Streams](http://nodejs.org/api/stream.html#stream_class_stream_readable)
 * you pipe in.
 *
 * @id end
 * @section Stream Objects
 * @name Stream.end()
 * @api public
 *
 * mystream.end();
 */

Stream.prototype.end = function () {
    this.write(nil);
};

/**
 * Pipes a Highland Stream to a [Node Writable Stream](http://nodejs.org/api/stream.html#stream_class_stream_writable)
 * (Highland Streams are also Node Writable Streams). This will pull all the
 * data from the source Highland Stream and write it to the destination,
 * automatically managing flow so that the destination is not overwhelmed
 * by a fast source.
 *
 * This function returns the destination so you can chain together pipe calls.
 *
 * @id pipe
 * @section Consumption
 * @name Stream.pipe(dest)
 * @param {Writable Stream} dest - the destination to write all data to
 * @api public
 *
 * var source = _(generator);
 * var dest = fs.createWriteStream('myfile.txt')
 * source.pipe(dest);
 *
 * // chained call
 * source.pipe(through).pipe(dest);
 */

Stream.prototype.pipe = function (dest) {
    var self = this;

    // stdout and stderr are special case writables that cannot be closed
    var canClose = dest !== process.stdout && dest !== process.stderr;

    var s = self.consume(function (err, x, push, next) {
        if (err) {
            self.emit('error', err);
            return;
        }
        if (x === nil) {
            if (canClose) {
                dest.end();
            }
        }
        else if (dest.write(x) !== false) {
            next();
        }
        else {
            s.pause();

            // We still call next() here to signal that we are ready for the
            // next token.
            next();
        }
    });

    dest.on('drain', onConsumerDrain);

    // Since we don't keep a reference to piped-to streams,
    // save a callback that will unbind the event handler.
    this._destructors.push(function () {
        dest.removeListener('drain', onConsumerDrain);
    });

    s.resume();
    return dest;

    function onConsumerDrain() {
        s.resume();
    }
};

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

Stream.prototype.destroy = function () {
    // var self = this;
    this.end();

    this._generator = null;
    this._request = null;
    this.ended = true;
    this._outgoing = new Queue();

    _(this._destructors).each(function (destructor) {
        destructor();
    });
};

Stream.prototype._writeOutgoing = function _writeOutgoing(token) {
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
    if (this._generator_running || !this._generator) {
        return;
    }

    if (this._in_run_generator) {
        this._repeat_run_generator = true;
        return;
    }

    this._in_run_generator = true;
    do {
        this._repeat_run_generator = false;
        this._generator_running = true;
        this._generator(this._push_fn, this._next_fn);
    } while (this._repeat_run_generator);
    this._in_run_generator = false;
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

Stream.prototype.consume = function (f) {
    var self = this;

    if (self._consumer) {
        throw new Error(
            'Stream already being consumed, you must either fork() or observe()'
        );
    }

    if (self._multiplexer) {
        throw new Error(
            'Stream has been forked. You must either fork() or observe().'
        );
    }

    self._consumer = new ConsumeStream(this, f);
    return self._consumer;
};
exposeMethod('consume');

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

Stream.prototype.pull = function (f) {
    // console.log(this.id, 'pull', this._outgoing.toArray(), this.paused);
    if (this._request) {
        f(new Error('Cannot service a second pull() request while one is in progress.'));
    }

    // Register the callback and send a message.
    // Don't need to pause. _send will do it for us.
    this._request = f;
    this.resume();
};

/**
 * Writes a value to the Stream. If the Stream is paused it will go into the
 * Stream's incoming buffer, otherwise it will be immediately processed and
 * sent to the Stream's consumers (if any). Returns false if the Stream is
 * paused, true otherwise. This lets Node's pipe method handle back-pressure.
 *
 * You shouldn't need to call this yourself, but it may be called by Node
 * functions which treat Highland Streams as a [Node Writable Stream](http://nodejs.org/api/stream.html#stream_class_stream_writable).
 *
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
 */

Stream.prototype.write = function (x) {
    // console.log(this.id, 'write', x, this.paused);
    this._writeOutgoing(x);
    return !this.paused;
};

/**
 * Forks a stream, allowing you to add additional consumers with shared
 * back-pressure. A stream forked to multiple consumers will only pull values
 * from it's source as fast as the slowest consumer can handle them.
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

Stream.prototype.fork = function () {
    if (this._requests) {
        throw new Error('Cannot fork a stream with an outstanding pull() request.');
    }

    if (this._consumer) {
        throw new Error('Cannot fork a stream that has already been consumed().');
    }

    if (!this._multiplexer) {
        this._multiplexer = new StreamMultiplexer(this);
    }

    return this._multiplexer.newStream();
};

/**
 * Observes a stream, allowing you to handle values as they are emitted, without
 * adding back-pressure or causing data to be pulled from the source. This can
 * be useful when you are performing two related queries on a stream where one
 * would block the other. Just be aware that a slow observer could fill up it's
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

Stream.prototype.observe = function () {
    var s = new Stream();
    s.id = 'observe:' + s.id;
    // s.source = this;
    this._observers.push(s);
    return s;
};

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

Stream.prototype.errors = function (f) {
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
};
exposeMethod('errors');

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

Stream.prototype.stopOnError = function (f) {
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
};
exposeMethod('stopOnError');

/**
 * Iterates over every value from the Stream, calling the iterator function
 * on each of them. This function causes a **thunk**.
 *
 * If an error from the Stream reaches the `each` call, it will emit an
 * error event (which will cause it to throw if unhandled).
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

Stream.prototype.each = function (f) {
    var self = this;
    return this.consume(function (err, x, push, next) {
        if (err) {
            self.emit('error', err);
        }
        else if (x !== nil) {
            f(x);
            next();
        }
    }).resume();
};
exposeMethod('each');

/**
 * Applies all values from a Stream as arguments to a function. This function causes a **thunk**.
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

Stream.prototype.apply = function (f) {
    return this.toArray(function (args) {
        f.apply(null, args);
    });
};
exposeMethod('apply');

/**
 * Collects all values from a Stream into an Array and calls a function with
 * once with the result. This function causes a **thunk**.
 *
 * If an error from the Stream reaches the `toArray` call, it will emit an
 * error event (which will cause it to throw if unhandled).
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

Stream.prototype.toArray = function (f) {
    var self = this;
    return this.collect().pull(function (err, x) {
        if (err) {
            self.emit('error', err);
        }
        else {
            f(x);
        }
    });
};

/**
 * Creates a new Stream of transformed values by applying a function to each
 * value from the source. The transformation function can be replaced with
 * a non-function value for convenience, and it will emit that value
 * for every data event on the source Stream.
 *
 * @id map
 * @section Transforms
 * @name Stream.map(f)
 * @param f - the transformation function or value to map to
 * @api public
 *
 * var doubled = _([1, 2, 3, 4]).map(function (x) {
 *     return x * 2;
 * });
 *
 * _([1, 2, 3]).map('hi')  // => 'hi', 'hi', 'hi'
 */

Stream.prototype.map = function (f) {
    if (!_.isFunction(f)) {
        var val = f;
        f = function () {
            return val;
        };
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
            } catch (e) {
                fnErr = e;
            }
            push(fnErr, fnVal);
            next();
        }
    });
};
exposeMethod('map');

/**
 * Creates a new Stream which applies a function to each value from the source
 * and re-emits the source value. Useful when you want to mutate the value or
 * perform side effects
 *
 * @id doto
 * @section Transforms
 * @name Stream.doto(f)
 * @param f - the function to apply
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

Stream.prototype.doto = function (f) {
    return this.map(function (x) {
        f(x);
        return x;
    });
};
exposeMethod('doto');

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

Stream.prototype.ratelimit = function (num, ms) {
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
};
exposeMethod('ratelimit');

/**
 * Creates a new Stream of values by applying each item in a Stream to an
 * iterator function which must return a (possibly empty) Stream. Each item on
 * these result Streams are then emitted on a single output Stream.
 *
 * @id flatMap
 * @section Higher-order Streams
 * @name Stream.flatMap(f)
 * @param {Function} f - the iterator function
 * @api public
 *
 * filenames.flatMap(readFile)
 */

Stream.prototype.flatMap = function (f) {
    return this.map(f).sequence();
};
exposeMethod('flatMap');

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

Stream.prototype.pluck = function (prop) {
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
};
exposeMethod('pluck');

/**
 * Creates a new Stream including only the values which pass a truth test.
 *
 * @id filter
 * @section Transforms
 * @name Stream.filter(f)
 * @param f - the truth test function
 * @api public
 *
 * var evens = _([1, 2, 3, 4]).filter(function (x) {
 *     return x % 2 === 0;
 * });
 */

Stream.prototype.filter = function (f) {
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
            } catch (e) {
                fnErr = e;
            }

            if (fnErr) {
                push(fnErr);
            } else if (fnVal) {
                push(null, x);
            }
            next();
        }
    });
};
exposeMethod('filter');

/**
 * Filters using a predicate which returns a Stream. If you need to check
 * against an asynchronous data source when filtering a Stream, this can
 * be convenient. The Stream returned from the filter function should have
 * a Boolean as it's first value (all other values on the Stream will be
 * disregarded).
 *
 * @id flatFilter
 * @section Higher-order Streams
 * @name Stream.flatFilter(f)
 * @param {Function} f - the truth test function which returns a Stream
 * @api public
 *
 * var checkExists = _.wrapCallback(fs.exists);
 * filenames.flatFilter(checkExists)
 */

Stream.prototype.flatFilter = function (f) {
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
};
exposeMethod('flatFilter');

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

Stream.prototype.reject = function (f) {
    return this.filter(_.compose(_.not, f));
};
exposeMethod('reject');

/**
 * A convenient form of [filter](#filter), which returns the first object from a
 * Stream that passes the provided truth test
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

Stream.prototype.find = function (f) {
    return this.filter(f).take(1);
};
exposeMethod('find');

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

Stream.prototype.findWhere = function (props) {
    return this.where(props).take(1);
};
exposeMethod('findWhere');


/**
 * A convenient form of [reduce](#reduce), which groups items based on a function or property name
 *
 * @id group
 * @section Transforms
 * @name Stream.group(f)
 * @param {Function|String} f - the function or property name on which to group,
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

Stream.prototype.group = function (f) {
    var lambda = _.isString(f) ? _.get(f) : f;
    return this.reduce({}, function (m, o) {
        var key = lambda(o);
        if (!m.hasOwnProperty(key)) { m[key] = []; }
        m[key].push(o);
        return m;
    }.bind(this));
};
exposeMethod('group');

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

Stream.prototype.compact = function () {
    return this.filter(function (x) {
        return x;
    });
};
exposeMethod('compact');

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

Stream.prototype.where = function (props) {
    return this.filter(function (x) {
        for (var k in props) {
            if (x[k] !== props[k]) {
                return false;
            }
        }
        return true;
    });
};
exposeMethod('where');

/**
 * A way to keep only unique objects from a Stream
 * The definition of 'unicity' is given by a Function argument.
 *
 * Note:
 *   - memory: in order to guarantee that each unique item is chosen only once, we need to keep an
 *     internal buffer of all unique values. This may outgrow the available memory if you are not
 *     cautious about the size of your stream and the number of unique objects you may receive on that
 *     stream
 *   - errors: the transformation will emit an error for each comparison that throws an error
 *
 * @id uniqBy
 * @section Transforms
 * @name Stream.uniqBy(compare)
 * @param {Function} compare - custom equality predicate
 * @api public
 *
 * var colors = [ 'blue', 'red', 'red', 'yellow', 'blue', 'red' ]
 *
 * _(colors).uniqBy(function(a,b) { return a[1] === b[1] })
 * // => 'blue'
 * // => 'red'
 *
 */

Stream.prototype.uniqBy = function (compare) {
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
                } catch (e) {
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
};
exposeMethod('uniqBy');

/**
 * Takes all unique values in a stream.
 * It uses uniqBy internally, using the strict equality === operator to define unicity
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

Stream.prototype.uniq = function () {
    return this.uniqBy(function (a, b) {
        return a === b;
    });
};
exposeMethod('uniq');


/**
 * Takes two Streams and returns a Stream of corresponding pairs.
 *
 * @id zip
 * @section Higher-order Streams
 * @name Stream.zip(ys)
 * @param {Array | Stream} ys - the other stream to combine values with
 * @api public
 *
 * _(['a', 'b', 'c']).zip([1, 2, 3])  // => ['a', 1], ['b', 2], ['c', 3]
 */

Stream.prototype.zip = function (ys) {
    ys = _(ys);
    var xs = this;
    var returned = 0;
    var z = [];
    function nextValue(index, max, src, push, next) {
        src.pull(function (err, x) {
            if (err) {
                push(err);
                nextValue(index, max, src, push, next);
            }
            else if (x === _.nil) {
                push(null, nil);
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
    return _(function (push, next) {
        returned = 0;
        z = [];
        nextValue(0, 2, xs, push, next);
        nextValue(1, 2, ys, push, next);
    });
};
exposeMethod('zip');

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

Stream.prototype.batch = function (n) {
    var batched = [];

    return this.consume(function (err, x, push, next) {
        if (err) {
            push(err);
            next();
        } else if (x === nil) {
            if (batched.length > 0) {
                push(null, batched);
            }

            push(null, nil);
        } else {
            batched.push(x);

            if (batched.length === n) {
                push(null, batched);
                batched = [];
            }

            next();
        }
    });
};
exposeMethod('batch');

/**
 * Creates a new Stream with the separator interspersed between the elements of the source.
 *
 * intersperse is effectively the inverse of [splitBy](#splitBy).
 *
 * @id intersperse
 * @section Transforms
 * @name Stream.intersperse(sep)
 * @param sep - the value to intersperse between the source elements
 * @api public
 *
 * _(['ba', 'a', 'a']).intersperse('n')  // => ba, n, a, n, a
 * _(['mississippi']).splitBy('ss').intersperse('ss')  // => mi, ss, i, ss, ippi
 * _(['foo']).intersperse('bar')  // => foo
 */

Stream.prototype.intersperse = function (separator) {
    var started = false;
    return this.consume(function (err, x, push, next) {
        if (err) {
            push(err);
            next();
        } else if (x === nil) {
            push(null, nil);
        } else {
            if (started) {
                push(null, separator);
            } else {
                started = true;
            }
            push(null, x);
            next();
        }
    });
};
exposeMethod('intersperse');

/**
 * Splits the source Stream by a separator and emits the pieces in between, much like splitting a string.
 *
 * splitBy is effectively the inverse of [intersperse](#intersperse).
 *
 * @id splitBy
 * @section Transforms
 * @name Stream.splitBy(sep)
 * @param sep - the separator to split on
 * @api public
 *
 * _(['mis', 'si', 's', 'sippi']).splitBy('ss')  // => mi, i, ippi
 * _(['ba', 'a', 'a']).intersperse('n').splitBy('n')  // => ba, a, a
 * _(['foo']).splitBy('bar')  // => foo
 */

Stream.prototype.splitBy = function (sep) {
    var decoder = new Decoder();
    var buffer = '';

    function drain(x, push) {
        buffer = buffer + decoder.write(x);
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
        } else if (x === nil) {
            drain(decoder.end(), push);
            if (buffer) push(null, buffer);
            push(null, nil);
        } else {
            drain(x, push);
            next();
        }
    });
};
exposeMethod('splitBy');

/**
 * [splitBy](#splitBy) over newlines.
 *
 * @id split
 * @section Transforms
 * @name Stream.split()
 * @api public
 *
 * _(['a\n', 'b\nc\n', 'd', '\ne']).split()  // => a, b, c, d, e
 * _(['a\r\nb\nc']]).split()  // => a, b, c
 */

Stream.prototype.split = function () {
    return this.splitBy(/\r?\n/);
};
exposeMethod('split');

/**
 * Creates a new Stream with the first `n` values from the source.
 *
 * @id take
 * @section Transforms
 * @name Stream.take(n)
 * @param {Number} n - integer representing number of values to read from source
 * @api public
 *
 * _([1, 2, 3, 4]).take(2) // => 1, 2
 */

Stream.prototype.take = function (n) {
    if (n === 0) {
        return _([]);
    }
    var s = this.consume(function (err, x, push, next) {
        //console.log(['take', err, x, n]);
        if (err) {
            push(err);
            if (n > 0) {
                next();
            }
            else {
                push(null, nil);
            }
        }
        else if (x === nil) {
            push(null, nil);
        }
        else {
            n--;
            push(null, x);
            if (n > 0) {
                next();
            }
            else {
                push(null, nil);
            }
        }
    });
    s.id = 'take:' + s.id;
    return s;
};
exposeMethod('take');

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

Stream.prototype.head = function () {
    return this.take(1);
};
exposeMethod('head');

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

Stream.prototype.last = function () {
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
};
exposeMethod('last');

/**
 * Passes the current Stream to a function, returning the result. Can also
 * be used to pipe the current Stream through another Stream. It will always
 * return a Highland Stream (instead of the piped to target directly as in
 * Node.js).
 *
 * @id through
 * @section Higher-order Streams
 * @name Stream.through(target)
 * @api public
 *
 * function oddDoubler(s) {
 *     return s.filter(function (x) {
 *         return x % 2; // odd numbers only
 *     })
 *     .map(function (x) {
 *         return x * 2;
 *     });
 * }
 *
 * _([1, 2, 3, 4]).through(oddDoubler).toArray(function (xs) {
 *     // xs will be [2, 6]
 * });
 *
 * // Can also be used with Node Through Streams
 * _(filenames).through(jsonParser).map(function (obj) {
 *     // ...
 * });
 */

Stream.prototype.through = function (target) {
    if (_.isFunction(target)) {
        return target(this);
    }
    else {
        var output = _();
        target.pause();
        this.pipe(target).pipe(output);
        return output;
    }
};
exposeMethod('through');

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

_.pipeline = function (/*through...*/) {
    if (!arguments.length) {
        return _();
    }
    var start = arguments[0], rest;
    if (!_.isStream(start) && !_.isFunction(start.resume)) {
        // not a Highland stream or Node stream, start with empty stream
        start = _();
        rest = slice.call(arguments);
    }
    else {
        // got a stream as first argument, co-erce to Highland stream
        start = _(start);
        rest = slice.call(arguments, 1);
    }
    var end = rest.reduce(function (src, dest) {
        return src.through(dest);
    }, start);
    return new PipelineWrapperStream(start, end);
};

/**
 * Reads values from a Stream of Streams, emitting them on a single output
 * Stream. This can be thought of as a flatten, just one level deep. Often
 * used for resolving asynchronous actions such as a HTTP request or reading
 * a file.
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
 * filenames.map(readFile).sequence()
 */

Stream.prototype.sequence = function () {
    var original = this;
    var curr = this;
    return _(function (push, next) {
        curr.pull(function (err, x) {
            if (err) {
                push(err);
                return next();
            }
            else if (_.isArray(x)) {
                if (onOriginalStream()) {
                    // just send all values from array directly
                    x.forEach(function (y) {
                        push(null, y);
                    });
                } else {
                    push(null, x);
                }
                return next();
            }
            else if (_.isStream(x)) {
                if (onOriginalStream()) {
                    // switch to reading new stream
                    curr = x;
                    return next();
                }
                else {
                    // sequence only goes 1 level deep
                    push(null, x);
                    return next();
                }
            }
            else if (x === nil) {
                if (onOriginalStream()) {
                    push(null, nil);
                }
                else {
                    // resume reading from original
                    curr = original;
                    return next();
                }
            }
            else {
                if (onOriginalStream()) {
                    // we shouldn't be getting non-stream (or array)
                    // values from the top-level stream
                    push(new Error(
                        'Expected Stream, got ' + (typeof x)
                    ));
                    return next();
                }
                else {
                    push(null, x);
                    return next();
                }
            }
        });
    });

    function onOriginalStream() {
        return curr === original;
    }
};
exposeMethod('sequence');

/**
 * An alias for the [sequence](#sequence) method.
 *
 * @id series
 * @section Higher-order Streams
 * @name Stream.series()
 * @api public
 *
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

Stream.prototype.flatten = function () {
    var curr = this;
    var stack = [];
    return _(function (push, next) {
        curr.pull(function (err, x) {
            if (err) {
                push(err);
                return next();
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
};
exposeMethod('flatten');

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

Stream.prototype.parallel = function (n) {
    var source = this;
    var running = [];
    var ended = false;
    var reading_source = false;

    return _(function (push, next) {
        if (running.length && running[0].buffer.length) {
            // send buffered data
            var buf = running[0].buffer;
            for (var i = 0; i < buf.length; i++) {
                if (buf[i][1] === nil) {
                    // this stream has ended
                    running.shift();
                    return next();
                }
                else {
                    // send the buffered output
                    push.apply(null, buf[i]);
                }
            }
            // still waiting for more data before we can shift
            // the running array...
        }
        else if (running.length < n && !ended && !reading_source) {
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
                else {
                    // got a new source, add it to the running array
                    var run = {stream: x, buffer: []};
                    running.push(run);
                    x.consume(function (err, y, _push, _next) {
                        if (running[0] === run) {
                            // current output stream
                            if (y === nil) {
                                // remove self from running and check
                                // to see if we need to read from source again
                                running.shift();
                                next();
                            }
                            else {
                                // push directly onto parallel output stream
                                push(err, y);
                            }
                        }
                        else {
                            // we're reading ahead, buffer the output
                            run.buffer.push([err, y]);
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
        else {
            // wait for more data to arrive from running streams
        }
    });
};
exposeMethod('parallel');

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

Stream.prototype.otherwise = function (ys) {
    var xs = this;
    return xs.consume(function (err, x, push, next) {
        if (err) {
            // got an error, just keep going
            push(err);
            next();
        } else if (x === nil) {
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
};
exposeMethod('otherwise');

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

Stream.prototype.append = function (y) {
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
};
exposeMethod('append');

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
 * @name Stream.reduce(memo, iterator)
 * @param memo - the initial state of the reduction
 * @param {Function} iterator - the function which reduces the values
 * @api public
 *
 * var add = function (a, b) {
 *     return a + b;
 * };
 *
 * _([1, 2, 3, 4]).reduce(0, add)  // => 10
 */

Stream.prototype.reduce = function (z, f) {
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
            } catch (e) {
                push(e);
                push(null, _.nil);
                return;
            }

            next();
        }
    });
};
exposeMethod('reduce');

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

Stream.prototype.reduce1 = function (f) {
    var self = this;
    return _(function (push, next) {
        self.pull(function (err, x) {
            if (err) {
                push(err);
                next();
            } else if (x === nil) {
                push(null, nil);
            }
            else {
                next(self.reduce(x, f));
            }
        });
    });
};
exposeMethod('reduce1');

/**
 * Groups all values into an Array and passes down the stream as a single
 * data event. This is a bit like doing [toArray](#toArray), but instead
 * of accepting a callback and causing a *thunk*, it passes the value on.
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

Stream.prototype.collect = function () {
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
};
exposeMethod('collect');

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
 * @name Stream.scan(memo, iterator)
 * @param memo - the initial state of the reduction
 * @param {Function} iterator - the function which reduces the values
 * @api public
 *
 * _([1, 2, 3, 4]).scan(0, add)  // => 0, 1, 3, 6, 10
 */

Stream.prototype.scan = function (z, f) {
    var self = this;
    return _([z]).concat(
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
                } catch (e) {
                    push(e);
                    push(null, _.nil);
                    return;
                }

                push(null, z);
                next();
            }
        })
    );
};
exposeMethod('scan');

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

Stream.prototype.scan1 = function (f) {
    var self = this;
    return _(function (push, next) {
        self.pull(function (err, x) {
            if (err) {
                push(err);
                next();
            } else if (x === nil) {
                push(null, nil);
            }
            else {
                next(self.scan(x, f));
            }
        });
    });
};
exposeMethod('scan1');

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

Stream.prototype.concat = function (ys) {
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
};
exposeMethod('concat');

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
 * var txt = _(['foo.txt', 'bar.txt']).map(readFile)
 * var md = _(['baz.md']).map(readFile)
 *
 * _([txt, md]).merge();
 * // => contents of foo.txt, bar.txt and baz.txt in the order they were read
 */

Stream.prototype.merge = function () {
    var self = this;
    var srcs;

    var srcsNeedPull = [],
        async = false;

    return _(function (push, next) {
        if (!srcs) {
            self.errors(push).toArray(function (xs) {
                srcs = xs;
                if (srcs.length) {
                    srcsNeedPull = srcs;
                    pullFromAllSources(push, next);
                }
                else {
                    push(null, nil);
                }
            });
        }
        else if (srcs.length === 0) {
            push(null, nil);
        }
        else if (srcsNeedPull.length) {
            pullFromAllSources(push, next);
        }
        else {
            async = true;
        }
    });

    function pullFromAllSources(push, next) {
        var _srcs = srcsNeedPull;
        srcsNeedPull = [];
        _srcs.forEach(function (src) {
            src.pull(function (err, x) {
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
                    push(null, x);
                    srcsNeedPull.push(src);
                }

                if (async) {
                    async = false;
                    next();
                }
            });
        });
        next();
    }
};
exposeMethod('merge');

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
 * _(['foo', 'bar']).invoke('toUpperCase', [])  // => FOO, BAR
 *
 * filenames.map(readFile).sequence().invoke('toString', ['utf8']);
 */

Stream.prototype.invoke = function (method, args) {
    return this.map(function (x) {
        return x[method].apply(x, args);
    });
};
exposeMethod('invoke');

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

Stream.prototype.throttle = function (ms) {
    var last = 0 - ms;
    return this.consume(function (err, x, push, next) {
        var now = new Date().getTime();
        if (err) {
            push(err);
            next();
        } else if (x === nil) {
            push(null, nil);
        } else if (now - ms >= last) {
            last = now;
            push(null, x);
            next();
        } else {
            next();
        }
    });
};
exposeMethod('throttle');

/**
 * Holds off pushing data events downstream until there has been no more
 * data for `ms` milliseconds. Sends the last value that occurred before
 * the delay, discarding all other values.
 *
 * @id debounce
 * @section Transforms
 * @name Stream.debounce(ms)
 * @param {Number} ms - the milliseconds to wait before sending data
 * @api public
 *
 * // sends last keyup event after user has stopped typing for 1 second
 * $('keyup', textbox).debounce(1000);
 */

Stream.prototype.debounce = function (ms) {
    var t = null;
    var nothing = {};
    var last = nothing;
   
    return this.consume(function (err, x, push, next) {
        if (err) {
            // let errors through regardless
            push(err);
            next();
        } else if (x === nil) {
            if (t) {
                clearTimeout(t);
            }
            if (last !== nothing) {
                push(null, last);
            }
            push(null, nil);
        } else {
            last = x;
            if (t) {
                clearTimeout(t);
            }
            t = setTimeout(push.bind(this, null, x), ms);
            next();
        }
    });
};
exposeMethod('debounce');

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

Stream.prototype.latest = function () {
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
        } else if (x === nil) {
            ended = true;
        } else {
            latest = x;
            next();
        }
    }).resume();

    return _(function (push, next) {
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
};
exposeMethod('latest');

function ConsumeStream(source, f) {
    var self = this;

    ConsumeStream.super_.call(self, function () {
        source.pull(pullCb);
    });

    self.id = 'consume:' + self.id;
    self.source = source;

    function pullCb(err, x) {
        f(err, x, self._push_fn, self._next_fn);
    };
}

inherits(ConsumeStream, Stream);

ConsumeStream.prototype._onEnd = function _onEnd() {
    ConsumeStream.super_.prototype._onEnd.call(this);

    // Remove exclusive lock on the source stream.
    this.source._consumer = null;
};

function ForkedStream(multiplexer, id) {
    var self = this;

    var pull = multiplexer.pull.bind(multiplexer, id);
    ForkedStream.super_.call(self, newDelegateGenerator(pull));

    self.id = 'fork:' + self.id;
    self._multiplexer_id = id;
    self._source_multiplexer = multiplexer;
}

inherits(ForkedStream, Stream);

ForkedStream.prototype._onEnd = function _onEnd() {
    ForkedStream.super_.prototype._onEnd.call(this);
    this._source_multiplexer.removeConsumer(this._multiplexer_id);
};

function PipelineWrapperStream(start, end) {
    var self = this;
    PipelineWrapperStream.super_.call(self, function (push, next) {
        end.pull(function (err, x) {
            if (err) {
                push(err);
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

    self._start = start;
}

inherits(PipelineWrapperStream, Stream);

PipelineWrapperStream.prototype.write = function write(token) {
    this._start.write(token);
};

function StreamMultiplexer(stream) {
    this._stream = stream;

    this._consumers = {};
    this._nonce = 0;
    this._emitting = false;
    this._repeatEmit = false;
    this._numConsumers = 0;
    this._requests = 0;
    this.paused = true;
}


/**
 * Emit if we've met the backpressure requirements.
 */
StreamMultiplexer.prototype._emit = function resume() {
    var self = this;

    if (this._emitting) {
        this._repeatEmit = true;
        return;
    }
    this._emitting = true;
    do {
        // use a repeat flag to avoid recursing pull() calls
        this._repeatEmit = false;

        if (this._requests === this._numConsumers) {
            this.paused = false;

            // Save all of the current callbacks. This is important because
            // calling them may cause pull to be called again.
            var callbacks = [];
            for (var key in this._consumers) {
                callbacks.push(this._consumers[key]);
                this._consumers[key] = null;
                this._requests--;
            }

            this._stream.pull(function (err, x) {
                callbacks.forEach(function (cb) {
                    cb(err, x);
                });
                self.paused = true;
            });
        }
    } while (this._repeatEmit);
    this._emitting = false;
};

StreamMultiplexer.prototype.pull = function pull(id, cb) {
    if (!cb) {
        return;
    }

    if (this._consumers[id]) {
        cb(new Error('Cannot service a second pull() request while one is in progress.'));
        return;
    }

    this._consumers[id] = cb;
    this._requests++;

    this._emit();
};

StreamMultiplexer.prototype.newStream = function newStream() {
    var id = this._nonce++;

    this._consumers[id] = null;
    this._numConsumers++;

    return new ForkedStream(this, id);
};

StreamMultiplexer.prototype.removeConsumer = function removeConsumer(id) {
    if (this._consumers[id] === undefined) {
        return;
    }

    if (this._consumers[id]) {
        this._requests--;
    }

    delete this._consumers[id];
    this._numConsumers--;

    this._emit();
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

_.keys = function (obj) {
    var keys = [];
    for (var k in obj) {
        if (obj.hasOwnProperty(k)) {
            keys.push(k);
        }
    }
    return _(keys);
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
        if (extensions.hasOwnProperty(k)) {
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
 * returns a Highland Stream instead. Only the first argument to the
 * callback (or an error) will be pushed onto the Stream.
 *
 * @id wrapCallback
 * @section Utils
 * @name _.wrapCallback(f)
 * @param {Function} f - the node-style function to wrap
 * @api public
 *
 * var fs = require('fs');
 *
 * var readFile = _.wrapCallback(fs.readFile);
 *
 * readFile('example.txt').apply(function (data) {
 *     // data is now the contents of example.txt
 * });
 */

_.wrapCallback = function (f) {
    return function () {
        var args = slice.call(arguments);
        return _(function (push) {
            var cb = function (err, x) {
                if (err) {
                    push(err);
                }
                else {
                    push(null, x);
                }
                push(null, nil);
            };
            f.apply(null, args.concat([cb]));
        });
    };
};

/**
 * Add two values. Can be partially applied.
 *
 * @id add
 * @section Operators
 * @name _.add(a, b)
 * @api public
 *
 * add(1, 2) === 3
 * add(1)(5) === 6
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
