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


/**
 * Browser-compatible version of the inherits function found
 * in Node.js - see http://github.com/isaacs/inherits
 */

if (typeof Object.create === 'function') {
    // implementation from standard node.js 'util' module
    function inherits(ctor, superCtor) {
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
    function inherits(ctor, superCtor) {
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
module.exports = EventEmitter;

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


var _ = exports = module.exports = function (xs) {
    return new Stream(xs);
};

var nil = _.nil = {};

function Stream(xs) {
    EventEmitter.call(this);
    var self = this;

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
            //console.log(['_generator push called', err, x, self]);
            self.write(err ? new StreamError(err): x);
        };
        this._generator_next = function (s) {
            //console.log([self.id, '_generator next called', s, self]);
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
    else {
        throw new Error(
            'Unexpected argument type to Stream(): ' + (typeof xs)
        );
    }

    // TODO: remove this
    this.id = ('' + Math.random()).substr(2, 6);

    this.paused = true;
    this.consumers = [];
    this.observers = [];
    this._send_events = false;

    self.on('newListener', function (ev, f) {
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
    self.on('removeListener', function (ev, f) {
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

// adds a top-level _.foo(mystream) style export for Stream methods
function exposeMethod(name) {
    var f = Stream.prototype[name];
    var n = f.length;
    _[name] = _.ncurry(n + 1, function () {
        var args = Array.prototype.slice.call(arguments);
        var s = _(args.pop());
        return f.apply(s, args);
    });
};

function StreamError(err) {
    this.error = err;
}

function StreamRedirect(to) {
    this.to = to;
}

Stream.prototype._send = function (err, x) {
    //console.log([this.id, '_send', err, x, this.consumers]);
    if (this.consumers.length) {
        for (var i = 0, len = this.consumers.length; i < len; i++) {
            var c = this.consumers[i];
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
    if (this.observers.length) {
        for (var i = 0, len = this.observers.length; i < len; i++) {
            this.observers[i].write(x);
        }
    }
    if (this._send_events) {
        if (x === nil) {
            //console.log(['emitting end event']);
            this.emit('end');
        }
        else {
            //console.log(['emitting data event', x]);
            this.emit('data', x);
        }
    }
};

Stream.prototype.pause = function () {
    //console.log([this.id, 'pause']);
    this.paused = true;
    if (this.source) {
        this.source._checkBackPressure();
    }
};

Stream.prototype._checkBackPressure = function () {
    //console.log(['_checkBackPressure', this]);
    if (!this.consumers.length) {
        //console.log('_checkBackPressure, no consumers, pausing: ' + this.id);
        return this.pause();
    }
    for (var i = 0, len = this.consumers.length; i < len; i++) {
        if (this.consumers[i].paused) {
            //console.log('_checkBackPressure, consumer paused, pausing: ' + this.id);
            return this.pause();
        }
    }
    return this.resume();
};

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

Stream.prototype.resume = function () {
    //console.log([this.id, 'resume']);
    if (this._resume_running) {
        // already processing _incoming buffer, ignore resume call
        this._repeat_resume = true;
        return;
    }
    this._resume_running = true;
    do {
        this._repeat_resume = false;
        this.paused = false;
        this._readFromBuffer();
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

Stream.prototype.end = function () {
    //console.log([this.id, 'end']);
    this.write(nil);
};

Stream.prototype.pipe = function (dest) {
    //console.log([this.id, 'pipe', dest]);
    var self = this;
    var s = self.consume(function (err, x, push, next) {
        //console.log(['pipe consumer', err, x]);
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
        //console.log(['dest drained']);
        s.resume();
    });
    s.resume();
    return dest;
};

Stream.prototype._runGenerator = function () {
    // if _generator already running, exit
    if (this._generator_running) {
        return;
    }
    this._generator_running = true;
    this._generator(this._generator_push, this._generator_next);
};

Stream.prototype._redirect = function (to) {
    //console.log([this.id, '_redirect', to.id]);
    //console.log(['copying consumers', this.consumers.length]);
    to.consumers = this.consumers.map(function (c) {
        c.source = to;
        return c;
    });
    // TODO: copy observers
    this.consumers = [];
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

Stream.prototype._addConsumer = function (s) {
    //console.log([this.id, '_addConsumer', s.id]);
    if (this.consumers.length) {
        throw new Error(
            'Stream already being consumed, you must either fork() or observe()'
        );
    }
    s.source = this;
    this.consumers.push(s);
    this._checkBackPressure();
};

Stream.prototype._removeConsumer = function (s) {
    //console.log([this.id, '_removeConsumer', s.id]);
    this.consumers = this.consumers.filter(function (c) {
        return c !== s;
    });
    if (s.source === this) {
        s.source = null;
    }
    this._checkBackPressure();
};

Stream.prototype.consume = function (name, f) {
    if (!f) {
        f = name;
        name = ('' + Math.random()).substr(2, 6);
    }
    var self = this;
    var s = new Stream();
    s.id = name;
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
        //console.log([s.id, 'consume next called', self.id, self, s]);
        next_called = true;
        //self.resume();
    };
    s._send = function (err, x) {
        next_called = false;
        f(err, x, push, next);
        if (!next_called) {
            //console.log(['!next_called, pausing: ' + s.id, f.toString(), 'source: ' + (s.source && s.source.id)]);
            s.pause();
        }
    };
    self._addConsumer(s);
    return s;
};

Stream.prototype.pull = function (f) {
    //console.log([this.id, 'pull', f]);
    //console.log('pull from: ' + this.id);
    var s = this.consume('pull', function (err, x, push, next) {
        //console.log(['pull consumer', err, x]);
        s.source._removeConsumer(s);
        f(err, x);
    });
    s.resume();
};

Stream.prototype.write = function (x) {
    //console.log([this.id, 'write', x]);
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

Stream.prototype.fork = function () {
    var s = new Stream();
    s.id = 'fork:' + s.id;
    s.source = this;
    this.consumers.push(s);
    this._checkBackPressure();
    return s;
};

Stream.prototype.observe = function () {
    var s = new Stream();
    s.id = 'observe:' + s.id;
    s.source = this;
    this.observers.push(s);
    return s;
};

Stream.prototype.each = function (f) {
    return this.consume(function (err, x, push, next) {
        if (err) {
            // TODO
            throw err;
        }
        else if (x !== nil) {
            f(x);
            next();
        }
    }).resume();
};

Stream.prototype.toArray = function (f) {
    var xs = [];
    return this.consume('toArray', function (err, x, push, next) {
        //console.log(['toArray consume', err, x]);
        if (err) {
            // TODO
            throw err;
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

Stream.prototype.map = function (f) {
    return this.consume('map', function (err, x, push, next) {
        if (err) {
            push(err);
            next();
        }
        else if (x === nil) {
            push(err, x)
        }
        else {
            push(null, f(x));
            next();
        }
    });
};

Stream.prototype.take = function (n) {
    if (n === 0) {
        return _([]);
    }
    return this.consume('take', function (err, x, push, next) {
        //console.log(['take consume', err, x]);
        n--;
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

Stream.prototype.sequence = function () {
    function _nextStream(rest, push, next) {
        rest.pull(function (err, y) {
            if (err) {
                push(err);
                next();
            }
            else if (y !== nil) {
                // move onto next stream
                next(_sequence(y, rest));
            }
            else {
                // no more streams to consume
                push(null, nil);
            }
        });
    }
    function _sequence(curr, rest) {
        return _(function (push, next) {
            if (Array.isArray(curr)) {
                curr.forEach(function (x) {
                    push(null, x);
                });
                _nextStream(rest, push, next);
            }
            else if (!(curr instanceof Stream)) {
                push(new Error('Expected Stream, got ' + (typeof curr)));
                _nextStream(rest, push, next);
            }
            else {
                curr.pull(function (err, x) {
                    if (err || x !== nil) {
                        push(err, x);
                        next();
                    }
                    else {
                        _nextStream(rest, push, next);
                    }
                });
            }
        });
    };
    var self = this;
    return _(function (push, next) {
        return _nextStream(self, push, next);
    });
};


// End of Universal Module Definition
}));
