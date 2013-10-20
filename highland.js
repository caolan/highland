var inherits = require('util').inherits,
    stream = require('stream');


// end of stream marker
var Nil = exports.Nil = {};


// collection of base methods inherited by all streams
function BaseStream() {}

BaseStream.prototype.map = function (f) {
    return new TransformStream(this, function (err, x) {
        if (err) {
            return [err, null];
        }
        else if (x === Nil) {
            return [null, Nil];
        }
        else {
            return [null, f(x)];
        }
    });
};

BaseStream.prototype.filter = function (f) {
    return new TransformStream(this, function (err, x) {
        if (err) {
            return [err, null];
        }
        else if (x === Nil) {
            return [null, Nil];
        }
        else if (f(x)) {
            return [null, x];
        }
    });
};

BaseStream.prototype.transform = function (f) {
    var that = this;
    return new GeneratorStream(function (push, next) {
        var async = false;
        var iter = true;
        var c = that.consume();
        function loop() {
            while (iter) {
                iter = false;
                async = false;
                c.resume();
                async = true;
            }
        }
        c.reader = function (err, x) {
            c.pause();
            f(err, x, push, function () {
                iter = true;
                if (async) {
                    loop();
                }
            });
        };
        loop();
    });
};

BaseStream.prototype.parallel = function () {
    var that = this;
    return new GeneratorStream(function (push, next) {
        that.toArray(function (streams) {
            var finished = 0;
            streams.forEach(function (s) {
                s.walk(function (err, x) {
                    if (x !== Nil) {
                        push(x);
                    }
                    else {
                        finished++;
                        if (finished === streams.length) {
                            push(Nil);
                        }
                    }
                });
            });
        });
    });
};

BaseStream.prototype.series = function () {
    return this.transform(function (err, s, push, next) {
        if (err) {
            push.error(err);
            next();
        }
        else if (s === Nil) {
            push(Nil);
        }
        else {
            s.walk(function (err, x) {
                if (err) {
                    push.error(err);
                }
                else if (x === Nil) {
                    next();
                }
                else {
                    push(x);
                }
            });
        }
    });
};


/**********
 * Thunks
 **********/

BaseStream.prototype.walk = function (f) {
    this.consume(f).resume();
};

BaseStream.prototype.each = function (f) {
    var c = this.walk(function (err, x) {
        if (err) {
            // too late to handle error
            throw err;
        }
        else if (x !== Nil) {
            f(x);
        }
    });
};

BaseStream.prototype.toArray = function (f) {
    var arr = [];
    var c = this.walk(function (err, x) {
        if (err) {
            // too late to handle error
            throw err;
        }
        if (x === Nil) {
            f(arr);
        }
        else {
            arr.push(x);
        }
    });
};

BaseStream.prototype.thunk = function (f) {
    var c = this.walk(function (err, x) {
        if (err) {
            // too late to handle error
            throw err;
        }
        else if (x === Nil) {
            f();
        }
    });
};




function ArrayStreamConsumer(src, f) {
    this.paused = true;
    this.source = src;
    this.reader = f;
    this.i = 0;
};

ArrayStreamConsumer.prototype.pause = function () {
    //console.log(['ArrayStreamConsumer.pause']);
    this.paused = true;
};

ArrayStreamConsumer.prototype.resume = function () {
    //console.log(['ArrayStreamConsumer.resume']);
    var buf = this.source._buffer;
    var len = buf.length;
    this.paused = false;

    while (!this.paused && this.i <= len) {
        if (this.i === len) {
            this.reader(null, Nil);
        }
        else {
            this.reader(null, buf[this.i]);
        }
        this.i++;
    }
};


function ArrayStream (xs) {
    this._buffer = xs;
};
inherits(ArrayStream, BaseStream);

ArrayStream.prototype.consume = function (f) {
    //console.log(['ArrayStream.consume', f]);
    return new ArrayStreamConsumer(this, f);
};


function TransformStreamConsumer(src, f) {
    var that = this;
    this.source = src;
    this.reader = f;
    this.consumer = src._parent.consume(function (err, x) {
        that.reader.apply(null, that.source._transform(err, x));
    });
};

TransformStreamConsumer.prototype.pause = function () {
    //console.log(['TransformStreamConsumer.pause']);
    this.consumer.pause();
};

TransformStreamConsumer.prototype.resume = function () {
    //console.log(['TransformStreamConsumer.resume']);
    this.consumer.resume();
};


function TransformStream(src, f) {
    this._parent = src;
    this._transform = f;
};
inherits(TransformStream, BaseStream);

TransformStream.prototype.consume = function (f) {
    //console.log(['TransformStream.consume', f]);
    return new TransformStreamConsumer(this, f);
};


function GeneratorStreamConsumer(src, f) {
    this.reader = f;
    this.source = src;
    this.paused = true;
}

