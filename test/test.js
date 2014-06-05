var EventEmitter = require('events').EventEmitter,
    through = require('through'),
    sinon = require('sinon'),
    Stream = require('stream'),
    streamify = require('stream-array'),
    concat = require('concat-stream'),
    Promise = require('es6-promise').Promise,
    _ = require('../lib/index');


/**
 * Functional utils
 */

exports['curry'] = function (test) {
    var fn = _.curry(function (a, b, c, d) {
        return a + b + c + d;
    });
    test.equal(fn(1,2,3,4), fn(1,2)(3,4));
    test.equal(fn(1,2,3,4), fn(1)(2)(3)(4));
    var fn2 = function (a, b, c, d) {
        return a + b + c + d;
    };
    test.equal(_.curry(fn2)(1,2,3,4), _.curry(fn2,1,2,3,4));
    test.equal(_.curry(fn2)(1,2,3,4), _.curry(fn2,1,2)(3,4));
    test.done();
};

exports['ncurry'] = function (test) {
    var fn = _.ncurry(3, function (a, b, c, d) {
        return a + b + c + (d || 0);
    });
    test.equal(fn(1,2,3,4), 6);
    test.equal(fn(1,2,3,4), fn(1,2)(3));
    test.equal(fn(1,2,3,4), fn(1)(2)(3));
    var fn2 = function () {
        var args = Array.prototype.slice(arguments);
        return args.reduce(function (a, b) { return a + b; }, 0);
    };
    test.equal(_.ncurry(3,fn2)(1,2,3,4), _.ncurry(3,fn2,1,2,3,4));
    test.equal(_.ncurry(3,fn2)(1,2,3,4), _.ncurry(3,fn2,1,2)(3,4));
    test.done();
};

exports['compose'] = function (test) {
    function append(x) {
        return function (str) {
            return str + x;
        };
    }
    var fn1 = append(':one');
    var fn2 = append(':two');
    var fn = _.compose(fn2, fn1);
    test.equal(fn('zero'), 'zero:one:two');
    fn = _.compose(fn1, fn2, fn1);
    test.equal(fn('zero'), 'zero:one:two:one');
    test.done();
};

exports['partial'] = function (test) {
    var addAll = function () {
        var args = Array.prototype.slice.call(arguments);
        return args.reduce(function (a, b) { return a + b; }, 0);
    };
    var f = _.partial(addAll, 1, 2);
    test.equal(f(3, 4), 10);
    test.done();
};

exports['flip'] = function (test) {
    var subtract = function (a, b) {
        return a - b;
    };
    test.equal(subtract(4,2), 2);
    test.equal(_.flip(subtract)(4,2), -2);
    test.equal(_.flip(subtract, 4)(2), -2);
    test.equal(_.flip(subtract, 4, 2), -2);
    test.done();
};

exports['seq'] = function (test) {
    function append(x) {
        return function (str) {
            return str + x;
        };
    }
    var fn1 = append(':one');
    var fn2 = append(':two');
    var fn = _.seq(fn1, fn2);
    test.equal(fn('zero'), 'zero:one:two');
    // more than two args
    test.equal(_.seq(fn1, fn2, fn1)('zero'), 'zero:one:two:one');
    test.done();
}

/***** Streams *****/

exports['isStream'] = function (test) {
    test.ok(!_.isStream());
    test.ok(!_.isStream(undefined));
    test.ok(!_.isStream(null));
    test.ok(!_.isStream(123));
    test.ok(!_.isStream({}));
    test.ok(!_.isStream([]));
    test.ok(!_.isStream('foo'));
    test.ok(_.isStream(_()));
    test.ok(_.isStream(_().map(_.get('foo'))));
    test.done();
};

exports['nil defines end'] = function (test) {
    _([1,_.nil,3]).toArray(function (xs) {
        test.same(xs, [1]);
        test.done();
    });
};

exports['nil should not equate to any empty object'] = function (test) {
    var s = [1,{},3];
    _(s).toArray(function (xs) {
        test.same(xs, s);
        test.done();
    });
};

exports['async consume'] = function (test) {
    _([1,2,3,4]).consume(function (err, x, push, next) {
        if (x === _.nil) {
            push(null, _.nil);
        }
        else {
            setTimeout(function(){
                push(null, x*10);
                next();
            }, 10);
        }
    })
    .toArray(function (xs) {
        test.same(xs, [10, 20, 30, 40]);
        test.done();
    });
};

exports['passing Stream to constructor returns original'] = function (test) {
    var s = _([1,2,3]);
    test.strictEqual(s, _(s));
    test.done();
};

exports['constructor from promise'] = function (test) {
    _(Promise.resolve(3)).toArray(function (xs) {
        test.same(xs, [3]);
        test.done();
    });
};

exports['constructor from promise - errors'] = function (test) {
    var errs = [];
    _(Promise.reject(new Error('boom')))
        .errors(function (err) {
            errs.push(err);
        })
        .toArray(function (xs) {
            test.equal(errs[0].message, 'boom');
            test.equal(errs.length, 1);
            test.same(xs, []);
            test.done();
        });
};

exports['if no consumers, buffer data'] = function (test) {
    var s = _();
    test.equal(s.paused, true);
    s.write(1);
    s.write(2);
    s.toArray(function (xs) {
        test.same(xs, [1,2,3]);
        test.done();
    });
    s.write(3);
    s.write(_.nil);
};

exports['if consumer paused, buffer data'] = function (test) {
    var map_calls = [];
    function doubled(x) {
        map_calls.push(x);
        return x * 2;
    }
    var s = _();
    var s2 = s.map(doubled);
    test.equal(s.paused, true);
    test.equal(s2.paused, true);
    s.write(1);
    s.write(2);
    test.same(map_calls, []);
    s2.toArray(function (xs) {
        test.same(xs, [2, 4, 6]);
        test.same(map_calls, [1, 2, 3]);
        test.done();
    });
    s.write(3);
    s.write(_.nil);
};

exports['write when paused adds to incoming buffer'] = function (test) {
    var s = _();
    test.ok(s.paused);
    test.same(s._incoming, []);
    test.strictEqual(s.write(1), false);
    test.same(s._incoming, [1]);
    test.strictEqual(s.write(2), false);
    test.same(s._incoming, [1,2]);
    test.done();
};

exports['write when not paused sends to consumer'] = function (test) {
    var vals = [];
    var s1 = _();
    var s2 = s1.consume(function (err, x, push, next) {
        vals.push(x);
        next();
    });
    test.ok(s1.paused);
    test.ok(s2.paused);
    test.same(s1._incoming, []);
    test.same(s2._incoming, []);
    s2.resume();
    test.ok(!s1.paused);
    test.ok(!s2.paused);
    test.strictEqual(s1.write(1), true);
    test.strictEqual(s1.write(2), true);
    test.same(s1._incoming, []);
    test.same(s2._incoming, []);
    test.same(vals, [1,2]);
    test.done();
};

exports['buffered incoming data released on resume'] = function (test) {
    var vals = [];
    var s1 = _();
    var s2 = s1.consume(function (err, x, push, next) {
        vals.push(x);
        next();
    });
    test.strictEqual(s1.write(1), false);
    test.same(s1._incoming, [1]);
    test.same(s2._incoming, []);
    s2.resume();
    test.same(vals, [1]);
    test.same(s1._incoming, []);
    test.same(s2._incoming, []);
    test.strictEqual(s1.write(2), true);
    test.same(vals, [1,2]);
    test.done();
};

exports['restart buffering incoming data on pause'] = function (test) {
    var vals = [];
    var s1 = _();
    var s2 = s1.consume(function (err, x, push, next) {
        vals.push(x);
        next();
    });
    s2.resume();
    test.strictEqual(s1.write(1), true);
    test.strictEqual(s1.write(2), true);
    test.same(s1._incoming, []);
    test.same(s2._incoming, []);
    test.same(vals, [1,2]);
    s2.pause();
    test.strictEqual(s1.write(3), false);
    test.strictEqual(s1.write(4), false);
    test.same(s1._incoming, [3,4]);
    test.same(s2._incoming, []);
    test.same(vals, [1,2]);
    s2.resume();
    test.same(s1._incoming, []);
    test.same(s2._incoming, []);
    test.same(vals, [1,2,3,4]);
    test.done();
};

exports['redirect from consumer'] = function (test) {
    var s = _([1,2,3]);
    var s2 = s.consume(function (err, x, push, next) {
        next(_([4, 5, 6]));
    });
    s2.toArray(function (xs) {
        test.same(xs, [4, 5, 6]);
        test.done();
    });
};

exports['async next from consumer'] = function (test) {
    test.expect(5);
    var calls = 0;
    var s = _(function (push, next) {
        calls++;
        setTimeout(function () {
            push(null, calls);
            next();
        }, 10);
    });
    s.id = 's';
    var s2 = s.consume(function (err, x, push, next) {
        if (x <= 3) {
            setTimeout(function () {
                // no further values should have been read
                test.equal(calls, x);
                next();
            }, 50);
        }
        else {
            push(null, _.nil);
        }
    });
    s2.id = 's2';
    s2.toArray(function (xs) {
        test.same(xs, []);
        test.equal(calls, 4);
        test.done();
    });
};

exports['errors'] = function (test) {
    var errs = [];
    var err1 = new Error('one');
    var err2 = new Error('two');
    var s = _(function (push, next) {
        push(err1);
        push(null, 1);
        push(err2);
        push(null, 2);
        push(null, _.nil);
    });
    var f = function (err, rethrow) {
        errs.push(err);
    };
    _.errors(f, s).toArray(function (xs) {
        test.same(xs, [1, 2]);
        test.same(errs, [err1, err2]);
        test.done();
    });
};

exports['errors - rethrow'] = function (test) {
    var errs = [];
    var err1 = new Error('one');
    var err2 = new Error('two');
    var s = _(function (push, next) {
        push(err1);
        push(null, 1);
        push(err2);
        push(null, 2);
        push(null, _.nil);
    });
    var f = function (err, rethrow) {
        errs.push(err);
        if (err.message === 'two') {
            rethrow(err);
        }
    };
    test.throws(function () {
        _.errors(f)(s).toArray(function () {
            test.ok(false, 'should not be called');
        });
    }, 'two');
    test.done();
};

exports['errors - ArrayStream'] = function (test) {
    var errs = [];
    var f = function (err, rethrow) {
        errs.push(err);
    };
    // kinda pointless
    _([1,2]).errors(f).toArray(function (xs) {
        test.same(xs, [1, 2]);
        test.same(errs, []);
        test.done();
    });
};

exports['errors - GeneratorStream'] = function (test) {
    var errs = [];
    var err1 = new Error('one');
    var err2 = new Error('two');
    var s = _(function (push, next) {
        push(err1);
        push(null, 1);
        setTimeout(function () {
            push(err2);
            push(null, 2);
            push(null, _.nil);
        }, 10);
    });
    var f = function (err, rethrow) {
        errs.push(err);
    };
    s.errors(f).toArray(function (xs) {
        test.same(xs, [1, 2]);
        test.same(errs, [err1, err2]);
        test.done();
    });
};

