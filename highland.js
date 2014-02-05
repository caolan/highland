/**
 * Highland: the high-level streams library
 *
 * Highland may be freely distributed under the Apache 2.0 license.
 * http://github.com/caolan/highland
 * Copyright (c) Caolan McMahon
 *
 *
 * Also bundled in this file:
 *
 * Inherits
 * The ISC License
 * https://github.com/isaacs/inherits/blob/master/LICENSE
 * Copyright (c) Isaac Z. Schlueter
 *
 * Events
 * MIT License
 * https://github.com/Gozala/events
 * Copyright Joyent, Inc. and other Node contributors.
 */


/* global define: false */

// this is because we've set jshint to ignore the section which defines them
/* global EventEmitter: false */
/* global inherits: false */

/**
 * Universal module definition, supports CommonJS (Node.js),
 * AMD (RequireJS) and browser globals
 */

(function (root, factory) {

    if (typeof exports === 'object') {
        factory(module, exports); // Commonjs
    }
    else if (typeof define === 'function' && define.amd) {
        define(['module', 'exports'], factory); // AMD
    }
    else {
        var mod = {exports: {}};
        factory(mod, mod.exports); // Browser globals
        root._ = root.Highland = mod.exports;
    }

}(this, function (module, exports) {

    'use strict';

    /************** Start of bundled dependencies **************/
    /* jshint ignore:start */

    /**
     * Browser-compatible version of the inherits function found
     * in Node.js - see http://github.com/isaacs/inherits
     */

    var inherits;

    if (typeof Object.create === 'function') {
        // implementation from standard node.js 'util' module
        inherits = function inherits(ctor, superCtor) {
            ctor.super_ = superCtor
            ctor.prototype = Object.create(superCtor.prototype, {
                constructor: {
                    value: ctor,
                    enumerable: false,
                    writable: true,
                    configurable: true
                }
            });
        };
    }
    else {
        // old school shim for old browsers
        inherits = function inherits(ctor, superCtor) {
            ctor.super_ = superCtor
            var TempCtor = function () {}
            TempCtor.prototype = superCtor.prototype
            ctor.prototype = new TempCtor()
            ctor.prototype.constructor = ctor
        }
    }


    /**
     * Node's EventEmitter ported for all engines
     * see: https://github.com/Gozala/events
     */

    function EventEmitter() {
      this._events = this._events || {};
      this._maxListeners = this._maxListeners || undefined;
    }

    // Backwards-compat with node 0.10.x
    EventEmitter.EventEmitter = EventEmitter;

    EventEmitter.prototype._events = undefined;
    EventEmitter.prototype._maxListeners = undefined;

    // By default EventEmitters will print a warning if more than 10 listeners are
    // added to it. This is a useful default which helps finding memory leaks.
    EventEmitter.defaultMaxListeners = 10;

    // Obviously not all Emitters should be limited to 10. This function allows
    // that to be increased. Set to zero for unlimited.
    EventEmitter.prototype.setMaxListeners = function(n) {
      if (!isNumber(n) || n < 0 || isNaN(n))
        throw TypeError('n must be a positive number');
      this._maxListeners = n;
      return this;
    };

    EventEmitter.prototype.emit = function(type) {
      var er, handler, len, args, i, listeners;

      if (!this._events)
        this._events = {};

      // If there is no 'error' event listener then throw.
      if (type === 'error') {
        if (!this._events.error ||
            (isObject(this._events.error) && !this._events.error.length)) {
          er = arguments[1];
          if (er instanceof Error) {
            throw er; // Unhandled 'error' event
          } else {
            throw TypeError('Uncaught, unspecified "error" event.');
          }
          return false;
        }
      }

      handler = this._events[type];

      if (isUndefined(handler))
        return false;

      if (isFunction(handler)) {
        switch (arguments.length) {
          // fast cases
          case 1:
            handler.call(this);
            break;
          case 2:
            handler.call(this, arguments[1]);
            break;
          case 3:
            handler.call(this, arguments[1], arguments[2]);
            break;
          // slower
          default:
            len = arguments.length;
            args = new Array(len - 1);
            for (i = 1; i < len; i++)
              args[i - 1] = arguments[i];
            handler.apply(this, args);
        }
      } else if (isObject(handler)) {
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];

        listeners = handler.slice();
        len = listeners.length;
        for (i = 0; i < len; i++)
          listeners[i].apply(this, args);
      }

      return true;
    };

    EventEmitter.prototype.addListener = function(type, listener) {
      var m;

      if (!isFunction(listener))
        throw TypeError('listener must be a function');

      if (!this._events)
        this._events = {};

      // To avoid recursion in the case that type === "newListener"! Before
      // adding it to the listeners, first emit "newListener".
      if (this._events.newListener)
        this.emit('newListener', type,
                  isFunction(listener.listener) ?
                  listener.listener : listener);

      if (!this._events[type])
        // Optimize the case of one listener. Don't need the extra array object.
        this._events[type] = listener;
      else if (isObject(this._events[type]))
        // If we've already got an array, just append.
        this._events[type].push(listener);
      else
        // Adding the second element, need to change to array.
        this._events[type] = [this._events[type], listener];

      // Check for listener leak
      if (isObject(this._events[type]) && !this._events[type].warned) {
        var m;
        if (!isUndefined(this._maxListeners)) {
          m = this._maxListeners;
        } else {
          m = EventEmitter.defaultMaxListeners;
        }

        if (m && m > 0 && this._events[type].length > m) {
          this._events[type].warned = true;
          console.error('(node) warning: possible EventEmitter memory ' +
                        'leak detected. %d listeners added. ' +
                        'Use emitter.setMaxListeners() to increase limit.',
                        this._events[type].length);
          console.trace();
        }
      }

      return this;
    };

    EventEmitter.prototype.on = EventEmitter.prototype.addListener;

    EventEmitter.prototype.once = function(type, listener) {
      if (!isFunction(listener))
        throw TypeError('listener must be a function');

      var fired = false;

      function g() {
        this.removeListener(type, g);

        if (!fired) {
          fired = true;
          listener.apply(this, arguments);
        }
      }

      g.listener = listener;
      this.on(type, g);

      return this;
    };

    // emits a 'removeListener' event iff the listener was removed
    EventEmitter.prototype.removeListener = function(type, listener) {
      var list, position, length, i;

      if (!isFunction(listener))
        throw TypeError('listener must be a function');

      if (!this._events || !this._events[type])
        return this;

      list = this._events[type];
      length = list.length;
      position = -1;

      if (list === listener ||
          (isFunction(list.listener) && list.listener === listener)) {
        delete this._events[type];
        if (this._events.removeListener)
          this.emit('removeListener', type, listener);

      } else if (isObject(list)) {
        for (i = length; i-- > 0;) {
          if (list[i] === listener ||
              (list[i].listener && list[i].listener === listener)) {
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (list.length === 1) {
          list.length = 0;
          delete this._events[type];
        } else {
          list.splice(position, 1);
        }

        if (this._events.removeListener)
          this.emit('removeListener', type, listener);
      }

      return this;
    };

    EventEmitter.prototype.removeAllListeners = function(type) {
      var key, listeners;

      if (!this._events)
        return this;

      // not listening for removeListener, no need to emit
      if (!this._events.removeListener) {
        if (arguments.length === 0)
          this._events = {};
        else if (this._events[type])
          delete this._events[type];
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        for (key in this._events) {
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = {};
        return this;
      }

      listeners = this._events[type];

      if (isFunction(listeners)) {
        this.removeListener(type, listeners);
      } else {
        // LIFO order
        while (listeners.length)
          this.removeListener(type, listeners[listeners.length - 1]);
      }
      delete this._events[type];

      return this;
    };

    EventEmitter.prototype.listeners = function(type) {
      var ret;
      if (!this._events || !this._events[type])
        ret = [];
      else if (isFunction(this._events[type]))
        ret = [this._events[type]];
      else
        ret = this._events[type].slice();
      return ret;
    };

    EventEmitter.listenerCount = function(emitter, type) {
      var ret;
      if (!emitter._events || !emitter._events[type])
        ret = 0;
      else if (isFunction(emitter._events[type]))
        ret = 1;
      else
        ret = emitter._events[type].length;
      return ret;
    };

    function isFunction(arg) {
      return typeof arg === 'function';
    }

    function isNumber(arg) {
      return typeof arg === 'number';
    }

    function isObject(arg) {
      return typeof arg === 'object' && arg !== null;
    }

    function isUndefined(arg) {
      return arg === void 0;
    }

    /* jshint ignore:end */
    /************** End of bundled dependencies **************/



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
     * @id _(source)
     * @section Streams
     * @name _(source)
     * @param {Array | Function | Readable Stream} source - (optional) source to take values from from
     * @api public
     *
     * // from an Array
     * _([1, 2, 3, 4]);
     *
     * // using a generator function
     * _(function (push, next) {
     *    push(null, 1);
     *    push(err);
     *    next();
     * });
     *
     * // a stream with no source, can pipe node streams through it etc.
     * var through = _();
     *
     * // wrapping a Node Readable Stream so you can easily manipulate it
     * _(readable).filter(hasSomething).pipe(writeable);
     */

    exports = module.exports = function (xs) {
        return new Stream(xs);
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
        }
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

    function Stream(xs) {
        EventEmitter.call(this);
        var self = this;

        self.id = ('' + Math.random()).substr(2, 6);

        if (xs === undefined) {
            this._incoming = [];
        }
        else if (Array.isArray(xs)) {
            self._incoming = xs.concat([nil]);
        }
        else if (typeof xs === 'function') {
            this._incoming = [];
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
            this._incoming = [];
            this._generator = function (push, next) {
                delete self._generator;
                xs.pipe(self);
            };
        }
        else {
            throw new Error(
                'Unexpected argument type to Stream(): ' + (typeof xs)
            );
        }

        this.paused = true;
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
        if (this._consumers.length) {
            for (var i = 0, len = this._consumers.length; i < len; i++) {
                var c = this._consumers[i];
                if (c.paused) {
                    if (err) {
                        c.write(new StreamError(err));
                    }
                    else {
                        c.write(x);
                    }
                }
                else {
                    c._send(err, x);
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
                this._send(x);
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
        var s = self.consume(function (err, x, push, next) {
            if (err) {
                self.emit('error', err);
                return;
            }
            if (x === nil) {
                dest.end();
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
            if (x === nil) {
                // ended, remove consumer from source
                self._removeConsumer(s);
            }
            _send.call(s, err, x);
        };
        var next_called;
        var next = function () {
            next_called = true;
            //self.resume();
        };
        s._send = function (err, x) {
            next_called = false;
            f(err, x, push, next);
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
                this._send(x);
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
     * value from the source.
     *
     * @id map
     * @section Streams
     * @name Stream.map(f)
     * @param {Function} f - the transformation function
     * @api public
     *
     * var doubled = _([1, 2, 3, 4]).map(function (x) {
     *     return x * 2;
     * });
     */

    Stream.prototype.map = function (f) {
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


}));
// End of Universal Module Definition