GeneratorStreamConsumer.prototype.pause = function () {
    //console.log(['GeneratorStreamConsumer.pause']);
    this.paused = true;
};

GeneratorStreamConsumer.prototype.resume = function () {
    //console.log(['GeneratorStreamConsumer.resume']);
    this.paused = false;
    this.source._checkConsumers();
};


function GeneratorStream(f) {
    this._generator = f;
    this._buffer = [];
    this._consumers = [];
    this._generating = false;
};

inherits(GeneratorStream, BaseStream);

GeneratorStream.prototype.consume = function (f) {
    //console.log(['GeneratorStream.consume', f]);
    var c = new GeneratorStreamConsumer(this, f);
    this._consumers.push(c);
    return c;
};

GeneratorStream.prototype._consumersReady = function () {
    //console.log(['GeneratorStream._consumersReady']);
    var cs = this._consumers;
    var len = cs.length;
    if (!len) {
        return false;
    }
    for (var i = 0; i < len; i++) {
        if (cs[i].paused) {
            return false;
        }
    }
    return true;
};

GeneratorStream.prototype._push = function (x) {
    //console.log(['GeneratorStream._push', x]);
    this._buffer.push({value: x});
    this._checkConsumers();
};

GeneratorStream.prototype._pushError = function (e) {
    //console.log(['GeneratorStream._pushError', e]);
    this._buffer.push({error: e});
};

GeneratorStream.prototype._next = function (s) {
    //console.log(['GeneratorStream._next', s]);
    this._generating = false;
    this._nextStream = s;
    this._checkConsumers();
};

GeneratorStream.prototype._sendConsumers = function (x) {
    //console.log(['GeneratorStream._sendConsumers', x]);
    var cs = this._consumers;
    for (var i = 0, len = cs.length; i < len; i++) {
        cs[i].reader(x.error, x.value);
    }
};

GeneratorStream.prototype._redirectTo = function (s) {
    //console.log(['GeneratorStream._redirectTo', s]);
    var cs = this._consumers;
    for (var i = 0, len = cs.length; i < len; i++) {
        var c = cs[i];
        if (s instanceof GeneratorStream) {
            //console.log('redirecting to generator stream');
            c.source = s;
            s._consumers.push(c);
            s._checkConsumers();
        }
        else {
            var c2 = s.consume(c.reader);
            if (!c.paused) {
                c2.resume();
            }
        }
    }
    if (s instanceof GeneratorStream) {
        s._checkConsumers();
    }
    this._consumers = [];
};

GeneratorStream.prototype._checkConsumers = function () {
    //console.log(['GeneratorStream._checkConsumers']);
    if (this._looping) {
        return;
    }
    this._looping = true;
    var repeat = false;
    var buf = this._buffer;
    do {
        repeat = false;
        if (this._consumersReady()) {
            if (buf.length) {
                //console.log('sending buffered data');
                do {
                    this._sendConsumers(buf.shift());
                } while (this._consumersReady() && buf.length);
                if (this._consumersReady()) {
                    repeat = true;
                }
            }
            else if (this._nextStream) {
                //console.log('redirecting to new stream');
                this._redirectTo(this._nextStream);
                this._nextStream = null;
            }
            else if (!this._generating) {
                //console.log('calling generator');
                var next = this._next.bind(this);
                var push = this._push.bind(this);
                push.error = this._pushError.bind(this);
                this._generating = true;
                this._generator(push, next);
            }
            if (buf.length || this._nextStream) {
                repeat = true;
            }
        }
    } while (repeat);
    this._looping = false;
};




function NodeStreamConsumer(src, f) {
    this.source = src;
    this.reader = f;
    this.paused = true;
}

NodeStreamConsumer.prototype.pause = function () {
    //console.log(['NodeStreamConsumer.pause']);
    this.paused = true;
};

NodeStreamConsumer.prototype.resume = function () {
    //console.log(['NodeStreamConsumer.resume']);
    this.paused = false;
    this.source._checkConsumers();
};


function NodeStream(s) {
    var that = this;
    this._source = s;
    this._buffer = [];
    this._consumers = [];
    this._ended = false;
    s.on('readable', function () {
        //console.log('readable');
        that._buffer.push({value: s.read()});
        that._checkConsumers();
    });
    s.on('error', function (e) {
        //console.log('error');
        that._buffer.push({error: e});
        that._checkConsumers();
    });
    s.on('end', function () {
        //console.log('end');
        that._buffer.push({value: Nil});
        that._checkConsumers();
    });
}
inherits(NodeStream, BaseStream);

NodeStream.prototype.consume = function (f) {
    var c = new NodeStreamConsumer(this, f);
    this._consumers.push(c);
    return c;
};