exports['stopOnError'] = function (test) {
    var errs = [];
    var err1 = new Error('one');
    var err2 = new Error('two');
    var s = _(function (push, next) {
        push(null, 1);
        push(err1);
        push(null, 2);
        push(err2);
        push(null, _.nil);
    });
    var f = function (err, rethrow) {
        errs.push(err);
    };
    _.stopOnError(f, s).toArray(function (xs) {
        test.same(xs, [1]);
        test.same(errs, [err1]);
        test.done();
    });
};

exports['stopOnError - ArrayStream'] = function (test) {
    var errs = [];
    var f = function (err, rethrow) {
        errs.push(err);
    };
    _([1,2,3,4]).stopOnError(f).toArray(function (xs) {
        test.same(xs, [1,2,3,4]);
        test.same(errs, []);
        test.done();
    });
};

exports['stopOnError - GeneratorStream'] = function (test) {
    var errs = [];
    var err1 = new Error('one');
    var err2 = new Error('two');
    var s = _(function (push, next) {
        push(null, 1);
        setTimeout(function () {
            push(err1);
            push(null, 2);
            push(err2);
            push(null, _.nil);
        }, 10);
    });
    var f = function (err, rethrow) {
        errs.push(err);
    };
    s.stopOnError(f).toArray(function (xs) {
        test.same(xs, [1]);
        test.same(errs, [err1]);
        test.done();
    });
};

exports['apply'] = function (test) {
    test.expect(8);
    var fn = function (a, b, c) {
        test.equal(arguments.length, 3);
        test.equal(a, 1);
        test.equal(b, 2);
        test.equal(c, 3);
    };
    _.apply(fn, [1, 2, 3]);
    // partial application
    _.apply(fn)([1, 2, 3]);
    test.done();
};

exports['apply - ArrayStream'] = function (test) {
    _([1,2,3]).apply(function (a, b, c) {
        test.equal(arguments.length, 3);
        test.equal(a, 1);
        test.equal(b, 2);
        test.equal(c, 3);
        test.done();
    });
};

exports['apply - GeneratorStream'] = function (test) {
    var s = _(function (push, next) {
        push(null, 1);
        setTimeout(function () {
            push(null, 2);
            push(null, 3);
            push(null, _.nil);
        }, 10);
    });
    s.apply(function (a, b, c) {
        test.equal(arguments.length, 3);
        test.equal(a, 1);
        test.equal(b, 2);
        test.equal(c, 3);
        test.done();
    });
};

exports['take'] = function (test) {
    test.expect(3);
    var s = _([1,2,3,4]).take(2);
    s.pull(function (err, x) {
        test.equal(x, 1);
    });
    s.pull(function (err, x) {
        test.equal(x, 2);
    });
    s.pull(function (err, x) {
        test.equal(x, _.nil);
    });
    test.done();
};

exports['take - errors'] = function (test) {
    test.expect(4);
    var s = _(function (push, next) {
        push(null, 1),
        push(new Error('error'), 2),
        push(null, 3),
        push(null, 4),
        push(null, _.nil)
    });
    var f = s.take(2);
    f.pull(function (err, x) {
        test.equal(x, 1);
    });
    f.pull(function (err, x) {
        test.equal(err.message, 'error');
    });
    f.pull(function (err, x) {
        test.equal(x, 3);
    });
    f.pull(function (err, x) {
        test.equal(x, _.nil);
    });
    test.done();
};

exports['take 1'] = function (test) {
    test.expect(2);
    var s = _([1]).take(1);
    s.pull(function (err, x) {
        test.equal(x, 1);
    });
    s.pull(function (err, x) {
        test.equal(x, _.nil);
    });
    test.done();
};

exports['head'] = function (test) {
    test.expect(2);
    var s = _([2, 1]).head();
    s.pull(function (err, x) {
        test.equal(2, x);
    });
    s.pull(function (err, x) {
        test.equal(x, _.nil);
    });
    test.done();
};

exports['each'] = function (test) {
    var calls = [];
    _.each(function (x) {
        calls.push(x);
    }, [1,2,3]);
    test.same(calls, [1,2,3]);
    // partial application
    _.each(function (x) {
        calls.push(x);
    })([1,2,3]);
    test.same(calls, [1,2,3,1,2,3]);
    test.done();
};

exports['each - ArrayStream'] = function (test) {
    var calls = [];
    _([1,2,3]).each(function (x) {
        calls.push(x);
    });
    test.same(calls, [1,2,3]);
    test.done();
};

exports['each - GeneratorStream'] = function (test) {
    var s = _(function (push, next) {
        push(null, 1);
        push(null, 2);
        push(null, 3);
        push(null, _.nil);
    });
    var calls = [];
    s.each(function (x) {
        calls.push(x);
    });
    test.same(calls, [1,2,3]);
    test.done();
};

exports['each - throw error if consumed'] = function (test) {
    var e = new Error('broken');
    var s = _(function (push, next) {
        push(null, 1);
        push(e);
        push(null, 2);
        push(null, _.nil);
    });
    test.throws(function () {
        s.each(function (x) {
            // do nothing
        });
    });
    test.done();
};

exports['calls generator on read'] = function (test) {
    var gen_calls = 0;
    var s = _(function (push, next) {
        gen_calls++;
        push(null, 1);
        push(null, _.nil);
    });
    test.equal(gen_calls, 0);
    s.take(1).toArray(function (xs) {
        test.equal(gen_calls, 1);
        test.same(xs, [1]);
        s.take(1).toArray(function (ys) {
            test.equal(gen_calls, 1);
            test.same(ys, []);
            test.done();
        });
    });
};

exports['generator consumers are sent values eagerly until pause'] = function (test) {
    var s = _(function (push, next) {
        push(null, 1);
        push(null, 2);
        push(null, 3);
        push(null, _.nil);
    });
    var calls = [];
    var consumer = s.consume(function (err, x, push, next) {
        calls.push(x);
        if (x !== 2) {
            next();
        }
    });
    consumer.resume();
    test.same(JSON.stringify(calls), JSON.stringify([1,2]));
    consumer.resume();
    test.same(calls, [1,2,3,_.nil]);
    test.done();
};

exports['check generator loops on next call without push'] = function (test) {
    var count = 0;
    var s = _(function (push, next) {
        count++;
        if (count < 5) {
            next();
        }
        else {
            push(null, count);
            push(null, _.nil);
        }
    });
    s.toArray(function (xs) {
        test.equal(count, 5);
        test.same(xs, [5]);
        test.done();
    });
};

exports['calls generator multiple times if paused by next'] = function (test) {
    var gen_calls = 0;
    var vals = [1, 2];
    var s = _(function (push, next) {
        gen_calls++;
        if (vals.length) {
            push(null, vals.shift());
            next();
        }
        else {
            push(null, _.nil);
        }
    });
    test.equal(gen_calls, 0);
    s.take(1).toArray(function (xs) {
        test.equal(gen_calls, 1);
        test.same(xs, [1]);
        s.take(1).toArray(function (xs) {
            test.equal(gen_calls, 2);
            test.same(xs, [2]);
            s.take(1).toArray(function (xs) {
                test.equal(gen_calls, 3);
                test.same(xs, []);
                test.done();
            });
        });
    });
};

exports['adding multiple consumers should error'] = function (test) {
    var s = _([1,2,3,4]);
    s.consume(function () {});
    test.throws(function () {
        s.consume(function () {});
    });
    test.done();
};

exports['switch to alternate stream using next'] = function (test) {
    var s2_gen_calls = 0;
    var s2 = _(function (push, next) {
        s2_gen_calls++;
        push(null, 2);
        push(null, _.nil);
    });
    s2.id = 's2';
    var s1_gen_calls = 0;
    var s1 = _(function (push, next) {
        s1_gen_calls++;
        push(null, 1);
        next(s2);
    });
    s1.id = 's1';
    test.equal(s1_gen_calls, 0);
    test.equal(s2_gen_calls, 0);
    s1.take(1).toArray(function (xs) {
        test.equal(s1_gen_calls, 1);
        test.equal(s2_gen_calls, 0);
        test.same(xs, [1]);
        s1.take(1).toArray(function (xs) {
            test.equal(s1_gen_calls, 1);
            test.equal(s2_gen_calls, 1);
            test.same(xs, [2]);
            s1.take(1).toArray(function (xs) {
                test.equal(s1_gen_calls, 1);
                test.equal(s2_gen_calls, 1);
                test.same(xs, []);
                test.done();
            });
        });
    });
};

exports['switch to alternate stream using next (async)'] = function (test) {
    var s2_gen_calls = 0;
    var s2 = _(function (push, next) {
        s2_gen_calls++;
        setTimeout(function () {
            push(null, 2);
            push(null, _.nil);
        }, 10);
    });
    s2.id = 's2';
    var s1_gen_calls = 0;
    var s1 = _(function (push, next) {
        s1_gen_calls++;
        setTimeout(function () {
            push(null, 1);
            next(s2);
        }, 10);
    });
    s1.id = 's1';
    test.equal(s1_gen_calls, 0);
    test.equal(s2_gen_calls, 0);
    s1.take(1).toArray(function (xs) {
        test.equal(s1_gen_calls, 1);
        test.equal(s2_gen_calls, 0);
        test.same(xs, [1]);
        s1.take(1).toArray(function (xs) {
            test.equal(s1_gen_calls, 1);
            test.equal(s2_gen_calls, 1);
            test.same(xs, [2]);
            s1.take(1).toArray(function (xs) {
                test.equal(s1_gen_calls, 1);
                test.equal(s2_gen_calls, 1);
                test.same(xs, []);
                test.done();
            });
        });
    });
};

exports['lazily evalute stream'] = function (test) {
    test.expect(2);
    var map_calls = [];
    function doubled(x) {
        map_calls.push(x);
        return x * 2;
    }
    var s = _([1, 2, 3, 4]);
    s.id = 's';
    s.map(doubled).take(2).toArray(function (xs) {
        test.same(xs, [2, 4]);
    });
    test.same(JSON.stringify(map_calls), JSON.stringify([1, 2]));
    test.done();
};


exports['pipe old-style node stream to highland stream'] = function (test) {
    var xs = [];
    var src = streamify([1,2,3,4]);
    var s1 = _();
    var s2 = s1.consume(function (err, x, push, next) {
        xs.push(x);
        next();
    });
    Stream.prototype.pipe.call(src, s1);
    setTimeout(function () {
        test.same(s1._incoming, [1]);
        test.same(s2._incoming, []);
        test.same(xs, []);
        s2.resume();
        setTimeout(function () {
            test.same(s1._incoming, []);
            test.same(s2._incoming, []);
            test.same(xs, [1,2,3,4,_.nil]);
            test.done();
        }, 100);
    }, 100);
};

exports['pipe node stream to highland stream'] = function (test) {
    var xs = [];
    var src = streamify([1,2,3,4]);
    var s1 = _();
    var s2 = s1.consume(function (err, x, push, next) {
        xs.push(x);
        next();
    });
    src.pipe(s1);
    setTimeout(function () {
        test.same(s1._incoming, [1]);
        test.same(s2._incoming, []);
        test.same(xs, []);
        s2.resume();
        setTimeout(function () {
            test.same(s1._incoming, []);
            test.same(s2._incoming, []);
            test.same(xs, [1,2,3,4,_.nil]);
            test.done();
        }, 100);
    }, 100);
};

