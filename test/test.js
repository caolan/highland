var EventEmitter = require('events').EventEmitter,
    through = require('through'),
    sinon = require('sinon'),
    Stream = require('stream'),
    streamify = require('stream-array'),
    concat = require('concat-stream'),
    Promise = require('es6-promise').Promise,
    transducers = require('transducers-js'),
    _ = require('../lib/index');


/**
 * Useful function to use in tests.
 */

function valueEquals(test, expected) {
    return function (err, x) {
        if (err) {
            test.equal(err, null, 'Expected a value to be emitted.');
        }
        else {
            test.equal(x, expected, 'Incorrect value emitted.');
        }
    };
}

function errorEquals(test, expectedMsg) {
    return function (err, x) {
        if (err) {
            test.equal(
                err.message,
                expectedMsg,
                'Error emitted with incorrect message. ' + err.message
            );
        }
        else {
            test.ok(false, 'No error emitted.');
        }
    };
}

function anyError(test) {
    return function (err, x) {
        test.notEqual(err, null, 'No error emitted.');
    };
}

function noValueOnErrorTest(transform, expected) {
    return function (test) {
        if (!expected) expected = [];
        var thrower = _([1]).map(function () { throw new Error('error') });
        transform(thrower).errors(function () {}).toArray(function (xs) {
            test.same(xs, expected, 'Value emitted for error');
            test.done();
        });
    }
}

function generatorStream(input, timeout) {
    return _(function (push, next) {
        for (var i = 0, len = input.length; i < len; i++) {
            setTimeout(push.bind(null, null, input[i]), timeout * i);
        }
        setTimeout(push.bind(null, null, _.nil), timeout * len);
    });
}

exports['ratelimit'] = {
    setUp: function (callback) {
        this.clock = sinon.useFakeTimers();
        callback();
    },
    tearDown: function (callback) {
        this.clock.restore();
        callback();
    },
    'invalid num per ms': function (test) {
        test.throws(function () {
            _([1,2,3]).ratelimit(-10, 0);
        });
        test.throws(function () {
            _([1,2,3]).ratelimit(0, 0);
        });
        test.done();
    },
    'async generator': function (test) {
        function delay(push, ms, x) {
            setTimeout(function () {
                push(null, x);
            }, ms);
        }
        var source = _(function (push, next) {
            delay(push, 10, 1);
            delay(push, 20, 2);
            delay(push, 30, 3);
            delay(push, 40, 4);
            delay(push, 50, 5);
            delay(push, 60, _.nil);
        })
        var results = [];
        source.ratelimit(2, 100).each(function (x) {
            results.push(x);
        });
        this.clock.tick(10);
        test.same(results, [1]);
        this.clock.tick(89);
        test.same(results, [1, 2]);
        this.clock.tick(51);
        test.same(results, [1, 2, 3, 4]);
        this.clock.tick(1000);
        test.same(results, [1, 2, 3, 4, 5]);
        test.done();
    },
    'toplevel - async generator': function (test) {
        function delay(push, ms, x) {
            setTimeout(function () {
                push(null, x);
            }, ms);
        }
        var source = _(function (push, next) {
            delay(push, 10, 1);
            delay(push, 20, 2);
            delay(push, 30, 3);
            delay(push, 40, 4);
            delay(push, 50, 5);
            delay(push, 60, _.nil);
        })
        var results = [];
        _.ratelimit(2, 100, source).each(function (x) {
            results.push(x);
        });
        this.clock.tick(10);
        test.same(results, [1]);
        this.clock.tick(89);
        test.same(results, [1, 2]);
        this.clock.tick(51);
        test.same(results, [1, 2, 3, 4]);
        this.clock.tick(1000);
        test.same(results, [1, 2, 3, 4, 5]);
        test.done();
    },
    'toplevel - partial application, async generator': function (test) {
        function delay(push, ms, x) {
            setTimeout(function () {
                push(null, x);
            }, ms);
        }
        var source = _(function (push, next) {
            delay(push, 10, 1);
            delay(push, 20, 2);
            delay(push, 30, 3);
            delay(push, 40, 4);
            delay(push, 50, 5);
            delay(push, 60, _.nil);
        })
        var results = [];
        _.ratelimit(2)(100)(source).each(function (x) {
            results.push(x);
        });
        this.clock.tick(10);
        test.same(results, [1]);
        this.clock.tick(89);
        test.same(results, [1, 2]);
        this.clock.tick(51);
        test.same(results, [1, 2, 3, 4]);
        this.clock.tick(1000);
        test.same(results, [1, 2, 3, 4, 5]);
        test.done();
    }
};

exports['ratelimit - noValueOnError'] = noValueOnErrorTest(_.ratelimit(1, 10));

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

exports['consume - push nil async (issue #173)'] = function (test) {
    test.expect(1);
    _([1, 2, 3, 4]).consume(function(err, x, push, next) {
        if (err !== null) {
            push(err);
            next();
        }
        else if (x === _.nil) {
            _.setImmediate(push.bind(this, null, x));
        }
        else {
            push(null, x);
            next();
        }
    })
    .toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4]);
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

function createTestIterator(array, error, lastVal) {
    var count = 0,
        length = array.length;
    return {
        next: function() {
            if (count < length) {
                if (error && count === 2) {
                    throw error;
                }
                var iterElem = {
                    value: array[count], done: false
                };
                count++;
                return iterElem;
            }
            else {
                return {
                    value: lastVal, done: true
                }
            }
        }
    };
}

exports['constructor from iterator'] = function (test) {
    test.expect(1);
    _(createTestIterator([1, 2, 3, 4, 5])).toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4, 5]);
    });
    test.done();
};

exports['constructor from iterator - error'] = function (test) {
    test.expect(2);
    _(createTestIterator([1, 2, 3, 4, 5], new Error('Error at index 2'))).errors(function (err) {
        test.equals(err.message, 'Error at index 2');
    }).toArray(function (xs) {
        test.same(xs, [1, 2]);
    });
    test.done();
};

exports['constructor from iterator - final return falsy'] = function (test) {
    test.expect(1);
    _(createTestIterator([1, 2, 3, 4, 5], void 0, 0)).toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4, 5, 0]);
    });
    test.done();
};

//ES6 iterators Begin
if (global.Map && global.Symbol) {

    exports['constructor from Map'] = function (test) {
        test.expect(1);
        var map = new Map();
        map.set('a', 1);
        map.set('b', 2);
        map.set('c', 3);

        _(map).toArray(function (xs) {
            test.same(xs, [ [ 'a', 1 ], [ 'b', 2 ], [ 'c', 3 ] ]);
        });
        test.done();
    };

    exports['constructor from Map iterator'] = function (test) {
        test.expect(1);
        var map = new Map();
        map.set('a', 1);
        map.set('b', 2);
        map.set('c', 3);

        _(map.entries()).toArray(function (xs) {
            test.same(xs, [ [ 'a', 1 ], [ 'b', 2 ], [ 'c', 3 ] ]);
        });
        test.done();
    };

    exports['constructor from empty Map iterator'] = function (test) {
        test.expect(1);
        var map = new Map();

        _(map.entries()).toArray(function (xs) {
            test.same(xs, []);
        });
        test.done();
    };

}

if (global.Set && global.Symbol) {

    exports['constructor from Set'] = function (test) {
        test.expect(1);
        var sett = new Set([1, 2, 2, 3, 4]);

        _(sett).toArray(function (xs) {
            test.same(xs, [1, 2, 3, 4]);
        });
        test.done();
    };

    exports['constructor from Set iterator'] = function (test) {
        test.expect(1);
        var sett = new Set([1, 2, 2, 3, 4]);

        _(sett.values()).toArray(function (xs) {
            test.same(xs, [1, 2, 3, 4]);
        });
        test.done();
    };

    exports['constructor from empty Map iterator'] = function (test) {
        test.expect(1);
        var sett = new Set();

        _(sett.values()).toArray(function (xs) {
            test.same(xs, []);
        });
        test.done();
    };

}
//ES6 iterators End

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

