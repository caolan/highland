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


function isFunction(arg) {
    return typeof arg === 'function';
}

function isObject(arg) {
    return typeof arg === 'object' && arg !== null;
}

function isString(value) {
    return typeof value === 'string';
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
 * `push(err, val)`, much like a standard Node.js callback. You call `next()`
 * to signal you've finished processing the current data. If the Stream is
 * still being consumed the generator function will then be called again.
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
 * **Promise -** Accepts an ES6 / jQuery style promise and returns a
 * Highland Stream which will emit a single value (or an error).
 *
 * @id _(source)
 * @section Streams
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
 * // from a Promise object
 * var foo = _($.getJSON('/api/foo'));
 */

exports = module.exports = function (/*optional*/xs, /*optional*/ee) {
    return new Stream(xs, ee);
};

var _ = exports;


// Save bytes in the minified (but not gzipped) version:
var ArrayProto = Array.prototype;

// Create quick reference variables for speed access to core prototypes.
var slice = ArrayProto.slice;

/**
 * The end of stream marker. This is sent along the data channel of a Stream
 * to tell consumers that the Stream has ended. See the following map code for
 * an example of detecting the end of a Stream:
 *
 * @id nil
 * @section Streams
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

var nil = _.nil = {};

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
 * @param {Function} f - function to flip argument application for
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

/**
 * Actual Stream constructor wrapped the the main exported function
 */

function Stream(/*optional*/xs, /*optional*/ee) {
    if (xs && xs instanceof Stream) {
        // already a Stream
        return xs;
    }

    EventEmitter.call(this);
    var self = this;

    self.id = ('' + Math.random()).substr(2, 6);
    this.paused = true;
    this._incoming = [];
    this._outgoing = [];
    this._consumers = [];
    this._observers = [];
    this._send_events = false;

    self.on('newListener', function (ev) {
        if (ev === 'data') {
            self._send_events = true;
            setImmediate(self.resume.bind(self));
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

    if (xs === undefined) {
        // nothing else to do
    }
    else if (Array.isArray(xs)) {
        self._incoming = xs.concat([nil]);
    }
    else if (typeof xs === 'function') {
        this._generator = xs;
        this._generator_push = function (err, x) {
            self.write(err ? new StreamError(err): x);
        };
        this._generator_next = function (s) {
            if (s) {
                // we MUST pause to get the redirect object into the _incoming
                // buffer otherwise it would be passed directly to _send(),
                // which does not handle StreamRedirect objects!
                var _paused = self.paused;
                if (!_paused) {
                    self.pause();
                }
                self.write(new StreamRedirect(s));
                if (!_paused) {
                    self.resume();
                }
            }
            else {
                self._generator_running = false;
            }
            if (!self.paused) {
                self.resume();
            }
        };
    }
    else if (isObject(xs)) {
        if (isFunction(xs.then)) {
            // probably a promise
            return _(function (push) {
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
            // assume it's a pipeable stream as a source
            this._generator = function () {
                delete self._generator;
                xs.pipe(self);
            };
        }
    }
    else if (typeof xs === 'string') {
        ee.on(xs, function (x) {
            self.write(x);
        });
    }
    else {
        throw new Error(
            'Unexpected argument type to Stream(): ' + (typeof xs)
        );
    }
}
inherits(Stream, EventEmitter);

/**
 * adds a top-level _.foo(mystream) style export for Stream methods
 */

function exposeMethod(name) {
    var f = Stream.prototype[name];
    var n = f.length;
    _[name] = _.ncurry(n + 1, function () {
        var args = Array.prototype.slice.call(arguments);
        var s = _(args.pop());
        return f.apply(s, args);
    });
}

/**
 * Used as an Error marker when writing to a Stream's incoming buffer
 */

function StreamError(err) {
    this.error = err;
}

/**
 * Used as a Redirect marker when writing to a Stream's incoming buffer
 */

function StreamRedirect(to) {
    this.to = to;
}

/**
 * Sends errors / data to consumers, observers and event handlers
 */

Stream.prototype._send = function (err, x) {
    if (x === nil) {
        this.ended = true;
    }
    if (this._consumers.length) {
        for (var i = 0, len = this._consumers.length; i < len; i++) {
            var c = this._consumers[i];
            if (err) {
                c.write(new StreamError(err));
            }
            else {
                c.write(x);
            }
        }
    }
    if (this._observers.length) {
        for (var j = 0, len2 = this._observers.length; j < len2; j++) {
            this._observers[j].write(x);
        }
    }
    if (this._send_events) {
        if (x === nil) {
            this.emit('end');
        }
        else {
            this.emit('data', x);
        }
    }
};

/**
 * Pauses the stream. All Highland Streams start in the paused state.
 *
 * @id pause
 * @section Streams
 * @name Stream.pause()
 * @api public
 *
 * var xs = _(generator);
 * xs.pause();
 */

Stream.prototype.pause = function () {
    //console.log([this.id, 'pause']);
    this.paused = true;
    if (this.source) {
        this.source._checkBackPressure();
    }
};

/**
 * When there is a change in downstream consumers, it will often ask
 * the parent Stream to re-check it's state and pause/resume accordingly.
 */

Stream.prototype._checkBackPressure = function () {
    if (!this._consumers.length) {
        return this.pause();
    }
    for (var i = 0, len = this._consumers.length; i < len; i++) {
        if (this._consumers[i].paused) {
            return this.pause();
        }
    }
    return this.resume();
};

/**
 * Starts pull values out of the incoming buffer and sending them downstream,
 * this will exit early if this causes a downstream consumer to pause.
 */

Stream.prototype._readFromBuffer = function () {
    var len = this._incoming.length;
    var i = 0;
    while (i < len && !this.paused) {
        var x = this._incoming[i];
        if (x instanceof StreamError) {
            this._send(x.error);
        }
        else if (x instanceof StreamRedirect) {
            this._redirect(x.to);
        }
        else {
            this._send(null, x);
        }
        i++;
    }
    // remove processed data from _incoming buffer
    this._incoming.splice(0, i);
};

/**
 * Starts pull values out of the incoming buffer and sending them downstream,
 * this will exit early if this causes a downstream consumer to pause.
 */

Stream.prototype._sendOutgoing = function () {
    var len = this._outgoing.length;
    var i = 0;
    while (i < len && !this.paused) {
        var x = this._outgoing[i];
        if (x instanceof StreamError) {
            Stream.prototype._send.call(this, x.error);
        }
        else if (x instanceof StreamRedirect) {
            this._redirect(x.to);
        }
        else {
            Stream.prototype._send.call(this, null, x);
        }
        i++;
    }
    // remove processed data from _outgoing buffer
    this._outgoing.splice(0, i);
};

/**
 * Resumes a paused Stream. This will either read from the Stream's incoming
 * buffer or request more data from an upstream source.
 *
 * @id resume
 * @section Streams
 * @name Stream.resume()
 * @api public
 *
 * var xs = _(generator);
 * xs.resume();
 */

Stream.prototype.resume = function () {
    //console.log([this.id, 'resume']);
    if (this._resume_running) {
        // already processing _incoming buffer, ignore resume call
        this._repeat_resume = true;
        return;
    }
    this._resume_running = true;
    do {
        // use a repeat flag to avoid recursing resume() calls
        this._repeat_resume = false;
        this.paused = false;

        // send values from outgoing buffer first
        this._sendOutgoing();

        // send values from incoming buffer before reading from source
        this._readFromBuffer();

        // we may have paused while reading from buffer
        if (!this.paused) {
            // ask parent for more data
            if (this.source) {
                this.source._checkBackPressure();
            }
            // run _generator to fill up _incoming buffer
            else if (this._generator) {
                this._runGenerator();
            }
            else {
                // perhaps a node stream is being piped in
                this.emit('drain');
            }
        }
    } while (this._repeat_resume);
    this._resume_running = false;
};

/**
 * Ends a Stream. This is the same as sending a [nil](#nil) value as data.
 * You shouldn't need to call this directly, rather it will be called by
 * any [Node Readable Streams](http://nodejs.org/api/stream.html#stream_class_stream_readable)
 * you pipe in.
 *
 * @id end
 * @section Streams
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
 * @section Streams
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
    });
    dest.on('drain', function () {
        s.resume();
    });
    s.resume();
    return dest;
};

/**
 * Runs the generator function for this Stream. If the generator is already
 * running (it has been called and not called next() yet) then this function
 * will do nothing.
 */

Stream.prototype._runGenerator = function () {
    // if _generator already running, exit
    if (this._generator_running) {
        return;
    }
    this._generator_running = true;
    this._generator(this._generator_push, this._generator_next);
};

/**
 * Performs the redirect from one Stream to another. In order for the
 * redirect to happen at the appropriate time, it is put on the incoming
 * buffer as a StreamRedirect object, and this function is called
 * once it is read from the buffer.
 */

Stream.prototype._redirect = function (to) {
    // coerce to Stream
    to = _(to);

    to._consumers = this._consumers.map(function (c) {
        c.source = to;
        return c;
    });
    // TODO: copy _observers
    this._consumers = [];
    this.consume = function () {
        return to.consume.apply(to, arguments);
    };
    this._removeConsumer = function () {
        return to._removeConsumer.apply(to, arguments);
    };
    if (this.paused) {
        to.pause();
    }
    else {
        this.pause();
        to._checkBackPressure();
    }
};

/**
 * Adds a new consumer Stream, which will accept data and provide backpressure
 * to this Stream. Adding more than one consumer will cause an exception to be
 * thrown as the backpressure strategy must be explicitly chosen by the
 * developer (through calling fork or observe).
 */

Stream.prototype._addConsumer = function (s) {
    if (this._consumers.length) {
        throw new Error(
            'Stream already being consumed, you must either fork() or observe()'
        );
    }
    s.source = this;
    this._consumers.push(s);
    this._checkBackPressure();
};

/**
 * Removes a consumer from this Stream.
 */

Stream.prototype._removeConsumer = function (s) {
    this._consumers = this._consumers.filter(function (c) {
        return c !== s;
    });
    if (s.source === this) {
        s.source = null;
    }
    this._checkBackPressure();
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
 * @section Streams
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
    var s = new Stream();
    var _send = s._send;
    var push = function (err, x) {
        //console.log(['push', err, x, s.paused]);
        if (x === nil) {
            // ended, remove consumer from source
            self._removeConsumer(s);
        }
        if (s.paused) {
            if (err) {
                s._outgoing.push(new StreamError(err));
            }
            else {
                s._outgoing.push(x);
            }
        }
        else {
            _send.call(s, err, x);
        }
    };
    var async;
    var next_called;
    var next = function (s2) {
        //console.log(['next', async]);
        if (s2) {
            // we MUST pause to get the redirect object into the _incoming
            // buffer otherwise it would be passed directly to _send(),
            // which does not handle StreamRedirect objects!
            var _paused = s.paused;
            if (!_paused) {
                s.pause();
            }
            s.write(new StreamRedirect(s2));
            if (!_paused) {
                s.resume();
            }
        }
        else if (async) {
            s.resume();
        }
        else {
            next_called = true;
        }
    };
    s._send = function (err, x) {
        async = false;
        next_called = false;
        f(err, x, push, next);
        async = true;
        if (!next_called) {
            s.pause();
        }
    };
    self._addConsumer(s);
    return s;
};

/**
 * Consumes a single item from the Stream. Unlike consume, this function will
 * not provide a new stream for you to push values onto, and it will unsubscribe
 * as soon as it has a single error, value or nil from the source.
 *
 * You probably won't need to use this directly, but it is used internally by
 * some functions in the Highland library.
 *
 * @id pull
 * @section Streams
 * @name Stream.pull(f)
 * @param {Function} f - the function to handle data
 * @api public
 *
 * xs.pull(function (err, x) {
 *     // do something
 * });
 */

Stream.prototype.pull = function (f) {
    var s = this.consume(function (err, x) {
        s.source._removeConsumer(s);
        f(err, x);
    });
    s.resume();
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
 * @section Streams
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
    if (this.paused) {
        this._incoming.push(x);
    }
    else {
        if (x instanceof StreamError) {
            this._send(x.error);
        }
        else {
            this._send(null, x);
        }
    }
    return !this.paused;
};

/**
 * Forks a stream, allowing you to add additional consumers with shared
 * back-pressure. A stream forked to multiple consumers will only pull values
 * from it's source as fast as the slowest consumer can handle them.
 *
 * @id fork
 * @section Streams
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
    var s = new Stream();
    s.id = 'fork:' + s.id;
    s.source = this;
    this._consumers.push(s);
    this._checkBackPressure();
    return s;
};

/**
 * Observes a stream, allowing you to handle values as they are emitted, without
 * adding back-pressure or causing data to be pulled from the source. This can
 * be useful when you are performing two related queries on a stream where one
 * would block the other. Just be aware that a slow observer could fill up it's
 * buffer and cause memory issues. Where possible, you should use [fork](#fork).
 *
 * @id observe
 * @section Streams
 * @name Stream.observe()
 * @api public
 *
 * var xs = _([1, 2, 3, 4]);
 * var ys = xs.fork();
 * var zs = xs.observe();
 *
 * // now both zs and ys will recieve data as fast as ys can handle it
 * ys.resume();
 */

Stream.prototype.observe = function () {
    var s = new Stream();
    s.id = 'observe:' + s.id;
    s.source = this;
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
 * @section Streams
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
 * @section Streams
 * @name Stream.stopOnError(f)
 * @param {Function} f - the function to handle an error
 * @api public
 *
 * brokenStream.stopOnError(function (err) {
 *     console.error('Something broke: ' + err);
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
 * @section Streams
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
 * Applies results from a Stream as arguments to a function
 *
 * @id apply
 * @section Streams
 * @name Stream.apply(f)
 * @param {Function} f - the function to apply arguments to
 * @api public
 *
 * _([1, 2, 3]).apply(function (a, b, c) {
 *     // a === 1
 *     // b === 2
 *     // c === 3
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
 * @section Streams
 * @name Stream.toArray(f)
 * @param {Function} f - the callback to provide the completed Array to
 * @api public
 *
 * _([1, 2, 3, 4]).each(function (x) {
 *     // will be called 4 times with x being 1, 2, 3 and 4
 * });
 */

// TODO: implement using collect()?
Stream.prototype.toArray = function (f) {
    var self = this;
    var xs = [];
    return this.consume(function (err, x, push, next) {
        if (err) {
            self.emit('error', err);
        }
        else if (x === nil) {
            f(xs);
        }
        else {
            xs.push(x);
            next();
        }
    }).resume();
};

/**
 * Creates a new Stream of transformed values by applying a function to each
 * value from the source. The transformation function can be replaced with
 * a non-function value for convenience, and it will emit that value
 * for every data event on the source Stream.
 *
 * @id map
 * @section Streams
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
    if (!isFunction(f)) {
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
            push(null, f(x));
            next();
        }
    });
};
exposeMethod('map');

/**
 * Creates a new Stream of values by applying each item in a Stream to an
 * iterator function which may return a Stream. Each item on these result
 * Streams are then emitted on a single output Stream.
 *
 * The same as calling `stream.map(f).flatten()`.
 *
 * @id flatMap
 * @section Streams
 * @name Stream.flatMap(f)
 * @param {Function} f - the iterator function
 * @api public
 *
 * filenames.flatMap(readFile)
 */

Stream.prototype.flatMap = function (f) {
    return this.map(f).flatten();
};
exposeMethod('flatMap');

/**
 * Creates a new Stream including only the values which pass a truth test.
 *
 * @id filter
 * @section Streams
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
            if (f(x)) {
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
 * @section Streams
 * @name Stream.flatFilter(f)
 * @param {Function} f - the truth test function which returns a Stream
 * @api public
 *
 * var checkExists = _.wrapCallback(fs.exists);
 * filenames.flatFilter(checkExists)
 */

Stream.prototype.flatFilter = function (f) {
    var xs = this.observe();
    var ys = this.flatMap(function (x) {
        return f(x).take(1);
    });
    return xs.zip(ys)
        .filter(function (pair) {
            return pair[1];
        })
        .map(function (pair) {
            return pair[0];
        });
};
exposeMethod('flatFilter');

/**
 * A convenient form of filter, which returns the first object from a
 * Stream that passes the provided truth test
 *
 * @id find
 * @section Streams
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
 * // => [{type: 'blogpost', title: 'foo'}]
 *
 * // example with partial application
 * var firstBlogpost = _.find(f);
 *
 * firstBlogpost(docs)
 * // => [{type: 'blogpost', title: 'foo'}]
 */

Stream.prototype.find = function (f) {
    return this.consume(function (err, x, push, next) {
        if (err) {
            push(err);
            next();
        }
        else if (x === nil) {
            push(err, x);
        }
        else {
            if (f(x)) {
                push(null, x);
                push(null, nil);
            }
            next();
        }
    }.bind(this));
};
exposeMethod('find');

/**
 * A convenient form of reduce, which groups items based on a function or property name
 *
 * @id group
 * @section Streams
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
    var lambda = isString(f) ? _.get(f) : f;
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
 * @section Streams
 * @name Stream.compact()
 * @api public
 *
 * var compacted = _([0, 1, false, 3, null, undefined, 6]).compact();
 * // => [1, 3, 6]
 */

Stream.prototype.compact = function () {
    return this.filter(function (x) {
        return x;
    });
};
exposeMethod('compact');

/**
 * A convenient form of filter, which returns all objects from a Stream
 * match a set of property values.
 *
 * @id where
 * @section Streams
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
 * Takes two Streams and returns a Stream of corresponding pairs.
 *
 * @id zip
 * @section Streams
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
                push(null, err);
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
 * Creates a new Stream with the first `n` values from the source.
 *
 * @id take
 * @section Streams
 * @name Stream.take(n)
 * @param {Number} n - integer representing number of values to read from source
 * @api public
 *
 * _([1, 2, 3, 4]).take(2) // => 1, 2
 */

// TODO: test that errors don't count in take 'n' calls
Stream.prototype.take = function (n) {
    if (n === 0) {
        return _([]);
    }
    return this.consume(function (err, x, push, next) {
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
};
exposeMethod('take');

/**
 * Reads values from a Stream of Streams, emitting them on a Single output
 * Stream. This can be thought of as a flatten, just one level deep. Often
 * used for resolving asynchronous actions such as a HTTP request or reading
 * a file.
 *
 * @id sequence
 * @section Streams
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
            else if (Array.isArray(x)) {
                // just send all values from array directly
                x.forEach(function (y) {
                    push(null, y);
                });
                return next();
            }
            else if (x instanceof Stream) {
                if (curr === original) {
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
                if (curr === original) {
                    push(null, nil);
                }
                else {
                    // resume reading from original
                    curr = original;
                    return next();
                }
            }
            else {
                if (curr === original) {
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
};
exposeMethod('sequence');

/**
 * An alias for the [sequence](#sequence) method.
 *
 * @id series
 * @section Streams
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
 * @section Streams
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
            if (Array.isArray(x)) {
                x = _(x);
            }
            if (x instanceof Stream) {
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
 * @section Streams
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
    var buffers = [];
    var running = 0;
    var self = this;
    var ondata = null;
    return _(function (push, next) {
        ondata = null;
        // make sure we're reading from 'n' streams
        var len = buffers.length;
        if (!self.ended && running < n) {
            var i = 0;
            self.take(n - running).each(function (x) {
                running++;
                var target = buffers[len + i] = [];
                i++;
                x.consume(function (err, x, _push, _next) {
                    if (x === nil) {
                        running--;
                        target.push([null, nil]);
                    }
                    else {
                        target.push([err, x]);
                        _next();
                    }
                    if (target === buffers[0] && ondata) {
                        ondata();
                    }
                }).resume();
            });
        }
        // check if we have buffered data we can send
        if (buffers.length) {
            if (buffers[0].length) {
                var args = buffers[0].shift();
                var err = args[0];
                var x = args[1];
                if (x === nil) {
                    // stream finished, move on to next one
                    buffers.shift();
                }
                else {
                    push(err, x);
                }
                next();
            }
            else {
                // waiting for more data from first stream
                ondata = function () {
                    ondata = null;
                    next();
                };
            }
        }
        else if (self.ended && running === 0) {
            // totally done
            push(null, nil);
            return;
        }
        else {
            // waiting for more streams to read
            ondata = function () {
                ondata = null;
                next();
            };
        }
    });
};
exposeMethod('parallel');

/**
 * Switches source to an alternate Stream if the current Stream is empty.
 *
 * @id otherwise
 * @section Streams
 * @name Stream.otherwise(ys)
 * @param {Stream} ys - alternate stream to use if this stream is empty
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
        }
        if (x === nil) {
            // hit the end without redirecting to xs, use alternative
            next(ys);
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
 * @section Streams
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
 * @id reduce
 * @section Streams
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

// TODO: convert this to this.scan(z, f).last()
Stream.prototype.reduce = function (z, f) {
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
            z = f(z, x);
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
 * @section Streams
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
            }
            if (x === nil) {
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
 * @section Streams
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
 * @id scan
 * @section Streams
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
                z = f(z, x);
                push(null, z);
                next();
            }
        })
    );
};
exposeMethod('scan');

/**
 * Concatenates a Stream to the end of this Stream.
 *
 * Be aware that in the top-level export, the args may be in the reverse
 * order to what you'd expect `_([a], [b]) => [b, a]`, as this follows the
 * convention of other top-level exported functions which do `x` to `y`.
 *
 * @id concat
 * @section Streams
 * @name Stream.concat(ys)
 * @params {Stream | Array} ys - the values to concatenate onto this Stream
 * @api public
 *
 * _([1, 2]).concat([3, 4])  // => 1, 2, 3, 4
 * _.concat([3, 4], [1, 2])  // => 1, 2, 3, 4
 */

Stream.prototype.concat = function (ys) {
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
 * Calls a named method on each object from the Stream - returning
 * a new stream with the result of those calls.
 *
 * @id invoke
 * @section Streams
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
 * @section Streams
 * @name Stream.throttle(ms)
 * @param {Number} ms - the minimum milliseconds between each value
 * @api public
 *
 * _('mousemove', document).throttle(1000);
 */

Stream.prototype.throttle = function (ms) {
    var s = new Stream();
    var last = 0;
    var _write = s.write;
    s.write = function (x) {
        var now = new Date().getTime();
        if (x instanceof StreamError || x === nil) {
            return _write.apply(this, arguments);
        }
        else if (now - ms >= last) {
            last = now;
            return _write.apply(this, arguments);
        }
    };
    this._addConsumer(s);
    return s;
};
exposeMethod('throttle');

/**
 * Holds off pushing data events downstream until there has been no more
 * data for `ms` milliseconds. Sends the last value that occurred before
 * the delay, discarding all other values.
 *
 * @id debounce
 * @section Streams
 * @name Stream.debounce(ms)
 * @param {Number} ms - the milliseconds to wait before sending data
 * @api public
 *
 * // sends last keyup event after user has stopped typing for 1 second
 * $('keyup', textbox).debounce(1000);
 */

Stream.prototype.debounce = function (ms) {
    var s = new Stream();
    var t = null;
    var nothing = {};
    var last = nothing;
    var _write = s.write;
    s.write = function (x) {
        if (x instanceof StreamError) {
            // let errors through regardless
            return _write.apply(this, arguments);
        }
        else if (x === nil) {
            if (t) {
                clearTimeout(t);
            }
            if (last !== nothing) {
                _write.call(s, last);
            }
            return _write.apply(this, arguments);
        }
        else {
            last = x;
            if (t) {
                clearTimeout(t);
            }
            t = setTimeout(function () {
                _write.call(s, last);
            }, ms);
            return !this.paused;
        }
    };
    this._addConsumer(s);
    return s;
};
exposeMethod('debounce');

/**
 * Creates a new Stream, which when read from, only returns the last
 * seen value from the source. The source stream does not experience
 * back-pressure. Useful if you're using a Stream to model a changing
 * property which you need to query periodically.
 *
 * @id latest
 * @section Streams
 * @name Stream.latest()
 * @api public
 *
 * // slowThing will always get the last known mouse position
 * // when it asks for more data from the mousePosition stream
 * mousePosition.latest().map(slowThing)
 */

Stream.prototype.latest = function () {
    var s = new Stream();
    var _write = s.write;
    s.pause = function () {
        this.paused = true;
        // do not force parent to checkBackpressure
    };
    s.write = function (x) {
        if (x instanceof StreamError) {
            // pass errors straight through
            _write.call(this, x);
        }
        else if (x === nil) {
            _write.call(this, x);
        }
        else {
            if (this.paused) {
                this._incoming = this._incoming.filter(function (x) {
                    // remove any existing values from buffer
                    return x instanceof StreamError || x === nil;
                });
                this._incoming.push(x);
            }
            else {
                _write.call(this, x);
            }
        }
        // never push back
        return true;
    };
    this._addConsumer(s);
    s.resume();
    return s;
};
exposeMethod('latest');

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