exports['pipe highland stream to node stream'] = function (test) {
    var src = _(['a','b','c']);
    var dest = concat(function (data) {
        test.same(data, 'abc');
        test.done();
    });
    src.pipe(dest);
};

exports['pipe to node stream with backpressure'] = function (test) {
    test.expect(3);
    var src = _([1,2,3,4]);
    var xs = [];
    var dest = new EventEmitter();
    dest.writable = true;
    dest.write = function (x) {
        xs.push(x);
        if (xs.length === 2) {
            _.setImmediate(function () {
                test.same(xs, [1,2]);
                test.ok(src.paused);
                dest.emit('drain');
            });
            return false;
        }
    };
    dest.end = function () {
        test.same(xs, [1,2,3,4]);
        test.done();
    };
    src.pipe(dest);
};

exports['wrap node stream and pipe'] = function (test) {
    test.expect(7);
    function doubled(x) {
        return x * 2;
    }
    var xs = [];
    var readable = streamify([1,2,3,4]);
    var ys = _(readable).map(doubled);

    var dest = new EventEmitter();
    dest.writable = true;
    dest.write = function (x) {
        xs.push(x);
        if (xs.length === 2) {
            _.setImmediate(function () {
                test.same(xs, [2,4]);
                test.ok(ys.source.paused);
                test.equal(readable._readableState.readingMore, false);
                dest.emit('drain');
            });
            return false;
        }
    };
    dest.end = function () {
        test.same(xs, [2,4,6,8]);
        test.done();
    };
    // make sure nothing starts until we pipe
    test.same(xs, []);
    test.same(ys._incoming, []);
    test.same(ys.source._incoming, []);
    ys.pipe(dest);
};

// ignore these tests in non-node.js environments
if (typeof process !== 'undefined' && process.stdout) {
    exports['pipe highland stream to stdout'] = function (test) {
        test.expect(1)
        var src = _(['']);
        test.doesNotThrow(function () {
            src.pipe(process.stdout);
        })
        test.done()
    }
}

// ignore these tests in non-node.js environments
if (typeof process !== 'undefined' && process.stderr) {
    exports['pipe highland stream to stderr'] = function (test) {
        test.expect(1)
        var src = _(['']);
        test.doesNotThrow(function () {
            src.pipe(process.stderr);
        })
        test.done()
    }
}

exports['attach data event handler'] = function (test) {
    var s = _([1,2,3,4]);
    var xs = [];
    s.on('data', function (x) {
        xs.push(x);
    });
    s.on('end', function () {
        test.same(xs, [1,2,3,4]);
        test.done();
    });
};

exports['multiple pull calls on async generator'] = function (test) {
    var calls = 0;
    function countdown(n) {
        var s = _(function (push, next) {
            calls++;
            if (n === 0) {
                push(null, _.nil);
            }
            else {
                setTimeout(function () {
                    push(null, n);
                    next(countdown(n - 1));
                }, 10);
            }
        });
        s.id = 'countdown:' + n;
        return s;
    }
    var s = countdown(3);
    var s2 = _(function (push, next) {
        s.pull(function (err, x) {
            if (err || x !== _.nil) {
                push(err, x);
                next();
            }
            else {
                push(null, _.nil);
            }
        });
    });
    s2.id = 's2';
    s2.toArray(function (xs) {
        test.same(xs, [3,2,1]);
        test.same(calls, 4);
        test.done();
    });
};

exports['wrap EventEmitter (or jQuery) on handler'] = function (test) {
    var calls = [];
    var ee = {
        on: function (name, f) {
            test.same(name, 'myevent');
            f(1);
            f(2);
            setTimeout(function () {
                f(3);
                test.same(calls, [1, 2, 3]);
                test.done();
            }, 10);
        }
    };
    _('myevent', ee).each(function (x) {
        calls.push(x);
    });
};

exports['wrap EventEmitter (or jQuery) on handler with args wrapping by function'] = function (test) {
    var ee = {
        on: function (name, f) {
            test.same(name, 'myevent');
            f(1, 2, 3);
        }
    };
    function mapper(){
        return Array.prototype.slice.call(arguments);
    }
    _('myevent', ee, mapper).each(function (x) {
        test.same(x, [1, 2, 3]);
        test.done();
    });
};

exports['wrap EventEmitter (or jQuery) on handler with args wrapping by number'] = function (test) {
    var ee = {
        on: function (name, f) {
            test.same(name, 'myevent');
            f(1, 2, 3);
        }
    };
    _('myevent', ee, 2).each(function (x) {
        test.same(x, [1, 2]);
        test.done();
    });
};

exports['wrap EventEmitter (or jQuery) on handler with args wrapping by array'] = function (test) {
    var ee = {
        on: function (name, f) {
            test.same(name, 'myevent');
            f(1, 2, 3);
        }
    };
    _('myevent', ee, ['one', 'two', 'three']).each(function (x) {
        test.same(x, {'one': 1, 'two': 2, 'three': 3});
        test.done()
    });
};

exports['sequence'] = function (test) {
    _.sequence([[1,2], [3], [[4],5]]).toArray(function (xs) {
        test.same(xs, [1,2,3,[4],5]);
    });
    test.done();
};

exports['sequence - ArrayStream'] = function (test) {
    _([[1,2], [3], [[4],5]]).sequence().toArray(function (xs) {
        test.same(xs, [1,2,3,[4],5]);
        test.done();
    });
};

exports['sequence - GeneratorStream'] = function (test) {
    var calls = [];
    function countdown(name, n) {
        var s = _(function (push, next) {
            calls.push(name);
            if (n === 0) {
                push(null, _.nil);
            }
            else {
                setTimeout(function () {
                    push(null, n);
                    next(countdown(name, n - 1));
                }, 10);
            }
        });
        s.id = 'countdown:' + name + ':' + n;
        return s;
    }
    var s1 = countdown('one', 3);
    var s2 = countdown('two', 3);
    var s3 = countdown('three', 3);
    _([s1, s2, s3]).sequence().take(8).toArray(function (xs) {
        test.same(xs, [3,2,1,3,2,1,3,2]);
        test.same(calls, [
            'one', 'one', 'one', 'one',
            'two', 'two', 'two', 'two',
            'three', 'three' // last call missed off due to take(8)
        ]);
        test.done();
    });
};

exports['sequence - nested GeneratorStreams'] = function (test) {
    var s2 = _(function (push, next) {
        push(null, 2);
        push(null, _.nil);
    });
    var s1 = _(function (push, next) {
        push(null, 1);
        push(null, s2);
        push(null, _.nil);
    });
    _([s1]).sequence().toArray(function (xs) {
        test.same(xs, [1, s2]);
        test.done();
    });
};

exports['sequence - series alias'] = function (test) {
    test.equal(_.sequence, _.series);
    var s1 = _([1,2,3]);
    var s2 = _(function (push, next) {});
    test.equal(s1.sequence, s1.series);
    test.equal(s2.sequence, s2.series);
    test.done();
};

exports['sequence - Streams of Streams of Arrays'] = function (test) {
    _([
        _([1,2]),
        _([3]),
        _([[4],5])
    ]).sequence().toArray(function (xs) {
        test.same(xs, [1,2,3,[4],5]);
        test.done();
    });
}

exports['fork'] = function (test) {
    var s = _([1,2,3,4]);
    s.id = 's';
    var s2 = s.map(function (x) {
        return x * 2;
    });
    s2.id = 's2';
    var s3 = s.fork().map(function (x) {
        return x * 3;
    });
    s3.id = 's3';
    var s2_data = [];
    var s3_data = [];
    s2.take(1).each(function (x) {
        s2_data.push(x);
    });
    // don't start until both consumers resume
    test.same(s2_data, []);
    s3.take(2).each(function (x) {
        s3_data.push(x);
    });
    test.same(s2_data, [2]);
    test.same(s3_data, [3]);
    s2.take(1).each(function (x) {
        s2_data.push(x);
    });
    test.same(s2_data, [2,4]);
    test.same(s3_data, [3,6]);
    s3.take(2).each(function (x) {
        s3_data.push(x);
    });
    test.same(s2_data, [2,4]);
    test.same(s3_data, [3,6]);
    s2.take(2).each(function (x) {
        s2_data.push(x);
    });
    test.same(s2_data, [2,4,6,8]);
    test.same(s3_data, [3,6,9,12]);
    test.done();
};

exports['observe'] = function (test) {
    var s = _([1,2,3,4]);
    s.id = 's';
    var s2 = s.map(function (x) {
        return x * 2;
    });
    s2.id = 's2';
    var s3 = s.observe().map(function (x) {
        return x * 3;
    });
    s3.id = 's3';
    var s2_data = [];
    var s3_data = [];
    s2.take(1).each(function (x) {
        s2_data.push(x);
    });
    test.same(s2_data, [2]);
    test.same(s3_data, []);
    test.same(s3.source._incoming, [1]);
    s3.take(2).each(function (x) {
        s3_data.push(x);
    });
    test.same(s2_data, [2]);
    test.same(s3_data, [3]);
    s2.take(1).each(function (x) {
        s2_data.push(x);
    });
    test.same(s2_data, [2,4]);
    test.same(s3_data, [3,6]);
    s3.take(2).each(function (x) {
        s3_data.push(x);
    });
    test.same(s2_data, [2,4]);
    test.same(s3_data, [3,6]);
    s2.take(2).each(function (x) {
        s2_data.push(x);
    });
    test.same(s2_data, [2,4,6,8]);
    test.same(s3_data, [3,6,9,12]);
    test.done();
};

// TODO: test redirect after fork, forked streams should transfer over
// TODO: test redirect after observe, observed streams should transfer over

exports['flatten'] = function (test) {
    _.flatten([1, [2, [3, 4], 5], [6]]).toArray(function (xs) {
        test.same(xs, [1,2,3,4,5,6]);
        test.done();
    });
};

exports['flatten - ArrayStream'] = function (test) {
    _([1, [2, [3, 4], 5], [6]]).flatten().toArray(function (xs) {
        test.same(xs, [1,2,3,4,5,6]);
        test.done();
    });
};

exports['flatten - GeneratorStream'] = function (test) {
    var s3 = _(function (push, next) {
        setTimeout(function () {
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
        }, 200);
    });
    var s2 = _(function (push, next) {
        setTimeout(function () {
            push(null, 2);
            push(null, s3);
            push(null, 5);
            push(null, _.nil);
        }, 50);
    });
    var s1 = _(function (push, next) {
        push(null, 1);
        push(null, s2);
        push(null, [6]);
        push(null, _.nil);
    });
    s1.flatten().toArray(function (xs) {
        test.same(xs, [1,2,3,4,5,6]);
        test.done();
    });
};

