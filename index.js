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


var _ = exports = module.exports = function (xs) {
    return new Stream(xs);
};

var nil = _.nil = {};

function Stream(xs) {
    if (xs === undefined) {
        this.incoming = [];
    }
    else if (Array.isArray(xs)) {
        this.incoming = xs;
    }
    else if (typeof xs === 'function') {
        this.incoming = [];
        this.generator = xs;
    }
    else {
        throw new Error(
            'Unexpected argument type to Stream(): ' + (typeof xs)
        );
    }
    this.paused = true;
    this.consumers = [];
    this.id = ('' + Math.random()).substr(2, 6);
}

function StreamError(err) {
    this.error = err;
}

function StreamRedirect(to) {
    this.to = to;
}

Stream.prototype.send = function (err, x) {
    //console.log(['send', err, x]);
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
};

Stream.prototype.pause = function () {
    console.log([this.id, 'pause']);
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
                return this.pause();
            }
        }
        return this.resume();
    }
    return this.pause();
};

Stream.prototype.resume = function () {
    console.log([this.id, 'resume']);
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
            // TODO: else send nil?
        }
    } while (this._repeat_resume);
    this._resume_running = false;
};

Stream.prototype.runGenerator = function () {
    // if generator already running, exit
    if (this._generator_running) {
        return;
    }
    var self = this;
    var push = function (err, x) {
        self.write(err ? new StreamError(err): x);
    };
    var next = function (s) {
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
        self._generator_running = false;
    };
    do {
        this._generator_running = true;
        this.generator(push, next);
    } while (!self._generator_running && !self.paused);
};

Stream.prototype.redirect = function (to) {
    console.log([this.id, 'redirect', to.id]);
    to.consumers = this.consumers.map(function (c) {
        c.source = to;
        return c;
    });
    this.consumers = [];
    this.through = to.through.bind(to);
    this.removeConsumer = to.removeConsumer.bind(to);
    if (this.paused) {
        to.pause();
    }
    else {
        this.pause();
        to.resume();
    }
};

Stream.prototype.addConsumer = function (s) {
    console.log([this.id, 'addConsumer', s.id]);
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
    console.log([this.id, 'removeConsumer', s.id]);
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
        console.log([s.id, 'through next called', 'resuming ' + self.id]);
        next_called = true;
        //self.resume();
    };
    s.send = function (err, x) {
        next_called = false;
        f(err, x, push, next);
        if (!next_called) {
            s.pause();
        }
    };
    self.addConsumer(s);
    return s;
};

Stream.prototype.pull = function (f) {
    console.log([this.id, 'pull', f]);
    var s = this.through(function (err, x, push, next) {
        console.log(['pull consumer', err, x]);
        s.source.removeConsumer(s);
        f(err, x);
    });
    s.id = 'pull';
    s.resume();
};

Stream.prototype.write = function (x) {
    //console.log(['write', x]);
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
