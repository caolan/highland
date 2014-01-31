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
    var self = this;
    EventEmitter.call(self);
    if (xs === undefined) {
        this.incoming = [];
    }
    else if (Array.isArray(xs)) {
        self.incoming = xs.concat([nil]);
    }
    else if (typeof xs === 'function') {
        this.incoming = [];
        this.generator = xs;
        this.generator_push = function (err, x) {
            //console.log(['generator push called', err, x, self]);
            self.write(err ? new StreamError(err): x);
        };
        this.generator_next = function (s) {
            //console.log([self.id, 'generator next called', s, self]);
            if (s) {
                // we MUST pause to get the redirect object into the incoming buffer
                // otherwise it would be passed directly to send(), which does not
                // handle StreamRedirect objects!
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
    this.paused = true;
    this.consumers = [];

    // TODO: remove this
    this.id = ('' + Math.random()).substr(2, 6);

    self.send_events = false;
    self.on('newListener', function (ev, f) {
        if (ev === 'data') {
            self.send_events = true;
            setImmediate(self.resume.bind(self));
        }
        else if (ev === 'end') {
            self.send_events = true;
        }
    });
    self.on('removeListener', function (ev, f) {
        if (ev === 'end' || ev === 'data') {
            var end_listenrs = self.listeners('end').length;
            var data_listenrs = self.listeners('data').length;
            if (end_listeners + data_listeners === 0) {
                self.send_events = false;
            }
        }
    });
}
inherits(Stream, EventEmitter);

function StreamError(err) {
    this.error = err;
}

function StreamRedirect(to) {
    this.to = to;
}

Stream.prototype.send = function (err, x) {
    //console.log([this.id, 'send', err, x, this.consumers]);
    var cs = this.consumers;
    for (var i = 0, len = cs.length; i < len; i++) {
        var c = cs[i];
        if (c.paused) {
            if (err) {
                c.write(new StreamError(err));
            }
            else {
                c.write(x);
            }
        }
        else {
            c.send(err, x);
        }
    }
    if (this.send_events) {
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
        this.source.checkBackPressure();
    }
};

Stream.prototype.checkBackPressure = function () {
    //console.log(['checkBackPressure', this]);
    if (this.consumers.length) {
        for (var i = 0, len = this.consumers.length; i < len; i++) {
            if (this.consumers[i].paused) {
                //console.log('checkBackPressure, consumer paused, pausing: ' + this.id);
                return this.pause();
            }
        }
        return this.resume();
    }
    //console.log('checkBackPressure, no consumers, pausing: ' + this.id);
    return this.pause();
};

Stream.prototype.resume = function () {
    //console.log([this.id, 'resume']);
    if (this._resume_running) {
        // already processing incoming buffer, ignore resume call
        this._repeat_resume = true;
        return;
    }
    this._resume_running = true;
    do {
        this._repeat_resume = false;
        this.paused = false;

        // process buffered incoming data
        var len = this.incoming.length;
        var i = 0;
        //console.log(['i', i, 'len', len, this]);

        while (i < len && !this.paused) {
            //console.log(['sending buffered data', i]);
            var x = this.incoming[i];
            if (x instanceof StreamError) {
                this.send(x);
            }
            else if (x instanceof StreamRedirect) {
                this.redirect(x.to);
            }
            else {
                this.send(null, x);
            }
            i++;
        }

        // remove processed data from incoming buffer
        this.incoming.splice(0, i);

        if (!this.paused) {
            // ask parent for more data
            if (this.source) {
                this.source.resume();
            }
            // run generator to fill up incoming buffer
            else if (this.generator) {
                this.runGenerator();
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
    var s = self.through(function (err, x, push, next) {
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

Stream.prototype.runGenerator = function () {
    // if generator already running, exit
    if (this._generator_running) {
        return;
    }
    this._generator_running = true;
    this.generator(this.generator_push, this.generator_next);
};

Stream.prototype.redirect = function (to) {
    //console.log([this.id, 'redirect', to.id]);
    //console.log(['copying consumers', this.consumers.length]);
    to.consumers = this.consumers.map(function (c) {
        c.source = to;
        return c;
    });
    this.consumers = [];
    this.through = function () {
        return to.through.apply(to, arguments);
    };
    this.removeConsumer = function () {
        return to.removeConsumer.apply(to, arguments);
    };
    if (this.paused) {
        to.pause();
    }
    else {
        this.pause();
        to.checkBackPressure();
    }
};

Stream.prototype.addConsumer = function (s) {
    //console.log([this.id, 'addConsumer', s.id]);
    if (this.consumers.length) {
        throw new Error(
            'Stream already being consumed, you must either fork() or observe()'
        );
    }
    s.source = this;
    this.consumers.push(s);
    this.checkBackPressure();
};

Stream.prototype.removeConsumer = function (s) {
    //console.log([this.id, 'removeConsumer', s.id]);
    this.consumers = this.consumers.filter(function (c) {
        return c !== s;
    });
    if (s.source === this) {
        s.source = null;
    }
    this.checkBackPressure();
};

Stream.prototype.through = function (name, f) {
    if (!f) {
        f = name;
        name = ('' + Math.random()).substr(2, 6);
    }
    var self = this;
    var s = new Stream();
    s.id = name;
    var _send = s.send;
    var push = function (err, x) {
        if (x === nil) {
            // ended, remove consumer from source
            self.removeConsumer(s);
        }
        _send.call(s, err, x);
    };
    var next_called;
    var next = function () {
        //console.log([s.id, 'through next called', self.id, self, s]);
        next_called = true;
        //self.resume();
    };
    s.send = function (err, x) {
        next_called = false;
        f(err, x, push, next);
        if (!next_called) {
            //console.log(['!next_called, pausing: ' + s.id, f.toString(), 'source: ' + (s.source && s.source.id)]);
            s.pause();
        }
    };
    self.addConsumer(s);
    return s;
};

Stream.prototype.pull = function (f) {
    //console.log([this.id, 'pull', f]);
    //console.log('pull from: ' + this.id);
    var s = this.through('pull', function (err, x, push, next) {
        //console.log(['pull consumer', err, x]);
        s.source.removeConsumer(s);
        f(err, x);
    });
    s.resume();
};

Stream.prototype.write = function (x) {
    //console.log([this.id, 'write', x]);
    if (this.paused) {
        this.incoming.push(x);
    }
    else {
        if (x instanceof StreamError) {
            this.send(x);
        }
        else {
            this.send(null, x);
        }
    }
    return !this.paused;
};

Stream.prototype.each = function (f) {
    return this.through(function (err, x, push, next) {
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
    return this.through('toArray', function (err, x, push, next) {
        //console.log(['toArray through', err, x]);
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
    return this.through('map', function (err, x, push, next) {
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
    return this.through('take', function (err, x, push, next) {
        //console.log(['take through', err, x]);
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


// End of Universal Module Definition
}));