exports['flatten - nested GeneratorStreams'] = function (test) {
    var s2 = _(function (push, next) {
        push(null, 2);
        push(null, _.nil);
    });
    var s1 = _(function (push, next) {
        push(null, 1);
        push(null, s2);
        push(null, _.nil);
    });
    s1.flatten().toArray(function (xs) {
        test.same(xs, [1, 2]);
        test.done();
    });
};

exports['otherwise'] = function (test) {
    test.expect(5);
    _.otherwise(_([4,5,6]), _([1,2,3])).toArray(function (xs) {
        test.same(xs, [1,2,3]);
    });
    _.otherwise(_([4,5,6]), _([])).toArray(function (xs) {
        test.same(xs, [4,5,6]);
    });
    _.otherwise(_([]), _([1,2,3])).toArray(function (xs) {
        test.same(xs, [1,2,3]);
    });
    _.otherwise(_([]), _([])).toArray(function (xs) {
        test.same(xs, []);
    });
    // partial application
    _.otherwise(_([4,5,6]))(_([1,2,3])).toArray(function (xs) {
        test.same(xs, [1,2,3]);
    });
    test.done();
};

exports['otherwise - ArrayStream'] = function (test) {
    test.expect(2);
    _([1,2,3]).otherwise([4,5,6]).toArray(function (xs) {
        test.same(xs, [1,2,3]);
    });
    _([]).otherwise([4,5,6]).toArray(function (xs) {
        test.same(xs, [4,5,6]);
    });
    test.done();
};

exports['otherwise - GeneratorStream'] = function (test) {
    test.expect(2);
    var empty = _(function (push, next) {
        setTimeout(function () {
            push(null, _.nil);
        }, 10);
    });
    var xs = _(function (push, next) {
        setTimeout(function () {
            push(null, 1);
            push(null, _.nil);
        }, 10);
    });
    var ys = _(function (push, next) {
        setTimeout(function () {
            push(null, 2);
            push(null, _.nil);
        }, 10);
    });
    xs.otherwise(ys).toArray(function (zs) {
        test.same(zs, [1]);
        empty.otherwise(ys).toArray(function (zs) {
            test.same(zs, [2]);
            test.done();
        });
    });
};

exports['append'] = function (test) {
    test.expect(2);
    _.append(4, [1,2,3]).toArray(function (xs) {
        test.same(xs, [1,2,3,4]);
    });
    // partial application
    _.append(4)([1,2,3]).toArray(function (xs) {
        test.same(xs, [1,2,3,4]);
    });
    test.done();
};

exports['append - ArrayStream'] = function (test) {
    _([1,2,3]).append(4).toArray(function (xs) {
        test.same(xs, [1,2,3,4]);
        test.done();
    });
};

exports['append - GeneratorStream'] = function (test) {
    var s = _(function (push, next) {
        push(null, 1);
        push(null, 2);
        push(null, 3);
        push(null, _.nil);
    });
    s.append(4).toArray(function (xs) {
        test.same(xs, [1,2,3,4]);
        test.done();
    });
};

exports['reduce'] = function (test) {
    test.expect(3);
    function add(a, b) {
        return a + b;
    }
    _.reduce(10, add, [1,2,3,4]).toArray(function (xs) {
        test.same(xs, [20]);
    });
    // partial application
    _.reduce(10, add)([1,2,3,4]).toArray(function (xs) {
        test.same(xs, [20]);
    });
    _.reduce(10)(add)([1,2,3,4]).toArray(function (xs) {
        test.same(xs, [20]);
    });
    test.done();
};

exports['reduce - ArrayStream'] = function (test) {
    function add(a, b) {
        return a + b;
    }
    _([1,2,3,4]).reduce(10, add).toArray(function (xs) {
        test.same(xs, [20]);
        test.done();
    });
};

exports['reduce - GeneratorStream'] = function (test) {
    function add(a, b) {
        return a + b;
    }
    var s = _(function (push, next) {
        setTimeout(function () {
            push(null, 1);
            push(null, 2);
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
        }, 10);
    });
    s.reduce(10, add).toArray(function (xs) {
        test.same(xs, [20]);
        test.done();
    });
};

exports['reduce1'] = function (test) {
    test.expect(4);
    function add(a, b) {
        return a + b;
    }
    _.reduce1(add, [1,2,3,4]).toArray(function (xs) {
        test.same(xs, [10]);
    });
    // partial application
    _.reduce1(add)([1,2,3,4]).toArray(function (xs) {
        test.same(xs, [10]);
    });
    _.reduce1(add)([1,2,3,4]).toArray(function (xs) {
        test.same(xs, [10]);
    });
    // single argument
    _.reduce1(add, [1]).toArray(function (xs) {
        test.same(xs, [1]);
    });
    test.done();
};

exports['reduce1 - ArrayStream'] = function (test) {
    function add(a, b) {
        return a + b;
    }
    _([1,2,3,4]).reduce1(add).toArray(function (xs) {
        test.same(xs, [10]);
        test.done();
    });
};

exports['reduce1 - GeneratorStream'] = function (test) {
    function add(a, b) {
        return a + b;
    }
    var s = _(function (push, next) {
        setTimeout(function () {
            push(null, 1);
            push(null, 2);
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
        }, 10);
    });
    s.reduce1(add).toArray(function (xs) {
        test.same(xs, [10]);
        test.done();
    });
};


exports['scan'] = function (test) {
    test.expect(3);
    function add(a, b) {
        return a + b;
    }
    _.scan(10, add, [1,2,3,4]).toArray(function (xs) {
        test.same(xs, [10, 11, 13, 16, 20]);
    });
    // partial application
    _.scan(10, add)([1,2,3,4]).toArray(function (xs) {
        test.same(xs, [10, 11, 13, 16, 20]);
    });
    _.scan(10)(add)([1,2,3,4]).toArray(function (xs) {
        test.same(xs, [10, 11, 13, 16, 20]);
    });
    test.done();
};

exports['scan - ArrayStream'] = function (test) {
    function add(a, b) {
        return a + b;
    }
    _([1,2,3,4]).scan(10, add).toArray(function (xs) {
        test.same(xs, [10, 11, 13, 16, 20]);
        test.done();
    });
};

exports['scan - GeneratorStream'] = function (test) {
    function add(a, b) {
        return a + b;
    }
    var s = _(function (push, next) {
        setTimeout(function () {
            push(null, 1);
            push(null, 2);
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
        }, 10);
    });
    s.scan(10, add).toArray(function (xs) {
        test.same(xs, [10, 11, 13, 16, 20]);
        test.done();
    });
};

exports['scan - GeneratorStream lazy'] = function (test) {
    var calls = [];
    function add(a, b) {
        calls.push([a, b]);
        return a + b;
    }
    var s = _(function (push, next) {
        setTimeout(function () {
            push(null, 1);
            push(null, 2);
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
        }, 10);
    });
    s.scan(10, add).take(3).toArray(function (xs) {
        test.same(calls, [
            [10, 1],
            [11, 2]
        ]);
        test.same(xs, [10, 11, 13]);
        test.done();
    });
};

exports['scan1'] = function (test) {
    test.expect(4);
    function add(a, b) {
        return a + b;
    }
    _.scan1(add, [1,2,3,4]).toArray(function (xs) {
        test.same(xs, [1, 3, 6, 10]);
    });
    // partial application
    _.scan1(add)([1,2,3,4]).toArray(function (xs) {
        test.same(xs, [1, 3, 6, 10]);
    });
    _.scan1(add)([1,2,3,4]).toArray(function (xs) {
        test.same(xs, [1, 3, 6, 10]);
    });
    // single argument
    _.scan1(add, [1]).toArray(function (xs) {
        test.same(xs, [1]);
    });
    test.done();
};

exports['scan1 - ArrayStream'] = function (test) {
    function add(a, b) {
        return a + b;
    }
    _([1,2,3,4]).scan1(add).toArray(function (xs) {
        test.same(xs, [1, 3, 6, 10]);
        test.done();
    });
};

exports['scan1 - GeneratorStream'] = function (test) {
    function add(a, b) {
        return a + b;
    }
    var s = _(function (push, next) {
        setTimeout(function () {
            push(null, 1);
            push(null, 2);
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
        }, 10);
    });
    s.scan1(add).toArray(function (xs) {
        test.same(xs, [1, 3, 6, 10]);
        test.done();
    });
};

exports['scan1 - GeneratorStream lazy'] = function (test) {
    var calls = [];
    function add(a, b) {
        calls.push([a, b]);
        return a + b;
    }
    var s = _(function (push, next) {
        setTimeout(function () {
            push(null, 1);
            push(null, 2);
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
        }, 10);
    });
    s.scan1(add).take(3).toArray(function (xs) {
        test.same(calls, [
            [1, 2],
            [3, 3]
        ]);
        test.same(xs, [1, 3, 6]);
        test.done();
    });
};

exports['collect'] = function (test) {
    _.collect([1,2,3,4]).toArray(function (xs) {
        test.same(xs, [[1,2,3,4]]);
        test.done();
    });
};

exports['collect - ArrayStream'] = function (test) {
    _([1,2,3,4]).collect().toArray(function (xs) {
        test.same(xs, [[1,2,3,4]]);
        test.done();
    });
};

exports['collect - GeneratorStream'] = function (test) {
    var s = _(function (push, next) {
        setTimeout(function () {
            push(null, 1);
            push(null, 2);
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
        }, 10);
    });
    s.collect().toArray(function (xs) {
        test.same(xs, [[1,2,3,4]]);
        test.done();
    });
};

exports['concat'] = function (test) {
    test.expect(2);
    _.concat([3,4], [1,2]).toArray(function (xs) {
        test.same(xs, [1,2,3,4])
    });
    // partial application
    _.concat([3,4])([1,2]).toArray(function (xs) {
        test.same(xs, [1,2,3,4])
    });
    test.done();
};

exports['concat - ArrayStream'] = function (test) {
    _([1,2]).concat([3,4]).toArray(function (xs) {
        test.same(xs, [1,2,3,4]);
        test.done();
    });
};

exports['concat - piped ArrayStream'] = function (test) {
    _.concat(streamify([3,4]).pipe(through()), streamify([1,2])).toArray(function (xs) {
        test.same(xs, [1,2,3,4]);
        test.done();
    });  
};

exports['concat - piped ArrayStream - paused'] = function (test) {
    var s1 = streamify([1,2]);
    var s2 = streamify([3,4]);
    s2.pause();
    s1.pause();

    var _resume1 = s1.resume;
    var resume_called1 = false;
    s1.resume = function () {
        resume_called1 = true;
        return _resume1.apply(this, arguments);
    };
    test.strictEqual(s1._readableState.flowing, false);
    test.strictEqual(resume_called1, false);

    var _resume2 = s2.resume;
    var resume_called2 = false;
    s2.resume = function () {
        resume_called2 = true;
        return _resume2.apply(this, arguments);
    };
    test.strictEqual(s2._readableState.flowing, false);
    test.strictEqual(resume_called2, false);

    var s3 = _.concat(s2, s1);
    test.strictEqual(s1._readableState.flowing, false);
    test.strictEqual(resume_called1, false);
    test.strictEqual(s2._readableState.flowing, false);
    test.strictEqual(resume_called2, false);

    s3.toArray(function (xs) {
        test.same(xs, [1,2,3,4]);
        test.done();
    });
};