NodeStream.prototype._consumersReady = function () {
    //console.log(['NodeStream._consumersReady']);
    var cs = this._consumers;
    var len = cs.length;
    if (!len) {
        return false;
    }
    for (var i = 0; i < len; i++) {
        if (cs[i].paused) {
            return false;
        }
    }
    return true;
};

NodeStream.prototype._sendConsumers = GeneratorStream.prototype._sendConsumers;

NodeStream.prototype._checkConsumers = function () {
    //console.log(['NodeStream._checkConsumers']);
    if (this._looping) {
        return;
    }
    this._looping = true;
    var repeat = false;
    var buf = this._buffer;
    do {
        repeat = false;
        if (this._consumersReady()) {
            if (buf.length) {
                //console.log('sending buffered data');
                do {
                    this._sendConsumers(buf.shift());
                } while (this._consumersReady() && buf.length);
                if (this._consumersReady()) {
                    repeat = true;
                }
            }
            else if (this._source.paused && !this._source.ended) {
                //console.log('resuming node stream');
                this._source.resume();
            }
            if (buf.length) {
                repeat = true;
            }
        }
        else {
            this._source.pause();
        }
    } while (repeat);
    this._looping = false;
};


exports.wrapCallback = function (fn) {
    return function () {
        var args = Array.prototype.slice.call(arguments);
        return Stream(function (push, next) {
            fn.apply(null, args.concat(function (err, x) {
                if (err) {
                    push.error(err);
                }
                else {
                    push(x);
                }
                next(Stream());
            }));
        });
    };
};



var Stream = exports.Stream = function (xs) {
    if (Array.isArray(xs)) {
        return new ArrayStream(xs);
    }
    else if (typeof xs === 'function') {
        return new GeneratorStream(xs);
    }
    else if (xs === undefined) {
        return new ArrayStream([]);
    }
    else if (xs instanceof stream.Stream) {
        return new NodeStream(xs);
    }
    else if (xs instanceof BaseStream) {
        return xs;
    }
    else {
        throw new Error('Unexpected argument type: ' + xs);
    }
};



var h = module.exports;


// Save bytes in the minified (but not gzipped) version:
var ArrayProto = Array.prototype,
    FuncProto = Function.prototype,
    ObjProto = Object.prototype;

// Create quick reference variables for speed access to core prototypes.
var slice = ArrayProto.slice,
    unshift = ArrayProto.unshift,
    toString = ObjProto.toString,
    hasOwnProperty = ObjProto.hasOwnProperty;


/**
* Transforms a function with specific arity (all arguments must be
* defined) in a way that it can be called as a chain of functions until
* the arguments list is saturated.
*
* This function is not itself curryable.
*
* @name curry f args... -> Function(...)
* @param {Function} f - the function to curry
* @param args.. - any number of arguments to pre-apply to the function
* @api public
*
* fn = curry(function (a, b, c) {
* return a + b + c;
* });
*
* fn(1)(2)(3) == fn(1, 2, 3)
* fn(1, 2)(3) == fn(1, 2, 3)
* fn(1)(2, 3) == fn(1, 2, 3)
*/

h.curry = function (fn /* args... */) {
    var args = slice.call(arguments);
    return h.ncurry.apply(this, [fn.length].concat(args));
};

/**
* Same as `curry` but with a specific number of arguments. This can be
* useful when functions do not explicitly define all its parameters.
*
* This function is not itself curryable.
*
* @name ncurry n fn args... -> Function(...)
* @param {Number} n - the number of arguments to wait for before apply fn
* @param {Function} fn - the function to curry
* @param args... - any number of arguments to pre-apply to the function
* @api public
*
* fn = ncurry(3, function () {
* return Array.prototype.join.call(arguments, '.');
* });
*
* fn(1, 2, 3) == '1.2.3';
* fn(1, 2)(3) == '1.2.3';
* fn(1)(2)(3) == '1.2.3';
*/

h.ncurry = function (n, fn /* args... */) {
    var largs = slice.call(arguments, 2);
    if (largs.length >= n) {
        return fn.apply(this, largs.slice(0, n));
    }
    return function () {
        var args = largs.concat(slice.call(arguments));
        if (args.length < n) {
            return h.ncurry.apply(this, [n, fn].concat(args));
        }
        return fn.apply(this, args.slice(0, n));
    }
};

/**
* Creates a composite function, which is the application of function 'a' to
* the results of function 'b'.
*
* @name compose a -> b -> Function(x)
* @param {Function} a - the function to apply to the result of b(x)
* @param {Function} b - the function to apply to x
* @api public
*
* var add1 = add(1);
* var mul3 = mul(3);
*
* var add1mul3 = compose(mul3, add1);
* add1mul3(2) == 9
*/

h.compose = h.curry(function (a, b) {
    return function () { return a(b.apply(null, arguments)); };
});



h.map = h.curry(function (f, xs) {
    return Stream(xs).map(f);
});