exports['generator throws error if next called after nil'] = function (test) {
    test.expect(1);
    var nil_seen = false;
    var s = _(function(push, next) {
        // Ensure that next after nil is only called once
        if (nil_seen) {
            return;
        }
        push(null, 1);
        nil_seen = true;
        push(null, _.nil);
        next();
    });
    test.throws(function() {
        s.resume();
    });
    test.done();
};

exports['generator throws error if push called after nil'] = function (test) {
    test.expect(1);
    var s = _(function(push, next) {
        push(null, 1);
        push(null, _.nil);
        push(null, 2);
    });
    test.throws(function() {
        s.resume();
    });
    test.done();
};

exports['consume throws error if push called after nil'] = function (test) {
    test.expect(1);
    var s = _([1,2,3]);
    var s2 = s.consume(function (err, x, push, next) {
        push(null, x);
        if (x === _.nil) {
            push(null, 4);
        } else {
            next();
        }
    });
    test.throws(function () {
        s2.resume();
    });
    test.done();
};

exports['consume throws error if next called after nil'] = function (test) {
    test.expect(1);
    var s = _([1,2,3]);
    var nil_seen = false;
    var s2 = s.consume(function (err, x, push, next) {
        // ensure we only call `next` after nil once
        if (nil_seen) {
            return;
        }
        if (x === _.nil) {
            nil_seen = true;
        }
        push(null, x);
        next();
    });
    test.throws(function () {
        s2.resume();
    });
    test.done();
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

exports['errors - rethrows + forwarding different stream'] = function (test) {
    test.expect(1);
    var err1 = new Error('one');
    var s = _(function (push, next) {
        push(err1);
        push(null, _.nil);
    }).errors(function (err, push) { push(err); });

    var s2 = _(function (push, next) {
        s.pull(function (err, val) {
            push(err, val);
            if (val !== _.nil)
                next();
        });
    });

    test.throws(function () {
        s2.toArray(function () {
            test.ok(false, 'should not be called');
        });
    }, 'one');
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

exports['stopOnError - rethrows + forwarding different stream'] = function (test) {
    test.expect(1);
    var err1 = new Error('one');
    var s = _(function (push, next) {
        push(err1);
        push(null, _.nil);
    }).stopOnError(function (err, push) { push(err); });

    var s2 = _(function (push, next) {
        s.pull(function (err, val) {
            push(err, val);
            if (val !== _.nil)
                next();
        });
    });

    test.throws(function () {
        s2.toArray(function () {
            test.ok(false, 'should not be called');
        });
    }, 'one');
    test.done();
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

exports['apply - varargs'] = function (test) {
    _([1,2,3,4]).apply(function (a, b) {
        test.equal(arguments.length, 4);
        test.equal(a, 1);
        test.equal(b, 2);
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

exports['take - noValueOnError'] = noValueOnErrorTest(_.take(1));

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

exports['drop'] = {
    setUp: function (cb) {
        this.input = [1, 2, 3, 4, 5];
        this.expected = [3, 4, 5];
        this.tester = function (expected, test) {
            return function (xs) {
                test.same(xs, expected);
            };
        };
        cb();
    },
    'arrayStream': function (test) {
        test.expect(1);
        _(this.input).drop(2).toArray(this.tester(this.expected, test));
        test.done();
    },
    'partial application': function (test) {
        test.expect(1);
        var s = _(this.input);
        _.drop(2)(s).toArray(this.tester(this.expected, test));
        test.done();
    },
    'error': function (test) {
        test.expect(2);
        var s = _(function (push, next) {
            push(null, 1),
            push(new Error('Drop error')),
            push(null, 2),
            push(null, 3),
            push(null, 4),
            push(null, 5),
            push(null, _.nil)
        });
        s.drop(2).errors(errorEquals(test, 'Drop error'))
            .toArray(this.tester(this.expected, test));
        test.done();
    },
    'noValueOnError': noValueOnErrorTest(_.drop(2))
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

exports['head - noValueOnError'] = noValueOnErrorTest(_.head());

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

exports['done'] = function (test) {
    test.expect(3);

    var calls = [];
    _.map(function (x) {
        calls.push(x);
        return x;
    }, [1,2,3]).done(function () {
        test.same(calls, [1, 2, 3]);
    });

    calls = [];
    _.each(function (x) {
        calls.push(x);
    }, [1,2,3]).done(function () {
        test.same(calls, [1,2,3]);
    });

    // partial application
    calls = [];
    _.each(function (x) {
        calls.push(x);
    })([1,2,3]).done(function () {
        test.same(calls, [1,2,3]);
    });

    test.done();
}

exports['done - ArrayStream'] = function (test) {
    var calls = [];
    _([1,2,3]).each(function (x) {
        calls.push(x);
    }).done(function () {
        test.same(calls, [1,2,3]);
        test.done();
    });
}

exports['done - GeneratorStream'] = function (test) {
    function delay(push, ms, x) {
        setTimeout(function () {
            push(null, x);
        }, ms);
    }
    var source = _(function (push, next) {
        delay(push, 10, 1);
        delay(push, 20, 2);
        delay(push, 30, 3);
        delay(push, 40, _.nil);
    });

    var calls = [];
    source.each(function (x) {
        calls.push(x);
    }).done(function () {
        test.same(calls, [1,2,3]);
        test.done();
    })
}

exports['done - throw error if consumed'] = function (test) {
    var e = new Error('broken');
    var s = _(function (push, next) {
        push(null, 1);
        push(e);
        push(null, 2);
        push(null, _.nil);
    });
    test.throws(function () {
        s.done(function () {});
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

exports['wrap node stream with error'] = function (test) {
    test.expect(1);
    var readable = streamify([1,2,3,4]);
    var err = new Error('nope');
    var xs = _(readable);
    readable.emit('error', err);

    xs.stopOnError(function (e) {
        test.strictEqual(err, e);
        test.done();
    }).each(function () {});
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

exports['sequence - noValueOnError'] = noValueOnErrorTest(_.sequence());

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

exports['observe - paused observer should not block parent (issue #215)'] = function (test) {
    test.expect(4);
    var s = _([1, 2, 3]),
        o1 = s.observe(),
        o2 = s.observe();

    var pulled = false;

    // Pull once in o1. This will pause o1. It should not
    // put backpressure on s.
    o1.pull(_.compose(markPulled, valueEquals(test, 1)));
    test.same(pulled, false, 'The pull should not have completed yet.');

    o2.toArray(function (arr) {
        pulled = true;
        test.same(arr, [1, 2, 3]);
    });
    test.same(pulled, false, 'The toArray should not have completed yet.');

    s.resume();
    test.done();

    function markPulled() {
        pulled = true;
    }
};

exports['observe - observers should see errors.'] = function (test) {
    test.expect(2);
    var s = _(function (push, next) {
        push(new Error('error'));
        push(null, _.nil);
    });

    var o = s.observe();
    s.resume();

    o.pull(errorEquals(test, 'error'));
    o.pull(valueEquals(test, _.nil));
    test.done();
};

exports['observe - observers should be destroyed (issue #208)'] = function (test) {
    test.expect(6);
    var s = _([]),
    o = s.observe();
    o2 = o.observe();

    test.same(o2.source, o, 'o2.source should not be null before destroy.');
    test.same(o._observers, [o2], 'o._observers should not be empty before destroy.');
    test.same(s._observers, [o], 'source._observers should not be empty before destroy.');

    o.destroy();

    test.same(o2.source, null, 'o2.source should be null after destroy.');
    test.same(o._observers, [], 'o._observers should be empty after destroy.');
    test.same(s._observers, [], 'source._observers should be empty after destroy.');
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

exports['flatten - noValueOnError'] = noValueOnErrorTest(_.flatten());

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

exports['otherwise - noValueOnError'] = noValueOnErrorTest(_.otherwise(_([])));

exports['otherwise - ArrayStream'] = function (test) {
    test.expect(5);
    _([1,2,3]).otherwise([4,5,6]).toArray(function (xs) {
        test.same(xs, [1,2,3]);
    });
    _([]).otherwise([4,5,6]).toArray(function (xs) {
        test.same(xs, [4,5,6]);
    });
    _([4,5,6]).otherwise([]).otherwise([]).toArray(function (xs) {
        test.same(xs, [4,5,6]);
    });
    _([]).otherwise([4,5,6]).otherwise([]).toArray(function (xs) {
        test.same(xs, [4,5,6]);
    });
    _([]).otherwise([]).otherwise([4,5,6]).toArray(function (xs) {
        test.same(xs, [4,5,6]);
    });
    test.done();
};

exports['otherwise - Redirect'] = function(test) {
    test.expect(3);
    _(function (push, next) {
        next(_([1,2,3]));
    }).otherwise([]).toArray(function (xs) {
        test.same(xs, [1,2,3]);
    });
    _(function (push, next) {
        next(_([1,2,3]));
    }).otherwise([4,5,6]).toArray(function (xs) {
        test.same(xs, [1,2,3]);
    });
    _(function (push, next) {
        next(_([]));
    }).otherwise([4,5,6]).toArray(function (xs) {
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

exports['otherwise - function'] = function (test) {
    test.expect(4);
    var calls = 0;
    _([1,2,3]).otherwise(function() {
        calls++;
        return _([4,5,6]);
    }).toArray(function (xs) {
        test.same(calls, 0);
        test.same(xs, [1,2,3]);
    });

    var calls2 = 0;
    _([]).otherwise(function() {
        calls2++;
        return _([4,5,6]);
    }).toArray(function (xs) {
        test.same(calls2, 1);
        test.same(xs, [4,5,6]);
    });

    test.done();
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

exports['append - noValueOnError'] = noValueOnErrorTest(_.append(1), [1]);

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

exports['reduce - noValueOnError'] = noValueOnErrorTest(_.reduce(0, _.add), [0]);

exports['reduce - argument function throws'] = function (test) {
    test.expect(2);
    var err = new Error('error');
    var s = _([1,2,3,4,5]).reduce(0, function (memo, x) {
        if (x === 3) throw err;
        return memo + x;
    });

    s.pull(errorEquals(test, 'error'));
    s.pull(valueEquals(test, _.nil));
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
    test.expect(3);
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
    // single argument
    _.reduce1(add, [1]).toArray(function (xs) {
        test.same(xs, [1]);
    });
    test.done();
};

exports['reduce1 - noValueOnError'] = noValueOnErrorTest(_.reduce1(_.add));


exports['reduce1 - argument function throws'] = function (test) {
    test.expect(2);
    var err = new Error('error');
    var s = _([1,2,3,4,5]).reduce1(function (memo, x) {
        if (x === 3) throw err;
        return memo + x;
    });

    s.pull(errorEquals(test, 'error'));
    s.pull(valueEquals(test, _.nil));
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

exports['scan - noValueOnError'] = noValueOnErrorTest(_.scan(0, _.add), [0]);

exports['scan - argument function throws'] = function (test) {
    test.expect(5);
    var err = new Error('error');
    var s = _([1,2,3,4,5]).scan(0, function (memo, x) {
        if (x === 3) throw err;
        return memo + x;
    });

    s.pull(valueEquals(test, 0));
    s.pull(valueEquals(test, 1));
    s.pull(valueEquals(test, 3));
    s.pull(errorEquals(test, 'error'));
    s.pull(valueEquals(test, _.nil));
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
    test.expect(3);
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
    // single argument
    _.scan1(add, [1]).toArray(function (xs) {
        test.same(xs, [1]);
    });
    test.done();
};

exports['scan1 - noValueOnError'] = noValueOnErrorTest(_.scan1(_.add));

exports['scan1 - argument function throws'] = function (test) {
    test.expect(4);
    var err = new Error('error');
    var s = _([1,2,3,4,5]).scan1(function (memo, x) {
        if (x === 3) throw err;
        return memo + x;
    });

    s.pull(valueEquals(test, 1));
    s.pull(valueEquals(test, 3));
    s.pull(errorEquals(test, 'error'));
    s.pull(valueEquals(test, _.nil));
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

exports['collect - noValueOnError'] = noValueOnErrorTest(_.collect(), [[]]);

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

exports['transduce'] = {
    setUp: function (cb) {
        var self = this;
        this.xf = transducers.map(_.add(1));
        this.input = [1, 2, 3];
        this.expected = [2, 3, 4];
        this.tester = function (expected, test) {
            return function (xs) {
                test.same(xs, expected);
            };
        };
        cb();
    },
    'ArrayStream': function (test) {
        test.expect(1);
        _(this.input)
            .transduce(this.xf)
            .toArray(this.tester(this.expected, test));
        test.done();
    },
    'GeneratorStream': function (test) {
        test.expect(1);
        generatorStream(this.input, 10)
            .transduce(this.xf)
            .toArray(this.tester(this.expected, test));
        setTimeout(test.done.bind(test), 10 * (this.input.length + 2));
    },
    'partial application': function (test) {
        test.expect(1);
        _.transduce(this.xf)(this.input)
            .toArray(this.tester(this.expected, test));
        test.done();
    },
    'passThroughError': function (test) {
        test.expect(4);
        var s = _([1, 2, 3]).map(function (x) {
            if (x === 2) {
                throw new Error('error');
            }
            return x;
        }).transduce(this.xf);

        s.pull(valueEquals(test, 2));
        s.pull(errorEquals(test, 'error'));
        s.pull(valueEquals(test, 4));
        s.pull(valueEquals(test, _.nil));
        test.done();
    },
    'stopOnStepError': function (test) {
        test.expect(3);
        var s = _([1, 2, 3]).transduce(xf);

        s.pull(valueEquals(test, 1));
        s.pull(errorEquals(test, 'error'));
        s.pull(valueEquals(test, _.nil));
        test.done();

        function xf(transform) {
            return {
                '@@transducer/init': transform['@@transducer/init'].bind(transform),
                '@@transducer/result': transform['@@transducer/result'].bind(transform),
                '@@transducer/step': function (result, x) {
                    if (x === 2) {
                        throw new Error('error');
                    }
                    result = transform['@@transducer/step'](result, x);
                    return result;
                }
            };
        }
    },
    'stopOnResultError': function (test) {
        test.expect(5);
        var s = _([1, 2, 3]).transduce(xf);

        s.pull(valueEquals(test, 1));
        s.pull(valueEquals(test, 2));
        s.pull(valueEquals(test, 3));
        s.pull(errorEquals(test, 'error'));
        s.pull(valueEquals(test, _.nil));
        test.done();

        function xf(transform) {
            return {
                '@@transducer/init': transform['@@transducer/init'].bind(transform),
                '@@transducer/result': function (result) {
                    transform['@@transducer/result'](result);
                    throw new Error('error');
                },
                '@@transducer/step': transform['@@transducer/step'].bind(transform)
            };
        }
    },
    'early termination': function (test) {
        test.expect(1);
        var xf = transducers.take(1);
        _([1, 2, 3])
            .transduce(xf)
            .toArray(this.tester([1], test));
        test.done();
    },
    'wrapped memo': function (test) {
        test.expect(2);
        _(this.input)
            .transduce(transducers.comp(this.xf, wrap))
            .toArray(this.tester(this.expected, test));

        _(this.input)
            .transduce(transducers.comp(wrap, this.xf))
            .toArray(this.tester(this.expected, test));
        test.done();

        function wrap(transform) {
            return {
                '@@transducer/init': function () {
                    return wrapMemo(transform['@@transducer/init']());
                },
                '@@transducer/result': function (result) {
                    return wrapMemo(transform['@@transducer/result'](result.memo));
                },
                '@@transducer/step': function (result, x) {
                    var res = transform['@@transducer/step'](result.memo, x);
                    if (res['@@transducer/reduced']) {
                        return {
                            '@@transducer/reduced': true,
                            '@@transducer/value': wrapMemo(res['@transducer/value'])
                        };
                    }
                    else {
                        return wrapMemo(res);
                    }
                }
            };
        }

        function wrapMemo(x) {
            return {
                memo: x
            };
        }
    },
    'noValueOnError': function (test) {
        noValueOnErrorTest(_.transduce(this.xf))(test);
    }
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

exports['concat - noValueOnError'] = noValueOnErrorTest(_.concat([1]), [1]);

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

    test.strictEqual(s1._readableState.buffer.length, 0);
    test.strictEqual(s1._readableState.reading, false);
    test.strictEqual(s2._readableState.buffer.length, 0);
    test.strictEqual(s2._readableState.reading, false);

    var s3 = _.concat(s2, s1);
    test.ok(
        s1._readableState.buffer[0] === 1 || // node 0.11.x
        s1._readableState.buffer.length === 0 // node 0.10.x
    );
    test.strictEqual(s1._readableState.reading, false);
    test.ok(
        s2._readableState.buffer[0] === 3 || // node 0.11.x
        s2._readableState.buffer.length === 0 // node 0.10.x
    );
    test.strictEqual(s2._readableState.reading, false);

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
            }, 100);
        });
        var counter2 = 0;
        var s2 = _(function (push, next) {
            counter2++;
            setTimeout(function () {
                push(null, counter2);
                next();
            }, 240);
        });
        var self = this;
        _([s1, s2]).merge().take(4).toArray(function (xs) {
            test.same(xs, [1, 2, 1, 3]);
            setTimeout(function () {
                test.equal(counter1, 3);
                test.equal(counter2, 2);
                test.done();
            }, 1000);
        });
        this.clock.tick(2000);
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
    },
    'generator generating sources synchronously': function(test) {
      var srcs = _(function (push, next) {
          push(null, _([1, 2, 3]));
          push(null, _([3, 4, 5]));
          push(null, _([6, 7, 8]));
          push(null, _([9, 10, 11]));
          push(null, _([12, 13, 14]));
          push(null, _.nil);
      })
      srcs.merge().toArray(function(xs) {
        test.same(xs, [ 1, 3, 6, 9, 12, 2, 4, 7, 10, 13, 3, 5, 8, 11, 14 ]);
        test.done();
      });
    },
    'github issue #124: detect late end of stream': function(test) {
      var s = _([1,2,3])
              .map(function(x) { return _([x]) })
              .merge()

      s.toArray(function(xs) {
        test.same(xs, [1,2,3]);
        test.done();
      })
    },
    'handle backpressure': function (test) {
        var s1 = _([1,2,3,4]);
        var s2 = _([5,6,7,8]);
        var s = _.merge([s1, s2]);
        s.take(5).toArray(function (xs) {
            test.same(xs, [1,5,2,6,3]);
            _.setImmediate(function () {
                test.equal(s._outgoing.length, 0);
                test.equal(s._incoming.length, 1);
                test.equal(s1._incoming.length, 2);
                test.equal(s2._incoming.length, 2);
                test.done();
            });
        });
        this.clock.tick(100);
    },
    'fairer merge algorithm': function (test) {
        // make sure one stream with many buffered values doesn't crowd
        // out another stream being merged
        var s1 = _([1,2,3,4]);
        s1.id = 's1';
        var s2 = _(function (push, next) {
            setTimeout(function () {
                push(null, 5);
                push(null, 6);
                setTimeout(function () {
                    push(null, 7);
                    push(null, 8);
                    push(null, _.nil);
                }, 100);
            }, 100);
        });
        s2.id = 's2';
        var s = _([s1, s2]).merge();
        s.id = 's';
        s.take(1).toArray(function (xs) {
            test.same(xs, [1]);
            setTimeout(function () {
                s.take(4).toArray(function (xs) {
                    test.same(xs, [5,2,6,3]);
                    s.toArray(function (xs) {
                        test.same(xs, [4,7,8]);
                        test.done();
                    });
                });
            }, 150);
        });
        this.clock.tick(400);
    },
    'noValueOnError': noValueOnErrorTest(_.merge()),
    'pass through errors (issue #141)': function (test) {
        test.expect(1);

        var s = _(function (push, next) {
            push(new Error);
            push(null, _.nil);
        });
        _([s])
            .merge()
            .errors(anyError(test))
            .each(test.ok.bind(test, false, 'each should not be called'));
        test.done();
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

exports['invoke - noValueOnError'] = noValueOnErrorTest(_.invoke('toString', []));

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

exports['nfcall'] = function (test) {
    test.expect(4);

    function add(n) {
        return function(state, push) {
            state.val += n;
            push(null, n);
        }
    }

    var state = {val: 0};
    _.nfcall([state], [add(1), add(2)]).series().toArray(function (xs) {
        test.equals(state.val, 3);
        test.same(xs, [1, 2]);
    });
    // partial application
    _.nfcall([state])([add(3), add(4)]).series().toArray(function (xs) {
        test.equals(state.val, 10);
        test.same(xs, [3, 4]);
    });
    test.done();
};

exports['nfcall - noValueOnError'] = noValueOnErrorTest(_.nfcall([]));

exports['nfcall - ArrayStream'] = function (test) {
    function add(n) {
        return function(state, push) {
            state.val += n;
            return push(null, n);
        }
    }

    var state = {val: 0};
    _([add(1), add(2)]).nfcall([state]).series().toArray(function (xs) {
        test.equals(state.val, 3);
        test.same(xs, [1, 2]);
        test.done();
    });
};

exports['nfcall - GeneratorStream'] = function (test) {
    function add(n) {
        return function(state, push) {
            state.val += n;
            return push(null, n);
        }
    }

    var s = _(function (push, next) {
        push(null, add(1));
        setTimeout(function () {
            push(null, add(2));
            push(null, _.nil);
        }, 10);
    });

    var state = {val: 0};
    s.nfcall([state]).series().toArray(function (xs) {
        test.equals(state.val, 3);
        test.same(xs, [1, 2]);
        test.done();
    });
};

exports['nfcall - parallel result ordering'] = function (test) {
    _([
        function (callback) {
            setTimeout(function () {
                callback(null, 'one');
            }, 20);
        },
        function (callback) {
            setTimeout(function () {
                callback(null, 'two');
            }, 10);
        }
    ]).nfcall([]).parallel(2).toArray(function (xs) {
        test.same(xs, ['one', 'two']);
        test.done();
    });
}

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

exports['map - noValueOnError'] = noValueOnErrorTest(_.map(function (x) { return x }));

exports['map - argument function throws'] = function (test) {
    test.expect(6);
    var err = new Error('error');
    var s = _([1,2,3,4,5]).map(function (x) {
        if (x === 3) throw err;
        return x + 1;
    });

    s.pull(valueEquals(test, 2));
    s.pull(valueEquals(test, 3));
    s.pull(errorEquals(test, 'error'));
    s.pull(valueEquals(test, 5));
    s.pull(valueEquals(test, 6));
    s.pull(valueEquals(test, _.nil));
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

exports['doto'] = function (test) {
    test.expect(4);

    var seen;
    function record(x) {
        seen.push(x * 2);
    }

    seen = [];
    _.doto(record, [1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4]);
        test.same(seen, [2, 4, 6, 8]);
    });

    // partial application
    seen = [];
    _.doto(record)([1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4]);
        test.same(seen, [2, 4, 6, 8]);
    });
    test.done();
};

exports['doto - noValueOnError'] = noValueOnErrorTest(_.doto(function (x) { return x }));

exports['tap - doto alias'] = function (test) {
    test.expect(2);

    test.strictEqual(_.tap, _.doto);
    test.strictEqual(_([]).tap, _([]).doto);

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

exports['flatMap - noValueOnError'] = noValueOnErrorTest(_.flatMap(function (x) { return _() }));

exports['flatMap - argument function throws'] = function (test) {
    test.expect(4);
    var err = new Error('error');
    var s = _([1,2,3,4]).flatMap(function (x) {
        if (x === 1) return _([x]);
        if (x === 2) throw err;
        if (x === 3) return _([]);
        return true;
    });

    s.pull(valueEquals(test, 1));
    s.pull(errorEquals(test, 'error'));
    s.pull(anyError(test));
    s.pull(valueEquals(test, _.nil));
    test.done();
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

exports['pluck - noValueOnError'] = noValueOnErrorTest(_.pluck('foo'));

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


exports['pick'] = function (test) {
    test.expect(2);
    var a = _([
        {breed: 'chihuahua', name: 'Princess', age: 5},
        {breed: 'labrador', name: 'Rocky', age: 3},
        {breed: 'german-shepherd', name: 'Waffles', age: 9}
    ]);
    a.pick(['breed', 'age']).toArray(function (xs) {
        test.deepEqual(xs, [
          {breed: 'chihuahua', age: 5},
          {breed: 'labrador',  age: 3},
          {breed: 'german-shepherd', age: 9}
        ]);
    });

    var b = _([
        Object.create({breed: 'chihuahua', name: 'Princess', age: 5}),
        {breed: 'labrador', name: 'Rocky', age: 3},
        {breed: 'german-shepherd', name: 'Waffles', age: 9}
    ]);

    b.pick(['breed', 'age']).toArray(function (xs) {
        test.deepEqual(xs, [
            {breed: 'chihuahua', age: 5},
            {breed: 'labrador',  age: 3},
            {breed: 'german-shepherd', age: 9}
        ]);
    });

    test.done();
};

exports['pick - noValueOnError'] = noValueOnErrorTest(_.pick(['plug']));

exports['pick - non-existant property'] = function (test) {
    test.expect(8);

    var a = _([
        {breed: 'labrador', name: 'Rocky'} // <- missing age
    ]);

    a.pick(['breed', 'age']).toArray(function (xs) {
        test.equal(xs[0].breed, 'labrador');
        test.ok(Object.keys(xs[0]).length === 1);
    });

    a.pick(['age']).toArray(function (xs) {
        test.ok(Object.keys(xs[0]).length === 0);
    });

    var b = _([
        {breed: 'labrador', age: void 0}
    ]);

    b.pick(['breed', 'age']).toArray(function (xs) {
        test.equal(xs[0].breed, 'labrador');
        test.ok(xs[0].hasOwnProperty('age'));
        test.ok(typeof(xs[0].age) === 'undefined');
    });

    var c = _([
        {}
    ]);

    c.pick(['age']).toArray(function (xs) {
        test.ok(Object.keys(xs[0]).length === 0);
    });

    var noProtoObj = Object.create(null);
    noProtoObj.breed = 'labrador';
    noProtoObj.name = 'Rocky';

    var d = _([
        noProtoObj
    ]);

    d.pick(['breed', 'age']).toArray(function (xs) {
        test.equal(xs[0].breed, 'labrador')
        test.ok(Object.keys(xs[0]).length === 1);
    });

    test.done();
};

exports['pickBy'] = function (test) {
    test.expect(4);

    var objs = [{a: 1, _a: 2}, {a: 1, _c: 3}];

    _(objs).pickBy(function (key) {
        return key.indexOf('_') === 0;
    }).toArray(function (xs) {
        test.deepEqual(xs, [{_a: 2}, {_c: 3}]);
    });

    var objs2 = [{a: 1, b: {c: 2}}, {a: 1, b: {c: 4}}, {d: 1, b: {c: 9}}];

    _(objs2).pickBy(function (key, value) {
        if (key === 'b' && typeof value.c !== 'undefined') {
            return value.c > 3;
        }
        return false;
    }).toArray(function (xs) {
        test.deepEqual(xs, [{}, {b: {c: 4}}, {b: {c: 9}}]);
    });

    var noProtoObj = Object.create(null);
    noProtoObj.a = 1;
    noProtoObj.b = {c: 4};

    var objs3 = _([{a: 1, b: {c: 2}}, noProtoObj, {d: 1, b: {c: 9}}]);

    objs3.pickBy(function (key, value) {
        if (key === 'b' && typeof value.c !== 'undefined') {
            return value.c > 3;
        }
        return false;
    }).toArray(function (xs) {
        test.deepEqual(xs, [{}, {b: {c: 4}}, {b: {c: 9}}]);
    });

    var objs4 = [Object.create({a: 1, _a: 2}), {a: 1, _c: 3}];

    _(objs4).pickBy(function (key) {
        return key.indexOf('_') === 0;
    }).toArray(function (xs) {
        test.deepEqual(xs, [{_a: 2}, {_c: 3}]);
    });

    test.done();
};

exports['pickBy - noValueOnError'] = noValueOnErrorTest(_.pickBy(' '));

exports['pickBy - non-existant property'] = function (test) {
    test.expect(3);

    var objs = [{a: 1, b: 2}, {a: 1, d: 3}];

    _(objs).pickBy(function (key) {
        return key.indexOf('_') === 0;
    }).toArray(function (xs) {
        test.deepEqual(xs, [{}, {}]);
    });

    var objs2 = [{a: 1, b: {c: 2}}, {a: 1, b: {c: 4}}, {d: 1, b: {c: 9}}];

    _(objs2).pickBy(function (key, value) {
        if (key === 'b' && typeof value.c !== 'undefined') {
            return value.c > 10;
        }
        return false;
    }).toArray(function (xs) {
        test.deepEqual(xs, [{}, {}, {}]);
    });

    var objs3 = [{}, {}];

    _(objs3).pickBy(function (key) {
        return key.indexOf('_') === 0;
    }).toArray(function (xs) {
        test.deepEqual(xs, [{}, {}]);
    });

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

exports['filter - noValueOnError'] = noValueOnErrorTest(_.filter(function (x) { return true }));

exports['filter - argument function throws'] = function (test) {
    test.expect(3);
    var err = new Error('error');
    var s = _([1,2,3]).filter(function (x) {
        if (x === 2) throw err;
        if (x === 3) return false;
        return true;
    });

    s.pull(valueEquals(test, 1));
    s.pull(errorEquals(test, 'error'));
    s.pull(valueEquals(test, _.nil));
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

exports['flatFilter - noValueOnError'] = noValueOnErrorTest(_.flatFilter(function (x) { return _([true]) }));

exports['flatFilter - argument function throws'] = function (test) {
    test.expect(4);
    var err = new Error('error');
    var s = _([1,2,3,4]).flatFilter(function (x) {
        if (x === 1) return _([false]);
        if (x === 2) throw err;
        if (x === 3) return _([]);
        return true;
    });

    s.pull(errorEquals(test, 'error'));
    s.pull(anyError(test));
    s.pull(anyError(test));
    s.pull(valueEquals(test, _.nil));
    test.done();
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

exports['reject - noValueOnError'] = noValueOnErrorTest(_.reject(function (x) { return false }));

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

exports['find - noValueOnError'] = noValueOnErrorTest(_.find(function (x) { return true }));

exports['find - argument function throws'] = function (test) {
    test.expect(4);
    var err = new Error('error');
    var s = _([1,2,3,4,5]).find(function (x) {
        if (x < 3) throw err;
        return true;
    });

    s.pull(errorEquals(test, 'error'));
    s.pull(errorEquals(test, 'error'));
    s.pull(valueEquals(test, 3));
    s.pull(valueEquals(test, _.nil));
    test.done();
};

exports['find - ArrayStream'] = function (test) {
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
        test.done();
    });
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

    var noProtoObj = Object.create(null);
    noProtoObj.type = 'foo';
    noProtoObj.name = 'wibble';

    var xsNoProto = [
        noProtoObj,
        {type: 'foo', name: 'wobble'},
        {type: 'bar', name: '123'},
        {type: 'bar', name: 'asdf'},
        {type: 'baz', name: 'asdf'}
    ];

    var primatives = [1,2,3,'cat'];

    var pexpected = {1: [1], 2: [2], 3: [3], 'cat': ['cat']};
    var pexpectedUndefined = { 'undefined': [ 1, 2, 3, 'cat' ] };

    var f = function (x) {
        return x.type;
    };

    var pf = function (o) { return o };

    var s = 'type';

    exports['group'] = function (test) {
        test.expect(8);

        _.group(f, xs).toArray(function (xs) {
            test.same(xs, [expected]);
        });
        _.group(s, xs).toArray(function (xs) {
            test.same(xs, [expected]);
        });
        _.group(f, xsNoProto).toArray(function (xs) {
            test.same(xs, [expected]);
        });
        _.group(s, xsNoProto).toArray(function (xs) {
            test.same(xs, [expected]);
        });

        // partial application
        _.group(f)(xs).toArray(function (xs) {
            test.same(xs, [expected]);
        });
        _.group(s)(xs).toArray(function (xs) {
            test.same(xs, [expected]);
        });
        _.group(f)(xsNoProto).toArray(function (xs) {
            test.same(xs, [expected]);
        });
        _.group(s)(xsNoProto).toArray(function (xs) {
            test.same(xs, [expected]);
        });
        test.done();
    };

    exports['group - noValueOnError'] = noValueOnErrorTest(_.group('foo'), [{}]);

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

    exports['group - argument function throws'] = function (test) {
        test.expect(2);
        var err = new Error('error');
        var s = _([1,2,3,4,5]).group(function (x) {
            if (x === 5) throw err
            return x % 2 == 0 ? 'even' : 'odd';
        });

        s.pull(errorEquals(test, 'error'));
        s.pull(valueEquals(test, _.nil));
        test.done();
    };

    exports['group - ArrayStream'] = function (test) {
        test.expect(2);

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

exports['compact - noValueOnError'] = noValueOnErrorTest(_.compact());

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

exports['where - noValueOnError'] = noValueOnErrorTest(_.where({'foo': 'bar'}));

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

exports['findWhere'] = function (test) {
    test.expect(2);
    var xs = [
        {type: 'foo', name: 'wibble'},
        {type: 'foo', name: 'wobble'},
        {type: 'bar', name: '123'},
        {type: 'bar', name: 'asdf'},
        {type: 'baz', name: 'asdf'}
    ];
    _.findWhere({type: 'bar'}, xs).toArray(function (xs) {
        test.same(xs, [{type: 'bar', name: '123'}]);
    });
    // partial application
    _.findWhere({type: 'bar'})(xs).toArray(function (xs) {
        test.same(xs, [{type: 'bar', name: '123'}]);
    });
    test.done();
};

exports['findWhere - noValueOnError'] = noValueOnErrorTest(_.findWhere({'foo': 'bar'}));

exports['findWhere - ArrayStream'] = function (test) {
    test.expect(2);
    var xs = [
        {type: 'foo', name: 'wibble'},
        {type: 'foo', name: 'wobble'},
        {type: 'bar', name: '123'},
        {type: 'bar', name: 'asdf'},
        {type: 'baz', name: 'asdf'}
    ];
    _(xs).findWhere({type: 'bar'}).toArray(function (xs) {
        test.same(xs, [{type: 'bar', name: '123'}]);
    });
    _(xs).findWhere({type: 'bar', name: 'asdf'}).toArray(function (xs) {
        test.same(xs, [{type: 'bar', name: 'asdf'}]);
    });
    test.done();
};

exports['findWhere - GeneratorStream'] = function (test) {
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
    _(xs).findWhere({name: 'asdf'}).toArray(function (xs) {
        test.same(xs, [{type: 'bar', name: 'asdf'}]);
        test.done();
    });
};

exports['uniqBy'] = function(test) {
    test.expect(1);
    var xs = [ 'blue', 'red', 'red', 'yellow', 'blue', 'red' ]
    _.uniqBy(function(a,b) { return a[1] === b[1] }, xs).toArray(function(xs) {
      test.same(xs, [ 'blue', 'red' ])
    })
    test.done();
};

exports['uniqBy - compare error'] = function(test) {
    test.expect(4);
    var xs = [ 'blue', 'red', 'red', 'yellow', 'blue', 'red' ]
    var s = _.uniqBy(function(a,b) { if (a === "yellow") throw new Error('yellow'); return a === b; }, xs)
    s.pull(function(err, x) {
        test.equal(x, 'blue');
    })
    s.pull(function(err, x) {
        test.equal(x, 'red');
    })
    s.pull(function(err, x) {
        test.equal(err.message, 'yellow');
    })
    s.pull(function(err, x) {
        test.equal(x, _.nil);
    })
    test.done();
};

exports['uniqBy - noValueOnError'] = noValueOnErrorTest(_.uniqBy(function(a,b) { return a === b }));

exports['uniq'] = function(test) {
    test.expect(1);
    var xs = [ 'blue', 'red', 'red', 'yellow', 'blue', 'red' ]
    _.uniq(xs).toArray(function(xs) {
      test.same(xs, [ 'blue', 'red', 'yellow' ])
    })
    test.done();
};

exports['uniq - noValueOnError'] = noValueOnErrorTest(_.uniq());

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

exports['zip - noValueOnError'] = noValueOnErrorTest(_.zip([1]));

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

exports['zipAll'] = function (test) {
    test.expect(3);
    _.zipAll([[4, 5, 6], [7, 8, 9], [10, 11, 12]], [1,2,3]).toArray(function (xs) {
        test.same(xs, [ [ 1, 4, 7, 10 ], [ 2, 5, 8, 11 ], [ 3, 6, 9, 12 ] ]);
    });
    _.zipAll([_([4, 5, 6]), _([7, 8, 9]), _([10, 11, 12])], [1,2,3]).toArray(function (xs) {
        test.same(xs, [ [ 1, 4, 7, 10 ], [ 2, 5, 8, 11 ], [ 3, 6, 9, 12 ] ]);
    });
    // partial application
    _.zipAll([[4, 5, 6], [7, 8, 9], [10, 11, 12]])([1,2,3]).toArray(function (xs) {
        test.same(xs, [ [ 1, 4, 7, 10 ], [ 2, 5, 8, 11 ], [ 3, 6, 9, 12 ] ]);
    });
    test.done();
};

exports['zipAll - noValueOnError'] = noValueOnErrorTest(_.zipAll([1]));

exports['zipAll - StreamOfStreams'] = function (test) {
    test.expect(1);
    _.zipAll(_([[4, 5, 6], [7, 8, 9], [10, 11, 12]]), [1,2,3]).toArray(function (xs) {
        test.same(xs, [ [ 1, 4, 7, 10 ], [ 2, 5, 8, 11 ], [ 3, 6, 9, 12 ] ]);
    });
    test.done();
};

exports['zipAll - source emits error'] = function (test) {
    test.expect(2);
    var err = new Error('zip all error');
    var s1 = _([1,2,3]);
    var s2 = _(function (push) {
        push(null, [4, 5, 6]);
        push(err);
        push(null, [7, 8, 9]);
        push(null, [10, 11, 12]);
        push(null, _.nil);
    });

    s1.zipAll(s2).errors(function (err) {
        test.equal(err.message, 'zip all error');
    }).toArray(function (xs) {
        test.same(xs, [ [ 1, 4, 7, 10 ], [ 2, 5, 8, 11 ], [ 3, 6, 9, 12 ] ]);
    });
    test.done();
};

exports['zipAll - GeneratorStream'] = function (test) {
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
    var s2 = _(function (push, next) {
        setTimeout(function () {
            push(null, [4, 5, 6]);
            push(null, [7, 8, 9]);
            setTimeout(function () {
                push(null, [10, 11, 12]);
                push(null, _.nil);
            }, 50);
        }, 50);
    });

    s1.zipAll(s2).toArray(function (xs) {
        test.same(xs, [ [ 1, 4, 7, 10 ], [ 2, 5, 8, 11 ], [ 3, 6, 9, 12 ] ]);
        test.done();
    });
};

exports['zipAll - Differing length streams'] = function (test) {
    test.expect(1);
    _.zipAll([[5, 6, 7, 8], [9, 10, 11, 12], [13, 14]])([1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [[1, 5, 9, 13], [2, 6, 10, 14]]);
    });
    test.done();
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

exports['batch - noValueOnError'] = noValueOnErrorTest(_.batch(1));

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
};

exports['splitBy'] = function(test) {
    test.expect(3);
    _.splitBy('ss', ['mis', 'si', 's', 'sippi']).toArray(function(xs) {
        test.same(xs, 'mississippi'.split('ss'));
    });
    _.splitBy('foo', ['bar', 'baz']).toArray(function(xs) {
        test.same(xs, ['barbaz']);
    });
    // partial application
    _.splitBy('ss')(['mis', 'si', 's', 'sippi']).toArray(function(xs) {
        test.same(xs, 'mississippi'.split('ss'));
    });
    test.done();
};

exports['splitBy - delimiter at end of stream'] = function(test) {
    test.expect(2);
    _.splitBy('s', ['ducks']).toArray(function(xs) {
        test.same(xs, ['duck', '']);
    });
    _.splitBy('\n', ['hello\n', 'world', '\n']).toArray(function(xs) {
        test.same(xs, ['hello', 'world', '']);
    });
    test.done();
};

exports['splitBy - noValueOnError'] = noValueOnErrorTest(_.splitBy(' '));

exports['splitBy - unicode'] = function (test) {
    // test case borrowed from 'split' by dominictarr
    var unicode = new Buffer('テスト試験今日とても,よい天気で');
    var parts = [unicode.slice(0, 20), unicode.slice(20)];
    _(parts).splitBy(/,/g).toArray(function (xs) {
        test.same(xs, ['テスト試験今日とても', 'よい天気で']);
        test.done();
    });
};

exports['splitBy - ArrayStream'] = function (test) {
    test.expect(2);
    _(['mis', 'si', 's', 'sippi']).splitBy('ss').toArray(function (xs) {
        test.same(xs, 'mississippi'.split('ss'));
    });
    _(['bar', 'baz']).splitBy('foo').toArray(function (xs) {
        test.same(xs, ['barbaz']);
    });
    test.done();
};

exports['splitBy - GeneratorStream'] = function (test) {
    function delay(push, ms, x) {
        setTimeout(function () {
            push(null, x);
        }, ms);
    }
    var source = _(function (push, next) {
        delay(push, 10, 'mis');
        delay(push, 20, 'si');
        delay(push, 30, 's');
        delay(push, 40, 'sippi');
        delay(push, 50, _.nil);
    });
    source.splitBy('ss').toArray(function (xs) {
        test.same(xs, 'mississippi'.split('ss'));
        test.done();
    });
};

exports['split'] = function (test) {
    test.expect(3);
    _(['a\n', 'b\nc\n', 'd', '\ne']).split().toArray(function(xs) {
        test.same(xs, 'abcde'.split(''));
    });
    _.split(['a\n', 'b\nc\n', 'd', '\ne']).toArray(function(xs) {
        test.same(xs, 'abcde'.split(''));
    });
    // mixed CRLF + LF
    _(['a\r\nb\nc']).split().toArray(function(xs) {
        test.same(xs, 'abc'.split(''));
    });
    test.done();
};

exports['intersperse'] = function(test) {
    test.expect(4);
    _.intersperse('n', ['ba', 'a', 'a']).toArray(function (xs) {
        test.same(xs.join(''), 'banana');
    });
    _.intersperse('bar', ['foo']).toArray(function (xs) {
        test.same(xs, ['foo']);
    });
    _.intersperse('bar', []).toArray(function (xs) {
        test.same(xs, []);
    });
    // partial application
    _.intersperse('n')(['ba', 'a', 'a']).toArray(function (xs) {
        test.same(xs.join(''), 'banana');
    });
    test.done();
}

exports['intersperse - noValueOnError'] = noValueOnErrorTest(_.intersperse(1));

exports['intersperse - ArrayStream'] = function(test) {
    test.expect(3);
    _(['ba', 'a', 'a']).intersperse('n').toArray(function (xs) {
        test.same(xs.join(''), 'banana');
    });
    _(['foo']).intersperse('bar').toArray(function (xs) {
        test.same(xs, ['foo']);
    });
    _([]).intersperse('bar').toArray(function (xs) {
        test.same(xs, []);
    });
    test.done();
}

exports['intersperse - GeneratorStream'] = function(test) {
    var s1 = _(function (push, next) {
        push(null, 'ba');
        setTimeout(function () {
            push(null, 'a');
            setTimeout(function () {
                push(null, 'a');
                push(null, _.nil);
            }, 10);
        }, 10);
    });
    s1.intersperse('n').toArray(function (xs) {
        test.same(xs.join(''), 'banana');
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

exports['parallel - noValueOnError'] = noValueOnErrorTest(_.parallel(1));

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

exports['parallel consume from async generator'] = function (test) {
    function delay(push, ms, x) {
        setTimeout(function () {
            push(null, x);
        }, ms);
    }
    var source = _(function (push, next) {
        //console.log('source read');
        delay(push, 100, 1);
        delay(push, 200, 2);
        delay(push, 300, 3);
        delay(push, 400, 4);
        delay(push, 500, 5);
        delay(push, 600, _.nil);
    });
    var doubler = function (x) {
        //console.log(['doubler call', x]);
        return _(function (push, next) {
            //console.log('doubler read');
            delay(push, 50, x * 2);
            delay(push, 100, _.nil);
        });
    };
    source.map(doubler).parallel(3).toArray(function (xs) {
        test.same(xs, [2, 4, 6, 8, 10]);
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
    },
    'noValueOnError': noValueOnErrorTest(_.throttle(10))
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
    },
    'noValueOnError': noValueOnErrorTest(_.debounce(10))
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
            if (x !== _.nil) {
                setTimeout(next, 60);
            }
        });
        s3.toArray(function (xs) {
            // values at 0s, 60s, 120s
            test.same(xs, [1, 1, 'last']);
        });
        this.clock.tick(1000);
        test.done();
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
            if (x !== _.nil) {
                setTimeout(next, 60);
            }
        });
        s3.toArray(function (xs) {
            // values at 0s, 60s, 120s
            test.same(xs, [1, 1, 'last']);
        });
        this.clock.tick(1000);
        test.done();
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
            if (x !== _.nil) {
                setTimeout(next, 60);
            }
        });
        s3.toArray(function (xs) {
            // values at 0s, 60s, 120s
            test.same(xs, [1, 1, 'last']);
            test.same(errs, ['foo', 'bar']);
        });
        this.clock.tick(1000);
        test.done();
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

exports['last - noValueOnError'] = noValueOnErrorTest(_.last());

exports['sortBy'] = {
    setUp: function (cb) {
        this.input   = [5, 2, 4, 1, 3];
        this.reversed = [5, 4, 3, 2, 1];
        this.compDesc = function (a, b) {
            return b - a;
        };
        this.tester = function (expected, test) {
            return function (xs) {
                test.same(xs, expected);
            };
        };
        cb();
    },
    'arrayStream': function (test) {
        test.expect(1);
        _(this.input).sortBy(this.compDesc).toArray(this.tester(this.reversed, test));
        test.done();
    },
    'partial application': function (test) {
        test.expect(1);
        var s = _(this.input);
        _.sortBy(this.compDesc)(s).toArray(this.tester(this.reversed, test));
        test.done();
    },
    'noValueOnError': noValueOnErrorTest(_.sortBy(this.compDesc))
};

exports['sort'] = {
    setUp: function (cb) {
        this.input   = ['e', 'a', 'd', 'c', 'b'];
        this.sorted   = ['a', 'b', 'c', 'd', 'e'];
        this.tester = function (expected, test) {
            return function (xs) {
                test.same(xs, expected);
            };
        };
        cb();
    },
    'arrayStream': function (test) {
        test.expect(1);
        _(this.input).sort().toArray(this.tester(this.sorted, test));
        test.done();
    },
    'partial application': function (test) {
        test.expect(1);
        var s = _(this.input);
        _.sortBy(this.compDesc)(s).toArray(this.tester(this.sorted, test));
        test.done();
    },
    'noValueOnError': noValueOnErrorTest(_.sort())
};

exports['through'] = {
    setUp: function (cb) {
        this.parser = through(
            function (data) {
                try {
                    this.queue(JSON.parse(data));
                }
                catch (err) {
                    this.emit('error', err);
                }
            },
            function () {
                this.queue(null);
            }
        );
        this.numArray = [1, 2, 3, 4];
        this.stringArray = ['1','2','3','4'];
        this.tester = function (expected, test) {
            return function (xs) {
                test.same(xs, expected);
            };
        };
        cb();
    },
    'function': function (test) {
        test.expect(1);
        var s = _.through(function (s) {
            return s
                .filter(function (x) {
                    return x % 2;
                })
                .map(function (x) {
                    return x * 2;
                });
        }, this.numArray);
        s.toArray(this.tester([2, 6], test));
        test.done();
    },
    'function - ArrayStream': function (test) {
        test.expect(1);
        var s = _(this.numArray).through(function (s) {
            return s
                .filter(function (x) {
                    return x % 2;
                })
                .map(function (x) {
                    return x * 2;
                });
        }).through(function (s) {
                return s.map(function (x) {
                    return x + 1;
                });
            });
        s.toArray(this.tester([3, 7], test));
        test.done();
    },
    'stream': function (test) {
        test.expect(1);
        var s = _.through(this.parser, this.stringArray);
        s.toArray(this.tester(this.numArray, test));
        test.done();
    },
    'stream - ArrayStream': function (test) {
        test.expect(1);
        var s = _(this.stringArray).through(this.parser);
        s.toArray(this.tester(this.numArray, test));
        test.done();
    },
    'stream and function': function (test) {
        test.expect(1);
        var s = _(this.stringArray)
            .through(this.parser)
            .through(function (s) {
                return s.map(function (x) {
                    return x * 2;
                });
            });
        s.toArray(this.tester([2,4,6,8], test));
        test.done();
    },
    'inputstream - error': function (test) {
        test.expect(2);
        var s = _(function (push) {
            push(new Error('Input error'));
            push(null, _.nil);
        }).through(this.parser);

        s.errors(errorEquals(test, 'Input error'))
            .toArray(this.tester([], test));
        test.done();
    },
    'throughstream - error': function (test) {
        test.expect(2);
        var s = _(['zz{"a": 1}']).through(this.parser);
        s.errors(anyError(test))
            .toArray(this.tester([], test));
        test.done();
    },
    'noValueOnError': function (test) {
        noValueOnErrorTest(_.through(function (x) { return x }))(test);
    }
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
    test.expect(2);
    var obj = {
        foo: 1,
        bar: 2,
        baz: 3
    };

    var objNoProto = Object.create(null);
    objNoProto.foo = 1;
    objNoProto.bar = 2;
    objNoProto.baz = 3;


    _.keys(obj).toArray(function (xs) {
        test.same(xs, ['foo', 'bar', 'baz']);
    });

    _.keys(objNoProto).toArray(function (xs) {
        test.same(xs, ['foo', 'bar', 'baz']);
    });
    test.done();
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
    test.expect(8);
    var a = {a: 1, b: {num: 2, test: 'test'}};

    var b = Object.create(null);
    b.a = 1;
    b.b = {num: 2, test: 'test'};

    test.equal(a, _.extend({b: {num: 'foo'}, c: 3}, a));
    test.same(a, {a: 1, b: {num: 'foo'}, c: 3});
    test.equal(b, _.extend({b: {num: 'bar'}, c: 3}, b));
    test.same(b, {a: 1, b: {num: 'bar'}, c: 3});

    // partial application
    test.equal(a, _.extend({b: 'baz'})(a));
    test.same(a, {a: 1, b: 'baz', c: 3});
    test.equal(b, _.extend({b: 'bar'})(b));
    test.same(b, {a: 1, b: 'bar', c: 3});

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

exports['wrapCallback - context'] = function (test) {
    var o = {
        f: function (a, b, cb) {
            test.equal(this, o);
            setTimeout(function () {
                cb(null, a + b);
            }, 10);
        }
    };
    o.g = _.wrapCallback(o.f);
    o.g(1, 2).toArray(function (xs) {
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

exports['streamifyAll'] = {
    'throws when passed a non-function non-object': function (test) {
        test.throws(function () {
            _.streamifyAll(1);
        }, TypeError);
        test.done();
    },
    'streamifies object methods': function (test) {
        var plainObject = { fn: function (a, b, cb) { cb(null, a + b); } };
        var obj = _.streamifyAll(plainObject);
        test.equal(typeof obj.fnStream, 'function');
        obj.fnStream(1, 2).apply(function (res) {
            test.equal(res, 3);
            test.done();
        });
    },
    'streamifies constructor prototype methods': function (test) {
        function ExampleClass (a) { this.a = a; }
        ExampleClass.prototype.fn = function (b, cb) {  cb(null, this.a + b); };
        var ExampleClass = _.streamifyAll(ExampleClass);
        var obj = new ExampleClass(1);
        test.equal(typeof obj.fnStream, 'function');
        obj.fnStream(2).apply(function (res) {
            test.equal(res, 3);
            test.done();
        });
    },
    'streamifies constructor methods': function (test) {
        function ExampleClass (a) { this.a = a; }
        ExampleClass.a = 5;
        ExampleClass.fn = function (b, cb) { cb(null, this.a + b); };
        var ExampleClass = _.streamifyAll(ExampleClass);
        test.equal(typeof ExampleClass.fnStream, 'function');
        ExampleClass.fnStream(2).apply(function (res) {
            test.equal(res, 7);
            test.done();
        });
    },
    'streamifies inherited methods': function (test) {
        function Grandfather () {}
        Grandfather.prototype.fn1 = function (b, cb) { cb(null, this.a*b); };
        function Father () {}
        Father.prototype = Object.create(Grandfather.prototype);
        Father.prototype.fn2 = function (b, cb) { cb(null, this.a/b); };
        function Child (a) { this.a = a; }
        Child.prototype = Object.create(Father.prototype);
        Child.prototype.fn3 = function (b, cb) { cb(null, this.a+b); };
        var Child = _.streamifyAll(Child);
        var child = new Child(3);

        test.equal(typeof child.fn1Stream, 'function');
        test.equal(typeof child.fn2Stream, 'function');
        test.equal(typeof child.fn3Stream, 'function');
        _([child.fn1Stream(1), child.fn2Stream(2), child.fn3Stream(3)])
            .series()
            .toArray(function (arr) {
                test.deepEqual(arr, [3, 1.5, 6]);
                test.done();
            });
    },
    'does not re-streamify functions': function (test) {
        var plainObject = { fn: function (a, b, cb) { cb(null, a + b); } };
        var obj = _.streamifyAll(_.streamifyAll(plainObject));
        test.equal(typeof obj.fnStreamStream, 'undefined');
        test.done();
    },
    'does not streamify constructors': function (test) {
        function ExampleClass () {}
        ExampleClass.prototype.fn = function (cb) { cb(null, 'foo'); };
        var obj = new (_.streamifyAll(ExampleClass))();
        test.equal(typeof obj.constructorStream, 'undefined');
        test.done();
    },
    'does not streamify Object methods': function (test) {
        function ExampleClass () {}
        ExampleClass.prototype.fn = function (cb) { cb(null, 'foo'); };
        var obj1 = new (_.streamifyAll(ExampleClass))();
        var obj2 = _.streamifyAll(new ExampleClass());
        test.equal(typeof obj1.toStringStream, 'undefined');
        test.equal(typeof obj1.keysStream, 'undefined');
        test.equal(typeof obj2.toStringStream, 'undefined');
        test.equal(typeof obj2.keysStream, 'undefined');
        test.done();
    },
    "doesn't break when property has custom getter": function (test) {
        function ExampleClass (a) { this.a = { b: a }; }
        Object.defineProperty(ExampleClass.prototype, 'c',
            { get: function () { return this.a.b; } });

        test.doesNotThrow(function () {
            _.streamifyAll(ExampleClass);
        });
        test.done();
    }
};

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