exports['concat - GeneratorStream'] = function (test) {
    var s1 = _(function (push, next) {
        setTimeout(function () {
            push(null, 1);
            push(null, 2);
            push(null, _.nil);
        }, 10);
    });
    var s2 = _(function (push, next) {
        setTimeout(function () {
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
        }, 10);
    });
    s1.concat(s2).toArray(function (xs) {
        test.same(xs, [1,2,3,4]);
        test.done();
    });
};

exports['merge'] = {
    setUp: function (callback) {
        this.clock = sinon.useFakeTimers();
        callback();
    },
    tearDown: function (callback) {
        this.clock.restore();
        callback();
    },
    'top-level': function (test) {
        var s1 = _(function (push, next) {
            push(null, 1);
            setTimeout(function () {
                push(null, 2);
            }, 20);
            setTimeout(function () {
                push(null, 3);
                push(null, _.nil);
            }, 40);
        });
        var s2 = _(function (push, next) {
            setTimeout(function () {
                push(null, 4);
            }, 10);
            setTimeout(function () {
                push(null, 5);
            }, 30);
            setTimeout(function () {
                push(null, 6);
                push(null, _.nil);
            }, 50);
        });
        _.merge([s1, s2]).toArray(function (xs) {
            test.same(xs, [1,4,2,5,3,6]);
            test.done();
        });
        this.clock.tick(100);
    },
    'ArrayStream': function (test) {
        var s1 = _(function (push, next) {
            push(null, 1);
            setTimeout(function () {
                push(null, 2);
            }, 20);
            setTimeout(function () {
                push(null, 3);
                push(null, _.nil);
            }, 40);
        });
        var s2 = _(function (push, next) {
            setTimeout(function () {
                push(null, 4);
            }, 10);
            setTimeout(function () {
                push(null, 5);
            }, 30);
            setTimeout(function () {
                push(null, 6);
                push(null, _.nil);
            }, 50);
        });
        _([s1, s2]).merge().toArray(function (xs) {
            test.same(xs, [1,4,2,5,3,6]);
            test.done();
        });
        this.clock.tick(100);
    },
    'GeneratorStream': function (test) {
        var s1 = _(function (push, next) {
            push(null, 1);
            setTimeout(function () {
                push(null, 2);
            }, 20);
            setTimeout(function () {
                push(null, 3);
                push(null, _.nil);
            }, 40);
        });
        var s2 = _(function (push, next) {
            setTimeout(function () {
                push(null, 4);
            }, 10);
            setTimeout(function () {
                push(null, 5);
            }, 30);
            setTimeout(function () {
                push(null, 6);
                push(null, _.nil);
            }, 50);
        });
        var s = _(function (push, next) {
            push(null, s1);
            setTimeout(function() {
                push(null, s2);
                push(null, _.nil);
            }, 5);
        });
        s.merge().toArray(function (xs) {
            test.same(xs, [1,4,2,5,3,6]);
            test.done();
        });
        this.clock.tick(100);
    },
    'pull from all streams in parallel': function (test) {
        var s1 = _(function (push, next) {
            setTimeout(function () {
                push(null, 1);
            }, 40);
            setTimeout(function () {
                push(null, 2);
                push(null, _.nil);
            }, 80);
        });
        var s2 = _(function (push, next) {
            setTimeout(function () {
                push(null, 3);
            }, 10);
            setTimeout(function () {
                push(null, 4);
            }, 20);
            setTimeout(function () {
                push(null, 5);
                push(null, _.nil);
            }, 30);
        });
        _([s1, s2]).merge().toArray(function (xs) {
            test.same(xs, [3,4,5,1,2]);
            test.done();
        });
        this.clock.tick(100);
    },
    'consume lazily': function (test) {
        var counter1 = 0;
        var s1 = _(function (push, next) {
            counter1++;
            setTimeout(function () {
                push(null, counter1);
                next();
            }, 50);
        });
        var counter2 = 0;
        var s2 = _(function (push, next) {
            counter2++;
            setTimeout(function () {
                push(null, counter2);
                next();
            }, 120);
        });
        var self = this;
        _([s1, s2]).merge().take(4).toArray(function (xs) {
            test.same(xs, [1, 2, 1, 3]);
            setTimeout(function () {
                test.equal(counter1, 3);
                test.equal(counter2, 2);
                test.done();
            }, 500);
            self.clock.tick(500);
        });
        this.clock.tick(500);
    },
    'read from sources as soon as they are available': function (test) {
        test.expect(2);
        var s1 = _([1, 2, 3]);
        var s2 = _([4, 5, 6]);
        var srcs = _(function (push, next) {
            setTimeout(function () { push(null, s1); }, 100);
            setTimeout(function () { push(null, s2); }, 200);
            setTimeout(function () { push(null, _.nil); }, 300);
        });
        var xs = [];
        srcs.merge().each(function (x) {
            xs.push(x);
        });
        setTimeout(function () {
            test.same(xs.slice(), [1, 2, 3]);
        }, 150);
        setTimeout(function () {
            test.same(xs.slice(), [1, 2, 3, 4, 5, 6]);
            test.done();
        }, 400);
        this.clock.tick(400);
    }
};

exports['invoke'] = function (test) {
    test.expect(2);
    _.invoke('toString', [], [1,2,3,4]).toArray(function (xs) {
        test.same(xs, ['1', '2', '3', '4']);
    });
    // partial application
    _.invoke('toString')([])([1,2,3,4]).toArray(function (xs) {
        test.same(xs, ['1', '2', '3', '4']);
    });
    test.done();
};

exports['invoke - ArrayStream'] = function (test) {
    _([1,2,3,4]).invoke('toString', []).toArray(function (xs) {
        test.same(xs, ['1','2','3','4']);
        test.done();
    });
};

exports['invoke - GeneratorStream'] = function (test) {
    var s = _(function (push, next) {
        push(null, 1);
        push(null, 2);
        setTimeout(function () {
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
        }, 10);
    });
    s.invoke('toString', []).toArray(function (xs) {
        test.same(xs, ['1','2','3','4']);
        test.done();
    });
};

exports['map'] = function (test) {
    test.expect(2);
    function doubled(x) {
        return x * 2;
    }
    _.map(doubled, [1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [2, 4, 6, 8]);
    });
    // partial application
    _.map(doubled)([1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [2, 4, 6, 8]);
    });
    test.done();
};

exports['map - ArrayStream'] = function (test) {
    function doubled(x) {
        return x * 2;
    }
    _([1, 2, 3, 4]).map(doubled).toArray(function (xs) {
        test.same(xs, [2, 4, 6, 8]);
        test.done();
    });
};

exports['map - GeneratorStream'] = function (test) {
    function doubled(x) {
        return x * 2;
    }
    var s = _(function (push, next) {
        push(null, 1);
        push(null, 2);
        setTimeout(function () {
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
        }, 10);
    });
    s.map(doubled).toArray(function (xs) {
        test.same(xs, [2, 4, 6, 8]);
        test.done();
    });
};

exports['map to value'] = function (test) {
    test.expect(2);
    _.map('foo', [1, 2]).toArray(function (xs) {
        test.same(xs, ['foo', 'foo']);
    });
    _([1, 2, 3]).map(1).toArray(function (xs) {
        test.same(xs, [1,1,1]);
    });
    test.done();
};

exports['flatMap'] = function (test) {
    var f = function (x) {
        return _(function (push, next) {
            setTimeout(function () {
                push(null, x * 2);
                push(null, _.nil);
            }, 10);
        });
    };
    _.flatMap(f, [1,2,3,4]).toArray(function (xs) {
        test.same(xs, [2,4,6,8]);
        test.done();
    });
};

exports['flatMap - ArrayStream'] = function (test) {
    var f = function (x) {
        return _(function (push, next) {
            setTimeout(function () {
                push(null, x * 2);
                push(null, _.nil);
            }, 10);
        });
    };
    _([1,2,3,4]).flatMap(f).toArray(function (xs) {
        test.same(xs, [2,4,6,8]);
        test.done();
    });
};

exports['flatMap - GeneratorStream'] = function (test) {
    var f = function (x) {
        return _(function (push, next) {
            setTimeout(function () {
                push(null, x * 2);
                push(null, _.nil);
            }, 10);
        });
    };
    var s = _(function (push, next) {
        push(null, 1);
        push(null, 2);
        setTimeout(function () {
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
        }, 10);
    });
    s.flatMap(f).toArray(function (xs) {
        test.same(xs, [2,4,6,8]);
        test.done();
    });
};

exports['flatMap - map to Stream of Array'] = function (test) {
    test.expect(1);
    var f = function (x) {
        return _([[x]]);
    };
    var s = _([1,2,3,4]).flatMap(f).toArray(function (xs) {
        test.same(xs, [[1],[2],[3],[4]]);
        test.done();
    });
};

exports['pluck'] = function (test) {
    var a = _([
        {type: 'blogpost', title: 'foo'},
        {type: 'blogpost', title: 'bar'},
        {type: 'asdf', title: 'baz'}
    ]);
    a.pluck('title').toArray(function (xs) {
        test.same(xs, ['foo', 'bar', 'baz']);
        test.done();
    });
};

exports['pluck - non-object argument'] = function (test) {
    var a = _([1, {type: 'blogpost', title: 'foo'}]);
    test.throws(function () {
        a.pluck('title').toArray(function (xs) {
            test.ok(false, "shouldn't be called");
        });
    },
    'Expected Object, got array');
    test.done();
};

exports['filter'] = function (test) {
    test.expect(2);
    function isEven(x) {
        return x % 2 === 0;
    }
    _.filter(isEven, [1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [2, 4]);
    });
    // partial application
    _.filter(isEven)([1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [2, 4]);
    });
    test.done();
};

exports['filter - ArrayStream'] = function (test) {
    function isEven(x) {
        return x % 2 === 0;
    }
    _([1, 2, 3, 4]).filter(isEven).toArray(function (xs) {
        test.same(xs, [2, 4]);
        test.done();
    });
};

exports['filter - GeneratorStream'] = function (test) {
    function isEven(x) {
        return x % 2 === 0;
    }
    var s = _(function (push, next) {
        push(null, 1);
        push(null, 2);
        setTimeout(function () {
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
        }, 10);
    });
    s.filter(isEven).toArray(function (xs) {
        test.same(xs, [2, 4]);
        test.done();
    });
};

exports['flatFilter'] = function (test) {
    var f = function (x) {
        return _([x % 2 === 0]);
    };
    _.flatFilter(f, [1,2,3,4]).toArray(function (xs) {
        test.same(xs, [2,4]);
        test.done();
    });
};

exports['flatFilter - ArrayStream'] = function (test) {
    var f = function (x) {
        return _(function (push, next) {
            setTimeout(function () {
                push(null, x % 2 === 0);
                push(null, _.nil);
            }, 10);
        });
    };
    _([1,2,3,4]).flatFilter(f).toArray(function (xs) {
        test.same(xs, [2,4]);
        test.done();
    });
};

exports['flatFilter - GeneratorStream'] = function (test) {
    var f = function (x) {
        return _(function (push, next) {
            setTimeout(function () {
                push(null, x % 2 === 0);
                push(null, _.nil);
            }, 10);
        });
    };
    var s = _(function (push, next) {
        push(null, 1);
        setTimeout(function () {
            push(null, 2);
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
        }, 10);
    });
    s.flatFilter(f).toArray(function (xs) {
        test.same(xs, [2,4]);
        test.done();
    });
};

exports['reject'] = function (test) {
    test.expect(2);
    function isEven(x) {
        return x % 2 === 0;
    }
    _.reject(isEven, [1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [1, 3]);
    });
    // partial application
    _.reject(isEven)([1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [1, 3]);
    });
    test.done();
};

exports['reject - ArrayStream'] = function (test) {
    function isEven(x) {
        return x % 2 === 0;
    }
    _([1, 2, 3, 4]).reject(isEven).toArray(function (xs) {
        test.same(xs, [1, 3]);
        test.done();
    });
};

exports['reject - GeneratorStream'] = function (test) {
    function isEven(x) {
        return x % 2 === 0;
    }
    var s = _(function (push, next) {
        push(null, 1);
        push(null, 2);
        setTimeout(function () {
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
        }, 10);
    });
    s.reject(isEven).toArray(function (xs) {
        test.same(xs, [1, 3]);
        test.done();
    });
};

exports['find'] = function (test) {
    test.expect(2);
    var xs = [
        {type: 'foo', name: 'wibble'},
        {type: 'foo', name: 'wobble'},
        {type: 'bar', name: '123'},
        {type: 'bar', name: 'asdf'},
        {type: 'baz', name: 'asdf'}
    ];
    var f = function (x) {
        return x.type == 'bar';
    };
    _.find(f, xs).toArray(function (xs) {
        test.same(xs, [{type: 'bar', name: '123'}]);
    });

    // partial application
    _.find(f)(xs).toArray(function (xs) {
        test.same(xs, [{type: 'bar', name: '123'}]);
    });

    test.done();
};

exports['find - ArrayStream'] = function (test) {
    test.expect(2);
    var xs = [
        {type: 'foo', name: 'wibble'},
        {type: 'foo', name: 'wobble'},
        {type: 'bar', name: '123'},
        {type: 'bar', name: 'asdf'},
        {type: 'baz', name: 'asdf'}
    ];
    var f = function (x) {
        return x.type == 'bar';
    };
    _(xs).find(f).toArray(function (xs) {
        test.same(xs, [{type: 'bar', name: '123'}]);
    });
    // partial application
    _(xs).find(f).toArray(function (xs) {
        test.same(xs, [{type: 'bar', name: '123'}]);
    });
    test.done();
};

exports['find - GeneratorStream'] = function (test) {
    var xs = _(function (push, next) {
        push(null, {type: 'foo', name: 'wibble'});
        push(null, {type: 'foo', name: 'wobble'});
        setTimeout(function () {
            push(null, {type: 'bar', name: '123'});
            push(null, {type: 'bar', name: 'asdf'});
            push(null, {type: 'baz', name: 'asdf'});
            push(null, _.nil);
        }, 10);
    });
    var f = function (x) {
        return x.type == 'baz';
    };
    _(xs).find(f).toArray(function (xs) {
        test.same(xs, [{type: 'baz', name: 'asdf'}]);
        test.done();
    });
};



(function (exports) {

    var xs = [
        {type: 'foo', name: 'wibble'},
        {type: 'foo', name: 'wobble'},
        {type: 'bar', name: '123'},
        {type: 'bar', name: 'asdf'},
        {type: 'baz', name: 'asdf'}
    ];

    var expected = {
        'foo': [{type: 'foo', name: 'wibble'}, {type: 'foo', name: 'wobble'}],
        'bar': [{type: 'bar', name: '123'}, {type: 'bar', name: 'asdf'}],
        'baz': [{type: 'baz', name: 'asdf'}]
    };

    var primatives = [1,2,3,'cat'];

    var pexpected = {1: [1], 2: [2], 3: [3], 'cat': ['cat']};
    var pexpectedUndefined = { 'undefined': [ 1, 2, 3, 'cat' ] };

    var f = function (x) {
        return x.type;
    };

    var pf = function (o) { return o };

    var s = 'type';

    exports['group'] = function (test) {
        test.expect(4);

        _.group(f, xs).toArray(function (xs) {
            test.same(xs, [expected]);
        });
        _.group(s, xs).toArray(function (xs) {
            test.same(xs, [expected]);
        });

        // partial application
        _.group(f)(xs).toArray(function (xs) {
            test.same(xs, [expected]);
        });
        _.group(s)(xs).toArray(function (xs) {
            test.same(xs, [expected]);
        });
        test.done();
    };

    exports['group - primatives'] = function (test) {
        test.expect(5);

        _.group(pf, primatives).toArray(function (xs) {
            test.same(xs, [pexpected]);
        });
        _.group(s, primatives).toArray(function (xs){
            test.same(xs, [pexpectedUndefined]);
        });
        test.throws(function () {
          _.group(null, primatives).toArray(_.log);
        });

        // partial application
        _.group(pf)(primatives).toArray(function (xs) {
            test.same(xs, [pexpected]);
        });
        test.throws(function () {
          _.group(null)(primatives).toArray(_.log);
        });

        test.done();
    };

    exports['group - ArrayStream'] = function (test) {
        test.expect(4);

        _(xs).group(f).toArray(function (xs) {
            test.same(xs, [expected]);
        });
        _(xs).group(s).toArray(function (xs) {
            test.same(xs, [expected]);
        });
        // partial application
        _(xs).group(f).toArray(function (xs) {
            test.same(xs, [expected]);
        });
        _(xs).group(s).toArray(function (xs) {
            test.same(xs, [expected]);
        });
        test.done();
    };

    exports['group - GeneratorStream'] = function (test) {
        var generator = _(function (push, next) {
            push(null, xs[0]);
            push(null, xs[1]);
            setTimeout(function () {
                push(null, xs[2]);
                push(null, xs[3]);
                push(null, xs[4]);
                push(null, _.nil);
            }, 10);
        });

        _(generator).group(f).toArray(function (result) {
            test.same(result, [expected]);
            test.done();
        });
    };

}(exports));


exports['compact'] = function (test) {
    test.expect(1);
    _.compact([0, 1, false, 3, undefined, null, 6]).toArray(function (xs) {
        test.same(xs, [1, 3, 6]);
    });
    test.done();
};

exports['compact - ArrayStream'] = function (test) {
    _([0, 1, false, 3, undefined, null, 6]).compact().toArray(function (xs) {
        test.same(xs, [1, 3, 6]);
        test.done();
    });
};

exports['where'] = function (test) {
    test.expect(2);
    var xs = [
        {type: 'foo', name: 'wibble'},
        {type: 'foo', name: 'wobble'},
        {type: 'bar', name: '123'},
        {type: 'bar', name: 'asdf'},
        {type: 'baz', name: 'asdf'}
    ];
    _.where({type: 'foo'}, xs).toArray(function (xs) {
        test.same(xs, [
            {type: 'foo', name: 'wibble'},
            {type: 'foo', name: 'wobble'}
        ]);
    });
    // partial application
    _.where({type: 'bar', name: 'asdf'})(xs).toArray(function (xs) {
        test.same(xs, [
            {type: 'bar', name: 'asdf'}
        ]);
    });
    test.done();
};

exports['where - ArrayStream'] = function (test) {
    test.expect(2);
    var xs = [
        {type: 'foo', name: 'wibble'},
        {type: 'foo', name: 'wobble'},
        {type: 'bar', name: '123'},
        {type: 'bar', name: 'asdf'},
        {type: 'baz', name: 'asdf'}
    ];
    _(xs).where({type: 'foo'}).toArray(function (xs) {
        test.same(xs, [
            {type: 'foo', name: 'wibble'},
            {type: 'foo', name: 'wobble'}
        ]);
    });
    // partial application
    _(xs).where({type: 'bar', name: 'asdf'}).toArray(function (xs) {
        test.same(xs, [
            {type: 'bar', name: 'asdf'}
        ]);
    });
    test.done();
};

exports['where - GeneratorStream'] = function (test) {
    var xs = _(function (push, next) {
        push(null, {type: 'foo', name: 'wibble'});
        push(null, {type: 'foo', name: 'wobble'});
        setTimeout(function () {
            push(null, {type: 'bar', name: '123'});
            push(null, {type: 'bar', name: 'asdf'});
            push(null, {type: 'baz', name: 'asdf'});
            push(null, _.nil);
        }, 10);
    });
    _(xs).where({name: 'asdf'}).toArray(function (xs) {
        test.same(xs, [
            {type: 'bar', name: 'asdf'},
            {type: 'baz', name: 'asdf'}
        ]);
        test.done();
    });
};

exports['zip'] = function (test) {
    test.expect(2);
    _.zip([1,2,3], ['a', 'b', 'c']).toArray(function (xs) {
        test.same(xs, [['a',1], ['b',2], ['c',3]]);
    });
    // partial application
    _.zip([1,2,3,4,5])(['a', 'b', 'c']).toArray(function (xs) {
        test.same(xs, [['a',1], ['b',2], ['c',3]]);
    });
    test.done();
};

exports['zip - source emits error'] = function (test) {
    test.expect(4);
    var err = new Error('error');
    var s1 = _([1,2]);
    var s2 = _(function (push) {
        push(null, 'a');
        push(err);
        push(null, 'b');
        push(null, _.nil);
    });

    var s = s1.zip(s2);
    s.pull(function (err, x) {
        test.deepEqual(x, [1, 'a']);
    });
    s.pull(function (err, x) {
        test.equal(err.message, 'error');
    });
    s.pull(function (err, x) {
        test.deepEqual(x, [2, 'b']);
    });
    s.pull(function (err, x) {
        test.equal(x, _.nil);
    });
    test.done();
};

exports['zip - ArrayStream'] = function (test) {
    _(['a', 'b', 'c']).zip([1,2,3]).toArray(function (xs) {
        test.same(xs, [['a',1], ['b',2], ['c',3]]);
        test.done();
    });
};

exports['zip - GeneratorStream'] = function (test) {
    var s1 = _(function (push, next) {
        push(null, 'a');
        setTimeout(function () {
            push(null, 'b');
            setTimeout(function () {
                push(null, 'c');
                push(null, _.nil);
            }, 10);
        }, 10);
    });
    var s2 = _(function (push, next) {
        setTimeout(function () {
            push(null, 1);
            push(null, 2);
            setTimeout(function () {
                push(null, 3);
                push(null, _.nil);
            }, 50);
        }, 50);
    });
    s1.zip(s2).toArray(function (xs) {
        test.same(xs, [['a',1], ['b',2], ['c',3]]);
        test.done();
    });
};

exports['batch'] = function (test) {
    test.expect(5);
    _.batch(3, [1,2,3,4,5,6,7,8,9,0]).toArray(function (xs) {
        test.same(xs, [[1,2,3], [4,5,6], [7,8,9], [0]]);
    });

    _.batch(3, [1,2,3]).toArray(function (xs) {
        test.same(xs, [[1,2,3]]);
    });

    _.batch(2, [1,2,3]).toArray(function (xs) {
        test.same(xs, [[1,2],[3]]);
    });

    _.batch(1, [1,2,3]).toArray(function (xs) {
        test.same(xs, [[1],[2],[3]]);
    });

    _.batch(0, [1,2,3]).toArray(function (xs) {
        test.same(xs, [[1,2,3]]);
    });

    test.done();
};

exports['batch - ArrayStream'] = function (test) {
    test.expect(5);
    _([1,2,3,4,5,6,7,8,9,0]).batch(3).toArray(function (xs) {
        test.same(xs, [[1,2,3], [4,5,6], [7,8,9], [0]]);
    });

    _([1,2,3]).batch(4).toArray(function (xs) {
        test.same(xs, [[1,2,3]]);
    });

    _([1,2,3]).batch(2).toArray(function (xs) {
        test.same(xs, [[1,2],[3]]);
    });

    _([1,2,3]).batch(1).toArray(function (xs) {
        test.same(xs, [[1],[2],[3]]);
    });

    _([1,2,3]).batch(0).toArray(function (xs) {
        test.same(xs, [[1,2,3]]);
    });

    test.done();
};

exports['batch - GeneratorStream'] = function (test) {
    var s1 = _(function (push, next) {
        push(null, 1);
        setTimeout(function () {
            push(null, 2);
            setTimeout(function () {
                push(null, 3);
                push(null, _.nil);
            }, 10);
        }, 10);
    });
    s1.batch(1).toArray(function (xs) {
        test.same(xs, [[1], [2], [3]]);
        test.done();
    });
}

exports['parallel'] = function (test) {
    var calls = [];
    var s1 = _(function (push, next) {
        setTimeout(function () {
            calls.push(1);
            push(null, 1);
            push(null, _.nil);
        }, 150);
    });
    var s2 = _(function (push, next) {
        setTimeout(function () {
            calls.push(2);
            push(null, 2);
            push(null, _.nil);
        }, 50);
    });
    var s3 = _(function (push, next) {
        setTimeout(function () {
            calls.push(3);
            push(null, 3);
            push(null, _.nil);
        }, 100);
    });
    _.parallel(4, [s1, s2, s3]).toArray(function (xs) {
        test.same(calls, [2, 3, 1]);
        test.same(xs, [1, 2, 3]);
        test.done();
    });
};

exports['parallel - partial application'] = function (test) {
    var calls = [];
    var s1 = _(function (push, next) {
        setTimeout(function () {
            calls.push(1);
            push(null, 1);
            push(null, _.nil);
        }, 100);
    });
    var s2 = _(function (push, next) {
        setTimeout(function () {
            calls.push(2);
            push(null, 2);
            push(null, _.nil);
        }, 50);
    });
    var s3 = _(function (push, next) {
        setTimeout(function () {
            calls.push(3);
            push(null, 3);
            push(null, _.nil);
        }, 150);
    });
    _.parallel(4)([s1, s2, s3]).toArray(function (xs) {
        test.same(calls, [2, 1, 3]);
        test.same(xs, [1, 2, 3]);
        test.done();
    });
};

exports['parallel - n === 1'] = function (test) {
    var calls = [];
    var s1 = _(function (push, next) {
        setTimeout(function () {
            calls.push(1);
            push(null, 1);
            push(null, _.nil);
        }, 100);
    });
    var s2 = _(function (push, next) {
        setTimeout(function () {
            calls.push(2);
            push(null, 2);
            push(null, _.nil);
        }, 50);
    });
    var s3 = _(function (push, next) {
        setTimeout(function () {
            calls.push(3);
            push(null, 3);
            push(null, _.nil);
        }, 150);
    });
    _.parallel(1, [s1, s2, s3]).toArray(function (xs) {
        test.same(calls, [1, 2, 3]);
        test.same(xs, [1, 2, 3]);
        test.done();
    });
};

exports['parallel - n === 2'] = function (test) {
    var calls = [];
    var s1 = _(function (push, next) {
        setTimeout(function () {
            calls.push(1);
            push(null, 1);
            push(null, _.nil);
        }, 150);
    });
    var s2 = _(function (push, next) {
        setTimeout(function () {
            calls.push(2);
            push(null, 2);
            push(null, _.nil);
        }, 100);
    });
    var s3 = _(function (push, next) {
        setTimeout(function () {
            calls.push(3);
            push(null, 3);
            push(null, _.nil);
        }, 50);
    });
    _.parallel(2, [s1, s2, s3]).toArray(function (xs) {
        test.same(calls, [2, 1, 3]);
        test.same(xs, [1, 2, 3]);
        test.done();
    });
};

exports['parallel - ArrayStream'] = function (test) {
    var calls = [];
    var s1 = _(function (push, next) {
        setTimeout(function () {
            calls.push(1);
            push(null, 1);
            push(null, _.nil);
        }, 150);
    });
    var s2 = _(function (push, next) {
        setTimeout(function () {
            calls.push(2);
            push(null, 2);
            push(null, _.nil);
        }, 100);
    });
    var s3 = _(function (push, next) {
        setTimeout(function () {
            calls.push(3);
            push(null, 3);
            push(null, _.nil);
        }, 50);
    });
    _([s1, s2, s3]).parallel(2).toArray(function (xs) {
        test.same(calls, [2, 1, 3]);
        test.same(xs, [1, 2, 3]);
        test.done();
    });
};

exports['parallel - GeneratorStream'] = function (test) {
    var calls = [];
    var s1 = _(function (push, next) {
        setTimeout(function () {
            calls.push(1);
            push(null, 1);
            push(null, _.nil);
        }, 150);
    });
    var s2 = _(function (push, next) {
        setTimeout(function () {
            calls.push(2);
            push(null, 2);
            push(null, _.nil);
        }, 100);
    });
    var s3 = _(function (push, next) {
        setTimeout(function () {
            calls.push(3);
            push(null, 3);
            push(null, _.nil);
        }, 50);
    });
    var s = _(function (push, next) {
        push(null, s1);
        setTimeout(function () {
            push(null, s2);
            push(null, s3);
            push(null, _.nil);
        }, 10);
    });
    s.parallel(2).toArray(function (xs) {
        test.same(calls, [2, 1, 3]);
        test.same(xs, [1, 2, 3]);
        test.done();
    });
};

exports['throttle'] = {
    setUp: function (callback) {
        this.clock = sinon.useFakeTimers();
        callback();
    },
    tearDown: function (callback) {
        this.clock.restore();
        callback();
    },
    'top-level': function (test) {
        function delay(push, ms, x) {
            setTimeout(function () {
                push(null, x);
            }, ms);
        }
        var s = _(function (push, next) {
            delay(push, 10, 1);
            delay(push, 20, 1);
            delay(push, 30, 1);
            delay(push, 40, 1);
            delay(push, 50, 1);
            delay(push, 60, 1);
            delay(push, 70, 1);
            delay(push, 80, 1);
            delay(push, 90, _.nil);
        });
        _.throttle(50, s).toArray(function (xs) {
            test.same(xs, [1, 1]);
            test.done();
        });
        this.clock.tick(90);
    },
    'let errors through regardless': function (test) {
        function delay(push, ms, err, x) {
            setTimeout(function () {
                push(err, x);
            }, ms);
        }
        var s = _(function (push, next) {
            delay(push, 10, null, 1);
            delay(push, 20, null, 1);
            delay(push, 30, null, 1);
            delay(push, 30, 'foo');
            delay(push, 30, 'bar');
            delay(push, 40, null, 1);
            delay(push, 50, null, 1);
            delay(push, 60, null, 1);
            delay(push, 70, null, 1);
            delay(push, 80, null, 1);
            delay(push, 90, null, _.nil);
        });
        var errs = [];
        s.throttle(50).errors(function (err) {
            errs.push(err);
        }).toArray(function (xs) {
            test.same(xs, [1, 1]);
            test.same(errs, ['foo', 'bar']);
            test.done();
        });
        this.clock.tick(90);
    },
    'GeneratorStream': function (test) {
        function delay(push, ms, x) {
            setTimeout(function () {
                push(null, x);
            }, ms);
        }
        var s = _(function (push, next) {
            delay(push, 10, 1);
            delay(push, 20, 1);
            delay(push, 30, 1);
            delay(push, 40, 1);
            delay(push, 50, 1);
            delay(push, 60, 1);
            delay(push, 70, 1);
            delay(push, 80, 1);
            delay(push, 90, _.nil);
        });
        s.throttle(30).toArray(function (xs) {
            test.same(xs, [1, 1, 1]);
            test.done();
        });
        this.clock.tick(90);
    }
};

exports['debounce'] = {
    setUp: function (callback) {
        this.clock = sinon.useFakeTimers();
        callback();
    },
    tearDown: function (callback) {
        this.clock.restore();
        callback();
    },
    'top-level': function (test) {
        function delay(push, ms, x) {
            setTimeout(function () {
                push(null, x);
            }, ms);
        }
        var s = _(function (push, next) {
            delay(push, 10, 1);
            delay(push, 20, 1);
            delay(push, 30, 1);
            delay(push, 40, 1);
            delay(push, 150, 1);
            delay(push, 160, 1);
            delay(push, 170, 1);
            delay(push, 180, 'last');
            delay(push, 190, _.nil);
        });
        _.debounce(100, s).toArray(function (xs) {
            test.same(xs, [1, 'last']);
            test.done();
        });
        this.clock.tick(200);
    },
    'GeneratorStream': function (test) {
        function delay(push, ms, x) {
            setTimeout(function () {
                push(null, x);
            }, ms);
        }
        var s = _(function (push, next) {
            delay(push, 10, 1);
            delay(push, 20, 1);
            delay(push, 30, 1);
            delay(push, 40, 1);
            delay(push, 150, 1);
            delay(push, 160, 1);
            delay(push, 170, 1);
            delay(push, 180, 'last');
            delay(push, 190, _.nil);
        });
        s.debounce(100).toArray(function (xs) {
            test.same(xs, [1, 'last']);
            test.done();
        });
        this.clock.tick(200);
    },
    'let errors through regardless': function (test) {
        function delay(push, ms, err, x) {
            setTimeout(function () {
                push(err, x);
            }, ms);
        }
        var s = _(function (push, next) {
            delay(push, 10, null, 1);
            delay(push, 20, null, 1);
            delay(push, 30, null, 1);
            delay(push, 30, 'foo');
            delay(push, 30, 'bar');
            delay(push, 40, null, 1);
            delay(push, 150, null, 1);
            delay(push, 260, null, 1);
            delay(push, 270, null, 1);
            delay(push, 280, null, 'last');
            delay(push, 290, null, _.nil);
        });
        var errs = [];
        s.debounce(100).errors(function (err) {
            errs.push(err);
        }).toArray(function (xs) {
            test.same(xs, [1, 1, 'last']);
            test.same(errs, ['foo', 'bar']);
            test.done();
        });
        this.clock.tick(300);
    }
};

exports['latest'] = {
    setUp: function (callback) {
        this.clock = sinon.useFakeTimers();
        callback();
    },
    tearDown: function (callback) {
        this.clock.restore();
        callback();
    },
    'top-level': function (test) {
        test.expect(1);
        function delay(push, ms, x) {
            setTimeout(function () {
                push(null, x);
            }, ms);
        }
        var s = _(function (push, next) {
            delay(push, 10, 1);
            delay(push, 20, 1);
            delay(push, 30, 1);
            delay(push, 40, 1);
            delay(push, 50, 1);
            delay(push, 60, 1);
            delay(push, 70, 1);
            delay(push, 80, 'last');
            delay(push, 90, _.nil);
        });
        var s2 = _.latest(s);
        var s3 = s2.consume(function (err, x, push, next) {
            push(err, x);
            setTimeout(next, 60);
        });
        s3.toArray(function (xs) {
            // values at 0s, 60s, 120s
            test.same(xs, [1, 1, 'last']);
            test.done();
        });
        this.clock.tick(1000);
    },
    'GeneratorStream': function (test) {
        test.expect(1);
        function delay(push, ms, x) {
            setTimeout(function () {
                push(null, x);
            }, ms);
        }
        var s = _(function (push, next) {
            delay(push, 10, 1);
            delay(push, 20, 1);
            delay(push, 30, 1);
            delay(push, 40, 1);
            delay(push, 50, 1);
            delay(push, 60, 1);
            delay(push, 70, 1);
            delay(push, 80, 'last');
            delay(push, 90, _.nil);
        });
        var s2 = s.latest();
        var s3 = s2.consume(function (err, x, push, next) {
            push(err, x);
            setTimeout(next, 60);
        });
        s3.toArray(function (xs) {
            // values at 0s, 60s, 120s
            test.same(xs, [1, 1, 'last']);
            test.done();
        });
        this.clock.tick(1000);
    },
    'let errors pass through': function (test) {
        test.expect(2);
        function delay(push, ms, err, x) {
            setTimeout(function () {
                push(err, x);
            }, ms);
        }
        var s = _(function (push, next) {
            delay(push, 10, null, 1);
            delay(push, 20, null, 1);
            delay(push, 30, null, 1);
            delay(push, 30, 'foo', 1);
            delay(push, 30, 'bar', 1);
            delay(push, 40, null, 1);
            delay(push, 50, null, 1);
            delay(push, 60, null, 1);
            delay(push, 70, null, 1);
            delay(push, 80, null, 'last');
            delay(push, 90, null, _.nil);
        });
        var errs = [];
        var s2 = s.latest().errors(function (err) {
            errs.push(err);
        });
        var s3 = s2.consume(function (err, x, push, next) {
            push(err, x);
            setTimeout(next, 60);
        });
        s3.toArray(function (xs) {
            // values at 0s, 60s, 120s
            test.same(xs, [1, 1, 'last']);
            test.same(errs, ['foo', 'bar']);
            test.done();
        });
        this.clock.tick(1000);
    }
};

exports['last'] = function (test) {
    test.expect(3);
    _([1,2,3,4]).last().toArray(function (xs) {
        test.same(xs, [4]);
    });
    _.last([1,2,3,4]).toArray(function (xs) {
        test.same(xs, [4]);
    });
    _.last([]).toArray(function (xs) {
        test.same(xs, []);
    });
    test.done();
};

exports['through - function'] = function (test) {
    var s = _.through(function (s) {
        return s
            .filter(function (x) {
                return x % 2;
            })
            .map(function (x) {
                return x * 2;
            });
    }, [1,2,3,4]);
    s.toArray(function (xs) {
        test.same(xs, [2, 6]);
        test.done();
    });
};

exports['through - function - ArrayStream'] = function (test) {
    var s = _([1,2,3,4]).through(function (s) {
        return s
            .filter(function (x) {
                return x % 2;
            })
            .map(function (x) {
                return x * 2;
            });
    })
    .through(function (s) {
        return s.map(function (x) {
            return x + 1;
        });
    });
    s.toArray(function (xs) {
        test.same(xs, [3, 7]);
        test.done();
    });
};

exports['through - stream'] = function (test) {
    var parser = through(
        function (data) {
            this.queue(JSON.parse(data));
        },
        function () {
            this.queue(null);
        }
    );
    var s = _.through(parser, ['1','2','3','4']);
    s.toArray(function (xs) {
        test.same(xs, [1,2,3,4]);
        test.done();
    });
};

exports['through - stream - ArrayStream'] = function (test) {
    var parser = through(function (data) {
        this.queue(JSON.parse(data));
    });
    var s = _(['1','2','3','4']).through(parser);
    s.toArray(function (xs) {
        test.same(xs, [1,2,3,4]);
        test.done();
    });
};

exports['through - stream and function'] = function (test) {
    var parser = through(
        function (data) {
            this.queue(JSON.parse(data));
        },
        function () {
            this.queue(null);
        }
    );
    var s = _(['1','2','3','4'])
        .through(parser)
        .through(function (s) {
            return s.map(function (x) {
                return x * 2;
            });
        });
    s.toArray(function (xs) {
        test.same(xs, [2,4,6,8]);
        test.done();
    });
};

exports['pipeline'] = function (test) {
    var parser = through(
        function (data) {
            this.queue(JSON.parse(data));
        },
        function () {
            this.queue(null);
        }
    );
    var doubler = _.map(function (x) {
        return x * 2;
    });
    var parseDouble = _.pipeline(parser, doubler);
    var s = _(function (push, next) {
        push(null, 1);
        setTimeout(function () { push(null, 2); }, 10);
        setTimeout(function () { push(null, 3); }, 20);
        setTimeout(function () { push(null, 4); }, 30);
        setTimeout(function () { push(null, _.nil); }, 40);
    });
    s.pipe(parseDouble).toArray(function (xs) {
        test.same(xs, [2,4,6,8]);
        test.done();
    });
};

exports['pipeline - single through function'] = function (test) {
    var src = streamify([1,2,3,4]);
    var through = _.pipeline(function (s) {
        return s
            .filter(function (x) {
                return x % 2;
            })
            .map(function (x) {
                return x * 2;
            })
            .map(function (x) {
                return x + 10;
            });
    });
    src.pipe(through).toArray(function (xs) {
        test.same(xs, [12, 16]);
        test.done();
    });
};

exports['pipeline - no arguments'] = function (test) {
    var src = streamify([1,2,3,4]);
    var through = _.pipeline();
    src.pipe(through).toArray(function (xs) {
        test.same(xs, [1,2,3,4]);
        test.done();
    });
};


/***** Objects *****/

// TODO: test lazy getting of values from obj keys (test using getters?)
exports['values'] = function (test) {
    var obj = {
        foo: 1,
        bar: 2,
        baz: 3
    };
    _.values(obj).toArray(function (xs) {
        test.same(xs, [1, 2, 3]);
        test.done();
    });
};

exports['values - lazy property access'] = function (test) {
    var calls = [];
    var obj = {
        get foo() { calls.push('foo'); return 1; },
        get bar() { calls.push('bar'); return 2; },
        get baz() { calls.push('baz'); return 3; }
    };
    _.values(obj).take(2).toArray(function (xs) {
        test.same(calls, ['foo', 'bar']);
        test.same(xs, [1, 2]);
        test.done();
    });
};

exports['keys'] = function (test) {
    var obj = {
        foo: 1,
        bar: 2,
        baz: 3
    };
    _.keys(obj).toArray(function (xs) {
        test.same(xs, ['foo', 'bar', 'baz']);
        test.done();
    });
};

exports['pairs'] = function (test) {
    var obj = {
        foo: 1,
        bar: 2,
        baz: {qux: 3}
    };
    _.pairs(obj).toArray(function (xs) {
        test.same(xs, [
            ['foo', 1],
            ['bar', 2],
            ['baz', {qux: 3}]
        ]);
        test.done();
    });
};

exports['pairs - lazy property access'] = function (test) {
    var calls = [];
    var obj = {
        get foo() { calls.push('foo'); return 1; },
        get bar() { calls.push('bar'); return 2; },
        get baz() { calls.push('baz'); return {qux: 3}; }
    };
    _.pairs(obj).take(2).toArray(function (xs) {
        test.same(calls, ['foo', 'bar']);
        test.same(xs, [
            ['foo', 1],
            ['bar', 2]
        ]);
        test.done();
    });
};

exports['extend'] = function (test) {
    var a = {a: 1, b: {num: 2, test: 'test'}};
    test.equal(a, _.extend({b: {num: 'foo'}, c: 3}, a));
    test.same(a, {a: 1, b: {num: 'foo'}, c: 3});
    // partial application
    test.equal(a, _.extend({b: 'baz'})(a));
    test.same(a, {a: 1, b: 'baz', c: 3});
    test.done();
};

exports['get'] = function (test) {
    var a = {foo: 'bar', baz: 123};
    test.equal(_.get('foo', a), 'bar');
    test.equal(_.get('baz')(a), 123);
    test.done();
};

exports['set'] = function (test) {
    var a = {foo: 'bar', baz: 123};
    test.equal(_.set('foo', 'asdf', a), a);
    test.equal(a.foo, 'asdf');
    test.equal(_.set('wibble', 'wobble')(a), a);
    test.equal(a.wibble, 'wobble');
    test.same(a, {foo: 'asdf', baz: 123, wibble: 'wobble'});
    test.done();
};

// TODO: failing case in another program - consume stream and switch to
// new async source using next, then follow the consume with flatten()
//
// in fact, a simple .consume().flatten() failed with async sub-source to be
// flattened, but curiously, it worked by doing .consume().map().flatten()
// where the map() was just map(function (x) { return x; })

/***** Utils *****/

exports['log'] = function (test) {
    var calls = [];
    var _log = console.log;
    console.log = function (x) {
        calls.push(x);
    };
    _.log('foo');
    _.log('bar');
    test.same(calls, ['foo', 'bar']);
    console.log = _log;
    test.done();
};

exports['wrapCallback'] = function (test) {
    var f = function (a, b, cb) {
        setTimeout(function () {
            cb(null, a + b);
        }, 10);
    };
    _.wrapCallback(f)(1, 2).toArray(function (xs) {
        test.same(xs, [3]);
        test.done();
    });
};

exports['wrapCallback - errors'] = function (test) {
    var f = function (a, b, cb) {
        cb(new Error('boom'));
    };
    test.throws(function () {
        _.wrapCallback(f)(1, 2).toArray(function () {
            test.ok(false, "this shouldn't be called");
        });
    });
    test.done();
};

/***** Operators *****/

exports['add'] = function (test) {
    test.equal(_.add(1, 2), 3);
    test.equal(_.add(3)(2), 5);
    return test.done();
};

exports['not'] = function (test) {
    test.equal(_.not(true), false);
    test.equal(_.not(123), false);
    test.equal(_.not("asdf"), false);
    test.equal(_.not(false), true);
    test.equal(_.not(0), true);
    test.equal(_.not(""), true);
    test.equal(_.not(null), true);
    test.equal(_.not(undefined), true);
    return test.done();
};
