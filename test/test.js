/* eslint-disable no-unused-vars, no-shadow, no-redeclare */
var _, EventEmitter = require('events').EventEmitter,
    through = require('through'),
    sinon = require('sinon'),
    Stream = require('stream'),
    streamify = require('stream-array'),
    concat = require('concat-stream'),
    RSVP = require('rsvp'),
    Promise = RSVP.Promise,
    transducers = require('transducers-js'),
    bluebird = require('bluebird'),
    runTask = require('orchestrator/lib/runTask');

if (global.highland != null) {
    _ = global.highland;
}
else {
    _ = require('../lib/index');
}

// Use setTimeout. The default is process.nextTick, which sinon doesn't
// handle.
RSVP.configure('async', function (f, arg) {
    setTimeout(f.bind(this, arg), 1);
});

// Use bluebird cancellation. We want to test against it.
bluebird.config({
    cancellation: true
});

/**
 * Useful function to use in tests.
 */

function valueEquals(test, expected) {
    return function (err, x) {
        // Must only run one test so that users can correctly
        // compute test.expect.
        if (err) {
            test.equal(err, null, 'Expected a value to be emitted.');
        }
        else {
            test.deepEqual(x, expected, 'Incorrect value emitted.');
        }
    };
}

function errorEquals(test, expectedMsg) {
    return function (err, x) {
        if (err) {
            test.strictEqual(
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
        test.expect(1);
        if (!expected) { expected = []; }
        var thrower = _([1]).map(function () { throw new Error('error'); });
        transform(thrower).errors(function () {}).toArray(function (xs) {
            test.same(xs, expected, 'Value emitted for error');
            test.done();
        });
    };
}

function onDestroyTest(transform, input, takeFirst) {
    var called = 0,
        destroy1 = false,
        destroy2 = false,
        takeFirst = takeFirst && true;
    var identity = function(x) { return x; };
    return function (test) {
        var clock = sinon.useFakeTimers();
        var s = _(function generator(push, next) {
            setTimeout(function () {
                called++;
                push(null, input);
                next();
            }, 10);
        });

        var destructor1 = function destructor1() {
            setTimeout(function () {
                destroy1 = true;
            }, 15);
        };

        var destructor2 = function destructor2() {
            setTimeout(function () {
                destroy2 = true;
            }, 15);
        };

        var wrapOnDestroy = _.curry(function (destructor, xs) {
            return xs.onDestroy(destructor);
        });

        var xs = _.seq(wrapOnDestroy(destructor1),
            takeFirst ? _.take(1) : identity,
            _.through(transform),
            wrapOnDestroy(destructor2),
            takeFirst ? identity : _.take(1))(s);

        xs.resume();

        clock.tick(5);
        test.same(destroy1, false);
        test.same(destroy2, false);
        test.same(called, 0);

        clock.tick(5);
        test.same(destroy1, false);
        test.same(destroy2, false);
        test.same(called, 1);

        // tick(20) because there are some nested setImmediates in the
        // execution and sinon/lolex delays those.
        // See:
        // https://github.com/sinonjs/lolex/pull/12
        // https://github.com/sinonjs/sinon/issues/593
        clock.tick(20);
        test.same(destroy1, true);
        test.same(destroy2, true);
        test.same(called, 1);

        clock.restore();
        test.done();
    };
}

function returnsSameStreamTest(transform, expected, initial) {
    var sub = _.use({
        substream: true
    });
    return function (test) {
        test.expect(2);
        var s = sub(initial || [1]);
        var r = transform(s);
        test.ok(r.substream, 'Returned incorrect stream class');
        r.toArray(function(xs) {
            test.same(xs, expected || [1]);
            test.done();
        });
    };
}

function throwsErrorTest(block, error, message) {
    return function (test) {
        test.expect(1);
        test.throws(function () {
            block(_.of(1));
        }, error, message);
        test.done();
    };
}

function catchEventLoopError(highland, cb) {
    var oldSetImmediate = highland.setImmediate;
    highland.setImmediate = function (fn) {
        oldSetImmediate(function () {
            try {
                fn();
            }
            catch (e) {
                cb(e);
            }
        });
    };
    return function () {
        highland.setImmediate = oldSetImmediate;
    };
}

function generatorStream(input, timeout) {
    return _(function (push, next) {
        for (var i = 0, len = input.length; i < len; i++) {
            setTimeout(push.bind(null, null, input[i]), timeout * i);
        }
        setTimeout(push.bind(null, null, _.nil), timeout * len);
    });
}

function takeNextCb(xs, times, array, cb) {
    if (!array) {
        array = [];
    }

    xs.pull(function (err, x) {
        array.push(x);
        if (x !== _.nil) {
            if (times - 1 > 0) {
                takeNextCb(xs, times - 1, array, cb);
            }
        }

        if (cb && (times <= 1 || x === _.nil)) {
            cb(array);
        }
    });
}

function takeNext(xs, times, array) {
    return new Promise(function (res, rej) {
        takeNextCb(xs, times, array, res);
    });
}

/*
 * Returns the Readable pipe destination (i.e., the one that is provided to
 * Readable#pipe). This is only relevant for streams constructed using the
 * Readable constructor.
 */
function getReadablePipeDest(stream) {
    return stream._generator.source;
}

exports.ratelimit = {
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
            _([1, 2, 3]).ratelimit(-10, 0);
        });
        test.throws(function () {
            _([1, 2, 3]).ratelimit(0, 0);
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
        });
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
        });
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
        });
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
    },
    'with pause (issue #642)': function (test) {
        test.expect(6);
        var results = [];
        var stream = _([1, 2, 3, 4]).ratelimit(1, 1000);

        setTimeout(function () {
            stream.pause();
        }, 2000);
        setTimeout(function () {
            stream.resume();
        }, 6000);

        stream.each(function (x) {
            results.push(x);
        });

        test.same(results, [1]);

        this.clock.tick(1000);
        test.same(results, [1, 2]);

        this.clock.tick(1000);
        test.same(results, [1, 2]);

        this.clock.tick(3000);
        test.same(results, [1, 2]);

        this.clock.tick(1000);
        test.same(results, [1, 2, 3]);

        this.clock.tick(1000);
        test.same(results, [1, 2, 3, 4]);

        test.done();
    },
    'noValueOnError': noValueOnErrorTest(_.ratelimit(1, 10)),
    'onDestroy': onDestroyTest(_.ratelimit(1, 1), 1)
};

exports.curry = function (test) {
    var fn = _.curry(function (a, b, c, d) {
        return a + b + c + d;
    });
    test.equal(fn(1, 2, 3, 4), fn(1, 2)(3, 4));
    test.equal(fn(1, 2, 3, 4), fn(1)(2)(3)(4));
    var fn2 = function (a, b, c, d) {
        return a + b + c + d;
    };
    test.equal(_.curry(fn2)(1, 2, 3, 4), _.curry(fn2, 1, 2, 3, 4));
    test.equal(_.curry(fn2)(1, 2, 3, 4), _.curry(fn2, 1, 2)(3, 4));
    test.done();
};

exports.ncurry = function (test) {
    var fn = _.ncurry(3, function (a, b, c, d) {
        return a + b + c + (d || 0);
    });
    test.equal(fn(1, 2, 3, 4), 6);
    test.equal(fn(1, 2, 3, 4), fn(1, 2)(3));
    test.equal(fn(1, 2, 3, 4), fn(1)(2)(3));
    var fn2 = function () {
        var args = Array.prototype.slice(arguments);
        return args.reduce(function (a, b) { return a + b; }, 0);
    };
    test.equal(_.ncurry(3, fn2)(1, 2, 3, 4), _.ncurry(3, fn2, 1, 2, 3, 4));
    test.equal(_.ncurry(3, fn2)(1, 2, 3, 4), _.ncurry(3, fn2, 1, 2)(3, 4));
    test.done();
};

exports.compose = function (test) {
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

exports.partial = function (test) {
    var addAll = function () {
        var args = Array.prototype.slice.call(arguments);
        return args.reduce(function (a, b) { return a + b; }, 0);
    };
    var f = _.partial(addAll, 1, 2);
    test.equal(f(3, 4), 10);
    test.done();
};

exports.flip = function (test) {
    var subtract = function (a, b) {
        return a - b;
    };
    test.equal(subtract(4, 2), 2);
    test.equal(_.flip(subtract)(4, 2), -2);
    test.equal(_.flip(subtract, 4)(2), -2);
    test.equal(_.flip(subtract, 4, 2), -2);
    test.done();
};

exports.seq = function (test) {
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
};

exports.isStream = function (test) {
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
    _([1, _.nil, 3]).toArray(function (xs) {
        test.same(xs, [1]);
        test.done();
    });
};

exports['nil should not equate to any empty object'] = function (test) {
    var s = [1, {}, 3];
    _(s).toArray(function (xs) {
        test.same(xs, s);
        test.done();
    });
};

exports.pull = {
    'pull should take one element - ArrayStream': function (test) {
        test.expect(2);
        var s = _([1, 2, 3]);
        s.pull(valueEquals(test, 1));
        s.toArray(function (xs) {
            test.same(xs, [2, 3]);
            test.done();
        });
    },
    'pull should take one element - GeneratorStream': function (test) {
        test.expect(2);
        var i = 1;
        var s = _(function (push, next) {
            push(null, i++);
            if (i < 4) {
                next();
            }
            else {
                push(null, _.nil);
            }
        });
        s.pull(valueEquals(test, 1));
        s.toArray(function (xs) {
            test.same(xs, [2, 3]);
            test.done();
        });
    },
    'pull should take one element - GeneratorStream next called first (issue #325)': function (test) {
        test.expect(2);
        var i = 1;
        var s = _(function (push, next) {
            if (i < 4) {
                next();
            }
            push(null, i++);
            if (i >= 4) {
                push(null, _.nil);
            }
        });
        s.pull(valueEquals(test, 1));
        s.toArray(function (xs) {
            test.same(xs, [2, 3]);
            test.done();
        });
    }
};

exports['async consume'] = function (test) {
    _([1, 2, 3, 4]).consume(function (err, x, push, next) {
        if (x === _.nil) {
            push(null, _.nil);
        }
        else {
            setTimeout(function(){
                push(null, x * 10);
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

exports['consume - push nil async when x !== nil (issue #563)'] = function (test) {
    test.expect(1);
    _([1, 2, 3, 4]).consume(function(err, x, push, next) {
        if (err !== null) {
            push(err);
            next();
        }
        else if (x === _.nil) {
            push(null, _.nil);
        }
        else {
            _.setImmediate(push.bind(this, null, _.nil));
        }
    })
    .toArray(function (xs) {
        test.same(xs, []);
        test.done();
    });
};

exports['consume - source resume should buffer'] = function (test) {
    test.expect(2);
    var values = [];
    var s = _([1, 2, 3]);
    var s2 = s.consume(function (err, x, push, next) {
        values.push(x);
        if (x !== _.nil) {
            next();
        }
    });
    s.resume();
    test.same(values, []);
    s2.resume();
    test.same(values, [1, 2, 3, _.nil]);
    test.done();
};

exports['consume - fork after consume should not throw (issue #366)'] = function (test) {
    test.expect(2);
    var arr1, arr2;

    var s = _();
    var s1 = s.fork().toArray(function (a) {
        arr1 = a;
        if (arr1 && arr2) {
            runTest();
        }
    });
    var s2 = s.fork().toArray(function (a) {
        arr2 = a;
        if (arr1 && arr2) {
            runTest();
        }
    });

    s.write(1);
    s.end();

    function runTest() {
        test.same(arr1, [1]);
        test.same(arr2, [1]);
        test.done();
    }
};

exports.race = {
    setUp: function (callback) {
        this.clock = sinon.useFakeTimers();
        callback();
    },
    tearDown: function (callback) {
        this.clock.restore();
        callback();
    },
    'no re-entry of consume callback (issue #388)': function (test) {
        test.expect(1);
        // This triggers a race condition. Be careful about changing the source.
        var stream = _();
        var i = 0;

        function write() {
            var cont = false;
            while ((cont = stream.write(i++)) && i <= 10) {
                // Do nothing.
            }
            if (cont) {
                i++;
                stream.end();
            }
        }

        // This stream mimics the behavior of things like database
        // drivers.
        stream.on('drain', function () {
            if (i === 0) {
                // The initial read is async.
                setTimeout(write, 0);
            }
            else if (i > 0 && i < 10) {
                // The driver loads data in batches, so subsequent drains
                // are sync to mimic pulling from a pre-loaded buffer.
                write();
            }
            else if (i === 10) {
                i++;
                setTimeout(stream.end.bind(stream), 0);
            }
        });

        var done = false;
        stream
            // flatMap to disassociate from the source, since sequence
            // returns a new stream not a consume stream.
            .flatMap(function (x) {
                return _([x]);
            })
            // batch(2) to get a transform that sometimes calls next
            // without calling push beforehand.
            .batch(2)
            // Another flatMap to get an async transform.
            .flatMap(function (x) {
                return _(function (push) {
                    setTimeout(function () {
                        push(null, x);
                        push(null, _.nil);
                    }, 100);
                });
            })
            .done(function () {
                done = true;
            });
        this.clock.tick(1000);
        test.ok(done, 'The stream never completed.');
        test.done();
    }
};

exports.constructor = {
    setUp: function (callback) {
        this.createTestIterator = function(array, error, lastVal) {
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
                        };
                    }
                }
            };
        };
        this.tester = function (expected, test) {
            return function (xs) {
                test.same(xs, expected);
                test.done();
            };
        };
        callback();
    },
    'passing Stream to constructor returns original': function (test) {
        test.expect(1);
        var s = _([1, 2, 3]);
        test.strictEqual(s, _(s));
        test.done();
    },
    'from Readable with next function - issue #303': function (test) {
        test.expect(1);
        var Readable = Stream.Readable;

        var rs = new Readable();
        rs.next = function() {};
        rs.push('a');
        rs.push('b');
        rs.push('c');
        rs.push(null);
        _(rs).invoke('toString', ['utf8'])
            .toArray(this.tester(['a', 'b', 'c'], test));
    },
    'from Readable - unpipes on destroy': function (test) {
        test.expect(2);
        var rs = streamify([1, 2, 3]);

        var s = _(rs);
        var rsPipeDest = getReadablePipeDest(s);
        s.pull(valueEquals(test, 1));
        s.destroy();

        var write = sinon.spy(rsPipeDest, 'write');

        s.emit('drain');
        test.ok(!write.called, 'Drain should not cause write to be called.');
        test.done();
    },
    'from Readable - emits \'close\' not \'end\' - issue #490': function (test) {
        test.expect(1);
        var rs = new Stream.Readable();
        rs._read = function (size) {
            this.emit('close');
        };
        var s = _(rs);

        var sawEnd = false;
        s.pull(function (err, x) {
            sawEnd = true;
        });

        setTimeout(function () {
            test.ok(!sawEnd, 'Stream should not have ended.');
            test.done();
        }, 10);
    },
    'from Readable - emits \'close\' before \'end\' - issue #490': function (test) {
        test.expect(1);
        var rs = new Stream.Readable();
        rs._read = function (size) {
            this.push('1');
            this.emit('close');
            this.push('2');
            this.push(null);
        };
        rs.setEncoding('utf-8');
        var s = _(rs)
            .toArray(this.tester(['1', '2'], test));
    },
    'from Readable - emits \'close\' and \'end\' - issue #478': function (test) {
        test.expect(2);
        var rs = new Stream.Readable();
        rs._read = function (size) {
            _.setImmediate(function () {
                rs.push(null);
            });
        };
        rs.on('end', function () {
            _.setImmediate(function () {
                rs.emit('close');
            });
        });
        var s = _(rs);
        var rsPipeDest = getReadablePipeDest(s);
        var end = sinon.spy(rsPipeDest, 'end');
        rs.on('close', function () {
            // Wait for the rest of the close handlers to be called before
            // checking.
            _.setImmediate(function () {
                test.equal(end.callCount, 1, 'end() should be called exactly once.');
                test.done();
            });
        });
        s.pull(valueEquals(test, _.nil));
    },
    'from Readable - emits \'error\' - issue #478': function (test) {
        test.expect(2);
        var rs = new Stream.Readable();
        rs._read = function (size) {
            // Infinite stream!
        };
        var s = _(rs);
        rs.emit('error', new Error('error'));
        s.pull(errorEquals(test, 'error'));
        s.pull(valueEquals(test, _.nil));
        test.done();
    },
    'from Readable - unbind and unpipe as soon as possible': function (test) {
        var rs = new Stream.Readable();
        rs._read = function (size) {
            this.push('1');
            this.push(null);
        };

        var error = new Error('error');
        var s = _(rs);
        var rsPipeDest = getReadablePipeDest(s);
        var oldWrite = rsPipeDest.write;

        // We need to catch the exception here
        // since pipe uses process.nextTick which
        // isn't mocked by sinon.
        rsPipeDest.write = function (x) {
            try {
                oldWrite.call(this, x);
            }
            catch (e) {
                // Ignore
            }
        };

        var write = sinon.spy(rsPipeDest, 'write');
        rs.emit('error', error);

        _.setImmediate(function () {
            test.strictEqual(write.callCount, 2);
            test.strictEqual(write.args[0][0].error, error);
            test.strictEqual(write.args[1][0], _.nil);
            test.done();
        });
    },
    'from Readable - custom onFinish handler': function (test) {
        test.expect(2);
        var clock = sinon.useFakeTimers();
        var rs = new Stream.Readable();
        rs._read = function (size) {
            // Infinite stream!
        };

        var cleanup = sinon.spy();
        var s = _(rs, function (_rs, callback) {
            setTimeout(callback, 1000);
            return cleanup;
        });

        clock.tick(1000);
        clock.restore();

        s.pull(valueEquals(test, _.nil));

        test.strictEqual(cleanup.callCount, 1);
        test.done();
    },
    'from Readable - custom onFinish handler - emits error': function (test) {
        test.expect(2);
        var clock = sinon.useFakeTimers();
        var rs = new Stream.Readable();
        rs._read = function (size) {
            // Infinite stream!
        };

        var error = new Error('error');
        var s = _(rs, function (_rs, callback) {
            setTimeout(function () {
                callback(error);
            }, 1000);
        });

        clock.tick(1000);
        clock.restore();

        s.pull(errorEquals(test, 'error'));
        s.pull(valueEquals(test, _.nil));

        test.done();
    },
    'from Readable - custom onFinish handler - handle multiple callback calls': function (test) {
        test.expect(2);
        var clock = sinon.useFakeTimers();
        var rs = new Stream.Readable();
        rs._read = function (size) {
            // Infinite stream!
        };

        var cleanup = sinon.spy();
        var error = new Error('error');
        var s = _(rs, function (_rs, callback) {
            setTimeout(function () {
                callback();
                callback(error);
            }, 1000);
            return cleanup;
        });

        clock.tick(1000);
        clock.restore();

        // Only the first one counts.
        s.pull(valueEquals(test, _.nil));
        test.strictEqual(cleanup.callCount, 1);
        test.done();
    },
    'from Readable - custom onFinish handler - default to end on error': function (test) {
        test.expect(2);
        var clock = sinon.useFakeTimers();
        var rs = new Stream.Readable();
        var firstTime = true;

        rs._read = function (size) {
            // Infinite stream!
        };

        var error1 = new Error('error1');
        var error2 = new Error('error2');
        var s = _(rs, function (_rs, callback) {
            setTimeout(function () {
                callback(error1);
            }, 1000);
            setTimeout(function () {
                callback(error2);
                callback();
            }, 2000);
        });

        clock.tick(2000);
        clock.restore();

        s.pull(errorEquals(test, 'error1'));
        s.pull(valueEquals(test, _.nil));

        test.done();
    },
    'from Readable - custom onFinish handler - emits multiple errors': function (test) {
        test.expect(4);
        var clock = sinon.useFakeTimers();
        var rs = new Stream.Readable();
        var firstTime = true;

        rs._read = function (size) {
            // Infinite stream!
        };

        var onDestroy = sinon.spy();
        var error1 = new Error('error1');
        var error2 = new Error('error2');
        var s = _(rs, function (_rs, callback) {
            setTimeout(function () {
                callback(error1);
            }, 1000);
            setTimeout(function () {
                callback(error2);
                callback();
            }, 2000);

            return {
                onDestroy: onDestroy,
                continueOnError: true
            };
        });

        clock.tick(2000);
        clock.restore();

        s.pull(errorEquals(test, 'error1'));
        s.pull(errorEquals(test, 'error2'));
        s.pull(valueEquals(test, _.nil));

        test.strictEqual(onDestroy.callCount, 1, 'On destroy should have been called.');
        test.done();
    },
    'throws error for unsupported object': function (test) {
        test.expect(1);
        test.throws(function () {
            _({}).done(function () {});
        }, Error, 'Object was not a stream, promise, iterator or iterable: object');
        test.done();
    },
    'from promise': function (test) {
        test.expect(1);
        _(Promise.resolve(3))
            .toArray(this.tester([3], test));
    },
    'from promise - errors': function (test) {
        test.expect(3);
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
    },
    'from promise - bluebird cancellation': function (test) {
        test.expect(1);
        var promise = new bluebird.Promise(function(resolve, reject) {
            setTimeout(function() {
                resolve(1);
            }, 10);
        });
        var stream = _(promise).toArray(this.tester([], test));
        promise.cancel();
    },
    'from promise - should not throw in promise onResolve handler (issue #589)': function (test) {
        test.expect(1);

        // Swallow the exception so the tests passes.
        var stopCatchingEventLoopError = catchEventLoopError(_, function (e) {
            if (e.message !== 'Error thrown when handling value.') {
                throw e;
            }
        });

        var promise = bluebird.Promise.resolve('value');
        var oldThen = promise.then;
        promise.then = function (onResolve, onReject) {
            return oldThen.call(promise, function () {
                var threwError = false;
                try {
                    onResolve.apply(this, arguments);
                }
                catch (e) {
                    threwError = true;
                }

                test.ok(!threwError, 'The onResolve callback synchronously threw!');
                test.done();
                stopCatchingEventLoopError();
            }, function () {
                // Won't be called.
                test.ok(false, 'The onReject callback was called?!');
                test.done();
                stopCatchingEventLoopError();
            });
        };

        // Clear promise.finally to force the use of the vanilla promise code
        // path.
        promise.finally = null;
        _(promise)
            .map(function (x) {
                throw new Error('Error thrown when handling value.');
            })
            .done(function () {});
    },
    'from promise - should not throw in promise onReject handler (issue #589)': function (test) {
        test.expect(1);

        // Swallow the exception so the tests passes.
        var stopCatchingEventLoopError = catchEventLoopError(_, function (e) {
            if (e.message !== 'Error from promise.') {
                throw e;
            }
        });

        var promise = bluebird.Promise.reject(new Error('Error from promise.'));
        var oldThen = promise.then;
        promise.then = function (onResolve, onReject) {
            return oldThen.call(promise, function () {
                // Won't be called.
                test.ok(false, 'The onResolve callback was called?!');
                test.done();
                stopCatchingEventLoopError();
            }, function () {
                var threwError = false;
                try {
                    onReject.apply(this, arguments);
                }
                catch (e) {
                    threwError = true;
                }

                test.ok(!threwError, 'The onReject callback synchronously threw!');
                test.done();
                stopCatchingEventLoopError();
            });
        };

        // Clear promise.finally to force the use of the vanilla promise code
        // path.
        promise.finally = null;
        _(promise).done(function () {});

    },
    'from iterator': function (test) {
        test.expect(1);
        _(this.createTestIterator([1, 2, 3, 4, 5]))
            .toArray(this.tester([1, 2, 3, 4, 5], test));
    },
    'from iterator - error': function (test) {
        test.expect(2);
        _(this.createTestIterator([1, 2, 3, 4, 5], new Error('Error at index 2')))
            .errors(function (err) {
                test.equals(err.message, 'Error at index 2');
            })
            .toArray(this.tester([1, 2], test));
    },
    'from iterator - final return falsy': function (test) {
        test.expect(1);
        _(this.createTestIterator([1, 2, 3, 4, 5], void 0, 0))
            .toArray(this.tester([1, 2, 3, 4, 5, 0], test));
    },
    'only gutless streams and pipelines are writable': function (test) {
        test.ok(_().writable, 'gutless stream should be writable');
        test.ok(_.pipeline(_.map(function (x) { return x + 1; })).writable, 'pipelines should be writable');

        test.ok(!_([]).writable, 'empty stream should not be writable');
        test.ok(!_([1, 2, 3]).writable, 'non-empty stream should not be writable');
        test.ok(!_(through()).writable, 'wrapped stream should not be writable');
        test.ok(!_(function (push, next) {}).writable, 'generator stream should not be writable');
        test.ok(!_('event', new EventEmitter()).writable, 'event stream should not be writable');
        test.ok(!_(new Promise(function (res, rej) {})).writable, 'promise stream should not be writable');

        if (global.Set) {
            test.ok(!_(new global.Set()).writable, 'iterable stream should not be writable');
        }

        if (global.Symbol) {
            test.ok(!_(new global.Set().values()).writable, 'iterator stream should not be writable');
        }

        // This is a stand-in for basically every stream transformation method.
        test.ok(!_().fork().writable, 'forked stream should not be writable');
        test.ok(!_().map(function (x) { return x + 1; }).writable, 'mapped stream should not be writable');
        test.ok(!_().merge().writable, 'merged stream should not be writable');
        test.ok(!_().observe().writable, 'observed stream should not be writable');

        test.done();
    }
};

exports.GeneratorStream = {
    'sync next does not re-enter generator': function (test) {
        test.expect(2);
        var in_generator = false;
        var first = true;
        _(function (push, next) {
            test.ok(!in_generator, 'Generator was re-entered.');
            in_generator = true;
            if (first) {
                first = false;
                next();
            }
            else {
                test.done();
                push(null, _.nil);
            }
            in_generator = false;
        }).resume();
    },
    'async next does not call generator synchronously': function (test) {
        test.expect(2);
        var in_next = false;
        var first = true;
        _(function (push, next) {
            test.ok(!in_next, 'Generator was called synchronously.');
            if (first) {
                first = false;
                setTimeout(function () {
                    in_next = true;
                    next();
                    in_next = false;
                }, 0);
            }
            else {
                test.done();
                push(null, _.nil);
            }
        }).resume();
    },
    'this context is bound to the stream': function (test) {
        test.expect(2);
        function generator(push) {
            test.ok(_.isStream(this), 'The \'this\' reference is not a stream');
            test.strictEqual(generator, this._generator);
            test.done();

            push(null, _.nil);
        }
        _(generator).resume();
    },
    'calling next() after destroy() is a nop': function (test) {
        test.expect(3);
        var clock = sinon.useFakeTimers();
        var next = null;
        var s = _(function (push, _next) {
            push(null, 1);
            next = sinon.spy(_next);
            setTimeout(next, 50);
        });

        // Trigger the generator to run once.
        s.pull(valueEquals(test, 1));
        s.destroy();

        clock.tick(100);
        clock.restore();

        test.ok(next.called, 'The next function should have been called.');
        test.ok(!next.threw(), 'The next function call should not have thrown.');
        test.done();
    },
    'calling push() after destroy() is a nop': function (test) {
        test.expect(3);
        var clock = sinon.useFakeTimers();
        var push = null;
        var s = _(function (_push, next) {
            _push(null, 1);

            push = sinon.spy(_push);
            setTimeout(function () {
                push(null, 2);
            }, 50);
        });

        // Trigger the generator to run once.
        s.pull(valueEquals(test, 1));
        s.destroy();

        clock.tick(100);
        clock.restore();

        test.ok(push.called, 'The push function should have been called.');
        test.ok(!push.threw(), 'The push function call should not have thrown.');
        test.done();
    },
    'Cannot read property __ConsumeGenerator__ of null (#518)': function (test) {
        var clock = sinon.useFakeTimers();

        var s = _(function (push, next) {
            setTimeout(function () {
                push(new Error('error'));
                _.setImmediate(next); // next2
                next(); // next1
            }, 0);
        });

        s.pull(function (err, x) {
            s.pull(function () {
            });

            _.setImmediate(function () {
                s.destroy();
            });
        });

        clock.tick(100);
        clock.restore();
        test.done();
    }
};

//ES6 iterators Begin
if (global.Map && global.Symbol) {

    exports['constructor from Map'] = function (test) {
        test.expect(1);
        var map = new global.Map();
        map.set('a', 1);
        map.set('b', 2);
        map.set('c', 3);

        _(map).toArray(function (xs) {
            test.same(xs, [['a', 1], ['b', 2], ['c', 3]]);
        });
        test.done();
    };

    exports['constructor from Map iterator'] = function (test) {
        test.expect(1);
        var map = new global.Map();
        map.set('a', 1);
        map.set('b', 2);
        map.set('c', 3);

        _(map.entries()).toArray(function (xs) {
            test.same(xs, [['a', 1], ['b', 2], ['c', 3]]);
        });
        test.done();
    };

    exports['constructor from empty Map iterator'] = function (test) {
        test.expect(1);
        var map = new global.Map();

        _(map.entries()).toArray(function (xs) {
            test.same(xs, []);
        });
        test.done();
    };

}

if (global.Set && global.Symbol) {

    exports['constructor from Set'] = function (test) {
        test.expect(1);
        var sett = new global.Set([1, 2, 2, 3, 4]);

        _(sett).toArray(function (xs) {
            test.same(xs, [1, 2, 3, 4]);
        });
        test.done();
    };

    exports['constructor from Set iterator'] = function (test) {
        test.expect(1);
        var sett = new global.Set([1, 2, 2, 3, 4]);

        _(sett.values()).toArray(function (xs) {
            test.same(xs, [1, 2, 3, 4]);
        });
        test.done();
    };

    exports['constructor from empty Map iterator'] = function (test) {
        test.expect(1);
        var sett = new global.Set();

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
        test.same(xs, [1, 2, 3]);
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
    test.same(s._outgoing.toArray(), []);
    test.strictEqual(s.write(1), false);
    test.same(s._outgoing.toArray(), [1]);
    test.strictEqual(s.write(2), false);
    test.same(s._outgoing.toArray(), [1, 2]);
    test.done();
};

exports['write when not paused sends to consumer'] = function (test) {
    var vals = [];
    var s1 = _();
    var s2 = s1.consume(function (err, x, push, next) {
        vals.push(x);
        next();
    });
    s2.id = 's2';
    test.ok(s1.paused);
    test.ok(s2.paused);
    test.same(s1._outgoing.toArray(), []);
    test.same(s2._outgoing.toArray(), []);
    s2.resume();
    test.ok(!s1.paused);
    test.ok(!s2.paused);
    test.strictEqual(s1.write(1), true);
    test.strictEqual(s1.write(2), true);
    test.same(s1._outgoing.toArray(), []);
    test.same(s2._outgoing.toArray(), []);
    test.same(vals, [1, 2]);
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
    test.same(s1._outgoing.toArray(), [1]);
    test.same(s2._outgoing.toArray(), []);
    s2.resume();
    test.same(vals, [1]);
    test.same(s1._outgoing.toArray(), []);
    test.same(s2._outgoing.toArray(), []);
    test.strictEqual(s1.write(2), true);
    test.same(vals, [1, 2]);
    test.done();
};

exports['restart buffering incoming data on pause'] = function (test) {
    var vals = [];
    var s1 = _();
    var s2 = s1.consume(function (err, x, push, next) {
        vals.push(x);
        push(null, x);
        next();
    });
    s2.resume();
    test.strictEqual(s1.write(1), true);
    test.strictEqual(s1.write(2), true);
    test.same(s1._outgoing.toArray(), []);
    test.same(s2._outgoing.toArray(), []);
    test.same(vals, [1, 2]);
    s2.pause();
    test.strictEqual(s1.write(3), false);
    test.strictEqual(s1.write(4), false);
    test.same(s1._outgoing.toArray(), [4]);
    test.same(s2._outgoing.toArray(), [3]);
    test.same(vals, [1, 2, 3]);
    s2.resume();
    test.same(s1._outgoing.toArray(), []);
    test.same(s2._outgoing.toArray(), []);
    test.same(vals, [1, 2, 3, 4]);
    test.done();
};

exports['redirect from consumer'] = function (test) {
    var s = _([1, 2, 3]);
    var s2 = s.consume(function (err, x, push, next) {
        next(_([4, 5, 6]));
    });
    s2.toArray(function (xs) {
        test.same(xs, [4, 5, 6]);
        test.done();
    });
};

exports['redirect - redirecting stream should end when delegate end (issue #41)'] = function (test) {
    test.expect(4);
    var s1 = _([1]);
    var s2 = _([2]);

    var out = s1.concat(s2);

    out.toArray(function(arr) {
        test.same(arr, [1, 2]);
    });
    test.strictEqual(s1.ended, true, 's1 should be ended');
    test.strictEqual(s2.ended, true, 's2 should be ended');
    test.strictEqual(out.ended, true, 'out should be ended');
    test.done();
};

exports['redirect - should pass on end event (issue #142)'] = function (test) {
    test.expect(1);
    var generator = _(function (push, next) {
        push(null, _.nil);
    });

    var endCalls = 0;
    generator.on('end', function () {
        endCalls++;
    });

    var otherwise = _([]).otherwise(generator).on('end', function() {
        endCalls++;
    });
    otherwise.resume();

    test.same(endCalls, 2, 'The end event did not fire twice.');
    test.done();
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

exports['consume - onDestroy'] = onDestroyTest(
    _.consume(function (err, x, push, next) {
        if (x === _.nil) {
            push(null, _.nil);
        }
        else {
            push(null, x + 1);
            next();
        }
    }),
    1);

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

exports.of = {
    'creates stream of one item': function (test) {
        test.expect(2);
        _.of(1)
            .toCallback(function (err, result) {
                test.ifError(err);
                test.same(result, 1);
                test.done();
            });
    }
};

exports.fromError = {
    'creates stream of one error': function (test) {
        var error = new Error('This is an error');
        test.expect(2);
        _.fromError(error)
            .toCallback(function (err, result) {
                test.strictEqual(err, error);
                test.strictEqual(result, void 0);
                test.done();
            });
    }
};

exports['consume - throws error if push called after nil'] = function (test) {
    test.expect(1);
    var s = _([1, 2, 3]);
    var s2 = s.consume(function (err, x, push, next) {
        push(null, x);
        if (x === _.nil) {
            push(null, 4);
        }
        else {
            next();
        }
    });
    test.throws(function () {
        s2.resume();
    });
    test.done();
};

exports['consume - throws error if next called after nil'] = function (test) {
    test.expect(1);
    var s = _([1, 2, 3]);
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

exports['consume - call handler once without next() (issue #570)'] = function (test) {
    test.expect(1);
    var clock = sinon.useFakeTimers();
    var consumedCalledNum = 0;
    _([1, 2, 3])
        .consume(function (err, x, push, next) {
            consumedCalledNum++;
        })
        .resume();
    clock.tick(10000);
    clock.restore();
    test.equal(consumedCalledNum, 1);
    test.done();
};

exports['consume - consume resumed stream - call handler once without next() (issue #570)'] = function (test) {
    test.expect(1);
    var clock = sinon.useFakeTimers();
    var consumedCalledNum = 0;
    var s = _([1, 2, 3])
        .consume(function (err, x, push, next) {
            consumedCalledNum++;
        });
    s.resume();
    s.consume(function (err, x, push, next) {
        if (x !== _.nil) {
            next();
        }
    }).resume();
    clock.tick(10000);
    clock.restore();
    test.equal(consumedCalledNum, 1);
    test.done();
};

exports.errors = function (test) {
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
            if (val !== _.nil) {
                next();
            }
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
    _([1, 2]).errors(f).toArray(function (xs) {
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

exports['errors - onDestroy'] = onDestroyTest(
    _.seq(_.map(function () {
        throw new Error('err');
    }),
    _.errors(function (err, push) {
        push(null, 1);
    })),
    1);

exports['errors - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.errors();
}, [1]);

exports.stopOnError = function (test) {
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
            if (val !== _.nil) {
                next();
            }
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
    _([1, 2, 3, 4]).stopOnError(f).toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4]);
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

exports['stopOnError - onDestroy'] = onDestroyTest(
    _.seq(_.map(function () {
        throw new Error('err');
    }),
    _.stopOnError(function (err) {
        // do nothing
    })),
    1);

exports['stopOnError - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.stopOnError();
}, [1]);

exports.apply = function (test) {
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
    _([1, 2, 3]).apply(function (a, b, c) {
        test.equal(arguments.length, 3);
        test.equal(a, 1);
        test.equal(b, 2);
        test.equal(c, 3);
        test.done();
    });
};

exports['apply - varargs'] = function (test) {
    _([1, 2, 3, 4]).apply(function (a, b) {
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

exports.take = {
    'arrayStream': function (test) {
        test.expect(3);
        var s = _([1, 2, 3, 4]).take(2);
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
    },
    'errors': function (test) {
        test.expect(4);
        var s = _(function (push, next) {
            push(null, 1);
            push(new Error('error'), 2);
            push(null, 3);
            push(null, 4);
            push(null, _.nil);
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
    },
    'take 1': function (test) {
        test.expect(2);
        var s = _([1]).take(1);
        s.pull(function (err, x) {
            test.equal(x, 1);
        });
        s.pull(function (err, x) {
            test.equal(x, _.nil);
        });
        test.done();
    },
    'negative argument throws RangeError':
        throwsErrorTest(_.take(-1), RangeError),
    'non-number argument throws TypeError':
        throwsErrorTest(_.take('1'), TypeError),
    'returnsSameStream': returnsSameStreamTest(function(s) {
        return s.take(1);
    }, [1]),
    'noValueOnError': noValueOnErrorTest(_.take(1))
};

exports.slice = {
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
        test.expect(4);
        _(this.input).slice(2, 6).toArray(this.tester(this.expected, test));
        _(this.input).slice(2).toArray(this.tester(this.expected, test));
        _(this.input).slice().toArray(this.tester(this.input, test));
        _(this.input).slice(0).toArray(this.tester(this.input, test));
        test.done();
    },
    'partial application': function (test) {
        test.expect(1);
        var s = _(this.input);
        _.slice(1, 4)(s).toArray(this.tester([2, 3, 4], test));
        test.done();
    },
    'error': function (test) {
        test.expect(2);
        var s = _(function (push, next) {
            push(null, 1);
            push(new Error('Slice error'));
            push(null, 2);
            push(null, 3);
            push(null, 4);
            push(null, 5);
            push(null, _.nil);
        });
        s.slice(2, 4).errors(errorEquals(test, 'Slice error'))
            .toArray(this.tester([3, 4], test));
        test.done();
    },
    'negative start throws RangeError':
        throwsErrorTest(_.slice(-1, 1), RangeError),
    'negative end throws RangeError':
        throwsErrorTest(_.slice(1, -1), RangeError),
    'non-number start throws TypeError':
        throwsErrorTest(_.slice('1', 1), TypeError),
    'non-number end throws TypeError':
        throwsErrorTest(_.slice(1, '1'), TypeError),
    'noValueOnError': noValueOnErrorTest(_.slice(2, 3)),
    'onDestroyTest': onDestroyTest(_.slice(0, 1), 1),
    'returnsSameStream': returnsSameStreamTest(function(s) {
        return s.slice(0, 1);
    }, [1])
};

exports.drop = {
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
            push(null, 1);
            push(new Error('Drop error'));
            push(null, 2);
            push(null, 3);
            push(null, 4);
            push(null, 5);
            push(null, _.nil);
        });
        s.drop(2).errors(errorEquals(test, 'Drop error'))
            .toArray(this.tester(this.expected, test));
        test.done();
    },
    'negative argument throws RangeError':
        throwsErrorTest(_.drop(-1), RangeError),
    'non-number argument throws TypeError':
        throwsErrorTest(_.drop('1'), TypeError),
    'noValueOnError': noValueOnErrorTest(_.drop(2))
};

exports['drop - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.drop(1);
}, []);

exports.head = function (test) {
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

exports['head - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.head();
}, [1]);

exports.each = function (test) {
    var calls = [];
    _.each(function (x) {
        calls.push(x);
    }, [1, 2, 3]);
    test.same(calls, [1, 2, 3]);
    // partial application
    _.each(function (x) {
        calls.push(x);
    })([1, 2, 3]);
    test.same(calls, [1, 2, 3, 1, 2, 3]);
    test.done();
};

exports['each - ArrayStream'] = function (test) {
    var calls = [];
    _([1, 2, 3]).each(function (x) {
        calls.push(x);
    });
    test.same(calls, [1, 2, 3]);
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
    test.same(calls, [1, 2, 3]);
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

exports.done = function (test) {
    test.expect(3);

    var calls = [];
    _.map(function (x) {
        calls.push(x);
        return x;
    }, [1, 2, 3]).done(function () {
        test.same(calls, [1, 2, 3]);
    });

    calls = [];
    _.each(function (x) {
        calls.push(x);
    }, [1, 2, 3]).done(function () {
        test.same(calls, [1, 2, 3]);
    });

    // partial application
    calls = [];
    _.each(function (x) {
        calls.push(x);
    })([1, 2, 3]).done(function () {
        test.same(calls, [1, 2, 3]);
    });

    test.done();
};

exports['done - ArrayStream'] = function (test) {
    var calls = [];
    _([1, 2, 3]).each(function (x) {
        calls.push(x);
    }).done(function () {
        test.same(calls, [1, 2, 3]);
        test.done();
    });
};

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
        test.same(calls, [1, 2, 3]);
        test.done();
    });
};

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

exports.onDestroy = {
    setUp: function (cb) {
        var self = this;
        self.destroy_call = 0;
        self.destructor = function () {
            self.destroy_call++;
        };
        self.checkDestructor = function (test) {
            test.same(self.destroy_call, 1, 'destructor must be called exactly one time.');
        };
        cb();
    },
    'called on stream end': function (test) {
        test.expect(2);
        _([1]).onDestroy(this.destructor)
            .toArray(function (xs) {
                test.same(xs, [1]);
            });
        this.checkDestructor(test);
        test.done();
    },
    'called on destroy() call': function (test) {
        test.expect(1);

        var s = _([]).onDestroy(this.destructor);

        s.destroy();

        this.checkDestructor(test);
        test.done();
    },
    'called on children end': function (test) {
        test.expect(2);
        _([1, 2, 3]).onDestroy(this.destructor)
            .take(1)
            .toArray(function (xs) {
                test.same(xs, [1]);
            });
        this.checkDestructor(test);
        test.done();
    }
};

exports['toCallback - ArrayStream'] = function(test) {
    test.expect(2);
    _([1, 2, 3, 4]).collect().toCallback(function(err, result) {
        test.same(result, [1, 2, 3, 4]);
        test.same(err, null);
        test.done();
    });
};

exports['toCallback - GeneratorStream'] = function (test) {
    test.expect(2);
    _(function(push, next) {
        push(null, 1);
        push(null, 2);
        setTimeout(function() {
            push(null, 3);
            push(null, _.nil);
        }, 40);
    }).collect().toCallback(function(err, result){
        test.same(result, [1, 2, 3]);
        test.same(err, null);
        test.done();
    });
};

exports['toCallback - returns error for streams with multiple values'] = function (test) {
    test.expect(1);
    var s = _([1, 2]).toCallback(function(err, result) {
        test.same(err.message, 'toCallback called on stream emitting multiple values');
        test.done();
    });
};

exports['toCallback - calls back without arguments for empty stream'] = function (test) {
    test.expect(1);
    _([]).toCallback(function() {
        test.same(arguments.length, 0);
        test.done();
    });
};

exports['toCallback - returns error when stream emits error'] = function (test) {
    test.expect(2);
    _(function(push, next) {
        push(null, 1);
        push(null, 2);
        setTimeout(function() {
            push(new Error('Test error'));
            push(null, 3);
            push(null, _.nil);
        }, 40);
    }).collect().toCallback(function(err, result){
        test.same(err.message, 'Test error');
        test.same(result, undefined);
        test.done();
    });
};

exports['toCallback - error handling edge cases'] = function (test) {
    test.expect(4);
    _(function(push, next) {
        push(null, 1);
        push(new Error('Test error'));
        push(null, _.nil);
    }).toCallback(function(err, result){
        test.same(err.message, 'toCallback called on stream emitting multiple values');
        test.same(result, undefined);
    });

    _(function(push, next) {
        push(null, 1);
        push(null, 2);
        push(new Error('Test error'));
        push(null, _.nil);
    }).toCallback(function(err, result){
        test.same(err.message, 'toCallback called on stream emitting multiple values');
        test.same(result, undefined);
    });
    test.done();
};


exports.toPromise = {
    'ArrayStream': function(test) {
        test.expect(1);
        _([1, 2, 3, 4]).collect().toPromise(Promise).then(function(result) {
            test.same(result, [1, 2, 3, 4]);
            test.done();
        });
    },
    'GeneratorStream': function (test) {
        test.expect(1);
        _(function(push, next) {
            push(null, 1);
            push(null, 2);
            setTimeout(function() {
                push(null, 3);
                push(null, _.nil);
            }, 40);
        }).collect().toPromise(Promise).then(function(result){
            test.same(result, [1, 2, 3]);
            test.done();
        });
    },
    'returns error for streams with multiple values': function (test) {
        test.expect(1);
        _([1, 2]).toPromise(Promise).catch(function(err) {
            test.same(err.message, 'toPromise called on stream emitting multiple values');
            test.done();
        });
    },
    'returns error when stream emits error': function (test) {
        test.expect(1);
        _(function(push, next) {
            push(null, 1);
            push(null, 2);
            setTimeout(function() {
                push(new Error('Test error'));
                push(null, 3);
                push(null, _.nil);
            }, 40);
        }).collect().toPromise(Promise).catch(function(err){
            test.same(err.message, 'Test error');
            test.done();
        });
    },
    'error handling edge cases': function (test) {
        test.expect(2);
        _(function(push, next) {
            push(null, 1);
            push(new Error('Test error'));
            push(null, _.nil);
        }).toPromise(Promise).catch(function(err){
            test.same(err.message, 'toPromise called on stream emitting multiple values');
        }).then(function() {
            return _(function(push, next) {
                push(null, 1);
                push(null, 2);
                push(new Error('Test error'));
                push(null, _.nil);
            }).toPromise(Promise).catch(function(err){
                test.same(err.message, 'toPromise called on stream emitting multiple values');
            });
        }).then(function() {
            test.done();
        });
    }
};

exports.toNodeStream = {
    'non-object stream of buffer': function (test) {
        test.expect(1);
        var buf = new Buffer('aaa', 'utf8');
        var s = _.of(buf).toNodeStream();
        s.on('end', function() {
            test.done();
        });
        s.on('data', function(val) {
            test.same(val, buf);
        });
    },
    'non-object stream of string': function (test) {
        test.expect(1);
        var s = _.of('aaa').toNodeStream({objectMode: true});
        s.on('end', function() {
            test.done();
        });
        s.on('data', function(val) {
            test.same(val, 'aaa');
        });
    },
    'object stream': function (test) {
        test.expect(1);
        var s = _.of({a: 1}).toNodeStream({objectMode: true});
        s.on('end', function(val) {
            test.done();
        });
        s.on('data', function(val) {
            test.same(val, {a: 1});
        });
    },
    'object stream no objectmode': function (test) {
        test.expect(1);
        var s = _.of({a: 1}).toNodeStream();
        s.on('error', function (error) {
            test.ok(true);
        });
        s.on('end', function(val) {
            test.done();
        });
        s.on('data', function(val) {
            test.ok(false, 'data event should not be fired');
        });
    },
    'object stream but stream error': function (test) {
        test.expect(1);
        var err = new Error('ohno');
        var s = _.fromError(err).toNodeStream({objectMode: true});
        s.on('error', function (e) {
            test.same(e, err);
            test.done();
        });
        s.on('data', function (x) {
            test.ok(false, 'data event should not be fired.');
            test.done();
        });
    }
};

exports['calls generator on read'] = function (test) {
    test.expect(5);
    var gen_calls = 0;
    var s = _(function (push, next) {
        gen_calls++;
        push(null, 1);
        push(null, _.nil);
    });
    test.equal(gen_calls, 0);

    s.pull(valueEquals(test, 1));
    test.equal(gen_calls, 1);

    s.pull(valueEquals(test, _.nil));
    test.equal(gen_calls, 1);

    test.done();
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
        if (x === 2) {
            consumer.pause();
        }
        next();
    });
    consumer.resume();
    test.same(JSON.stringify(calls), JSON.stringify([1, 2]));
    consumer.resume();
    test.same(calls, [1, 2, 3, _.nil]);
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
    test.expect(7);

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

    s.pull(valueEquals(test, 1));
    test.equal(gen_calls, 1);

    s.pull(valueEquals(test, 2));
    test.equal(gen_calls, 2);

    s.pull(valueEquals(test, _.nil));
    test.equal(gen_calls, 3);

    test.done();
};

exports['adding multiple consumers should error'] = function (test) {
    var s = _([1, 2, 3, 4]);
    s.consume(function () {});
    test.throws(function () {
        s.consume(function () {});
    });
    test.done();
};

exports['switch to alternate stream using next'] = function (test) {
    test.expect(11);

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

    s1.pull(valueEquals(test, 1));
    test.equal(s1_gen_calls, 1);
    test.equal(s2_gen_calls, 0);

    s1.pull(valueEquals(test, 2));
    test.equal(s1_gen_calls, 1);
    test.equal(s2_gen_calls, 1);

    s1.pull(valueEquals(test, _.nil));
    test.equal(s1_gen_calls, 1);
    test.equal(s2_gen_calls, 1);

    test.done();
};

exports['switch to alternate stream using next (async)'] = function (test) {
    test.expect(11);
    var clock = sinon.useFakeTimers();

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

    s1.pull(valueEquals(test, 1));
    test.equal(s1_gen_calls, 1);
    test.equal(s2_gen_calls, 0);
    clock.tick(10);

    s1.pull(valueEquals(test, 2));
    test.equal(s1_gen_calls, 1);
    test.equal(s2_gen_calls, 1);
    clock.tick(10);

    s1.pull(valueEquals(test, _.nil));
    test.equal(s1_gen_calls, 1);
    test.equal(s2_gen_calls, 1);

    clock.restore();
    test.done();
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

exports.pipe = {
    'old-style node stream to highland stream': function (test) {
        var xs = [];
        var src = streamify([1, 2, 3, 4]);
        var s1 = _();
        var s2 = s1.consume(function (err, x, push, next) {
            xs.push(x);
            next();
        });
        Stream.prototype.pipe.call(src, s1);
        setTimeout(function () {
            test.same(s1._outgoing.toArray(), [1]);
            test.same(s2._outgoing.toArray(), []);
            test.same(xs, []);
            s2.resume();
            setTimeout(function () {
                test.same(s1._outgoing.toArray(), []);
                test.same(s2._outgoing.toArray(), []);
                test.same(xs, [1, 2, 3, 4, _.nil]);
                test.done();
            }, 100);
        }, 100);
    },
    'node stream to highland stream': function (test) {
        var xs = [];
        var src = streamify([1, 2, 3, 4]);
        var s1 = _();
        var s2 = s1.consume(function (err, x, push, next) {
            xs.push(x);
            next();
        });
        src.pipe(s1);
        setTimeout(function () {
            test.same(s1._outgoing.toArray(), [1]);
            test.same(s2._outgoing.toArray(), []);
            test.same(xs, []);
            s2.resume();
            setTimeout(function () {
                test.same(s1._outgoing.toArray(), []);
                test.same(s2._outgoing.toArray(), []);
                test.same(xs, [1, 2, 3, 4, _.nil]);
                test.done();
            }, 100);
        }, 100);
    },
    'highland stream to node stream': function (test) {
        var src = _(['a', 'b', 'c']);
        var dest = concat(function (data) {
            test.same(data, 'abc');
            test.done();
        });
        src.pipe(dest);
    },
    'pipe to node stream with backpressure': function (test) {
        test.expect(3);
        var src = _([1, 2, 3, 4]);
        var xs = [];
        var dest = new EventEmitter();
        dest.writable = true;
        dest.write = function (x) {
            xs.push(x);
            if (xs.length === 2) {
                _.setImmediate(function () {
                    test.same(xs, [1, 2]);
                    test.ok(src.paused);
                    dest.emit('drain');
                });
                return false;
            }
            return true;
        };
        dest.end = function () {
            test.same(xs, [1, 2, 3, 4]);
            test.done();
        };
        src.pipe(dest);
    },
    'emits "pipe" event when piping (issue #449)': function (test) {
        test.expect(1);

        var src = _();
        var dest = _();
        dest.on('pipe', function (_src) {
            test.strictEqual(_src, src);
            test.done();
        });
        src.pipe(dest);
    },
    'pipe with {end:false} option should not end': function (test) {
        test.expect(1);

        var clock = sinon.useFakeTimers();
        var dest = _();
        var ended = false;
        dest.end = function () {
            ended = true;
        };

        _([1, 2, 3]).pipe(dest);

        clock.tick(10000);
        clock.restore();
        test.ok(!ended, 'The destination should not have been ended.');
        test.done();
    },
    'clean up drain handler when done': function (test) {
        test.expect(2);

        var dest = _();
        var boundListener = false;
        var unboundListener = false;

        dest.on('newListener', function (ev) {
            if (ev === 'drain') {
                boundListener = true;
            }
        });

        dest.on('removeListener', function (ev) {
            if (ev === 'drain') {
                unboundListener = true;
            }
        });

        var src = _([1, 2, 3]);
        src.pipe(dest);

        src.onDestroy(function () {
            test.ok(boundListener, 'No drain listener was bound.');
            test.ok(unboundListener, 'No drain listener was unbound.');
            test.done();
        });

        dest.resume();
    }
};

// ignore these tests in non-node.js environments
if (typeof process !== 'undefined' && process.stdout) {
    exports.pipe['highland stream to stdout'] = function (test) {
        test.expect(1);
        var src = _(['']);
        test.doesNotThrow(function () {
            src.pipe(process.stdout);
        });
        test.done();
    };

    exports.pipe['highland stream to stdout with {end:true}'] = function (test) {
        test.expect(1);
        var src = _(['']);
        test.doesNotThrow(function () {
            src.pipe(process.stdout, {end: true});
        });
        test.done();
    };
}

// ignore these tests in non-node.js environments
if (typeof process !== 'undefined' && process.stderr) {
    exports.pipe['highland stream to stderr'] = function (test) {
        test.expect(1);
        var src = _(['']);
        test.doesNotThrow(function () {
            src.pipe(process.stderr);
        });
        test.done();
    };

    exports.pipe['highland stream to stderr with {end:true}'] = function (test) {
        test.expect(1);
        var src = _(['']);
        test.doesNotThrow(function () {
            src.pipe(process.stderr, {end: true});
        });
        test.done();
    };
}

exports['wrap node stream and pipe'] = function (test) {
    test.expect(7);
    function doubled(x) {
        return x * 2;
    }
    var xs = [];
    var readable = streamify([1, 2, 3, 4]);
    var source = _(readable);
    var ys = source.map(doubled);

    var dest = new EventEmitter();
    dest.writable = true;
    dest.write = function (x) {
        xs.push(x);
        if (xs.length === 2) {
            _.setImmediate(function () {
                test.same(xs, [2, 4]);
                test.ok(source.paused);
                test.equal(readable._readableState.readingMore, false);
                dest.emit('drain');
            });
            return false;
        }
        return true;
    };
    dest.end = function () {
        test.same(xs, [2, 4, 6, 8]);
        test.done();
    };
    // make sure nothing starts until we pipe
    test.same(xs, []);
    test.same(ys._outgoing.toArray(), []);
    test.same(source._outgoing.toArray(), []);
    ys.pipe(dest);
};

exports['wrap node stream with error'] = function (test) {
    test.expect(1);
    var readable = streamify([1, 2, 3, 4]);
    var err = new Error('nope');
    var xs = _(readable);
    readable.emit('error', err);

    xs.stopOnError(function (e) {
        test.strictEqual(err, e);
        test.done();
    }).each(function () {});
};

exports['attach data event handler'] = function (test) {
    var s = _([1, 2, 3, 4]);
    var xs = [];
    s.on('data', function (x) {
        xs.push(x);
    });
    s.on('end', function () {
        test.same(xs, [1, 2, 3, 4]);
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
        test.same(xs, [3, 2, 1]);
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

exports['removing EventEmitter (or jQuery) listener on destruction (issue #500)'] = function(test) {
    test.expect(1);
    var ee = new EventEmitter();
    var s = _('myevent', ee);

    var removed = false;

    ee.on('removeListener', function() {
        removed = true;
    });

    s.destroy();
    test.ok(removed);
    test.done();
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
        test.done();
    });
};

exports['wrap EventEmitter default mapper discards all but first arg'] = function (test) {
    var ee = {
        on: function (name, f) {
            test.same(name, 'myevent');
            f(1, 2, 3);
        }
    };
    _('myevent', ee).each(function (x) {
        test.same(x, 1);
        test.done();
    });
};

exports.sequence = function (test) {
    _.sequence([[1, 2], [3], [[4], 5]]).toArray(function (xs) {
        test.same(xs, [1, 2, 3, [4], 5]);
    });
    test.done();
};

exports['sequence - noValueOnError'] = noValueOnErrorTest(_.sequence());

exports['sequence - ArrayStream'] = function (test) {
    _([[1, 2], [3], [[4], 5]]).sequence().toArray(function (xs) {
        test.same(xs, [1, 2, 3, [4], 5]);
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
        test.same(xs, [3, 2, 1, 3, 2, 1, 3, 2]);
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
    var s1 = _([1, 2, 3]);
    var s2 = _(function (push, next) {});
    test.equal(s1.sequence, s1.series);
    test.equal(s2.sequence, s2.series);
    test.done();
};

exports['sequence - Streams of Streams of Arrays'] = function (test) {
    _([
        _([1, 2]),
        _([3]),
        _([[4], 5])
    ]).sequence().toArray(function (xs) {
        test.same(xs, [1, 2, 3, [4], 5]);
        test.done();
    });
};

exports['sequence - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.sequence();
}, [1], [[1]]);

exports.fork = {
    'simple test': function (test) {
        test.expect(9);
        var s = _([1, 2, 3, 4]);
        s.id = 's';
        var ss2 = s.fork();
        ss2.id = 'ss2';
        var s2 = ss2.map(function (x) {
            return x * 2;
        });
        s2.id = 's2';
        var s3 = s.fork().map(function (x) {
            return x * 3;
        });
        s3.id = 's3';
        var s2_data = [];
        var s3_data = [];

        takeNext(s2, 1, s2_data);

        // don't start until both consumers resume
        test.same(s2_data, []);

        takeNext(s3, 2, s3_data);
        test.same(s2_data, [2]);
        test.same(s3_data, [3]);

        takeNext(s2, 1, s2_data);
        test.same(s2_data, [2, 4]);
        test.same(s3_data, [3, 6]);

        takeNext(s3, 2, s3_data);
        test.same(s2_data, [2, 4]);
        test.same(s3_data, [3, 6]);

        takeNext(s2, 2, s2_data);
        test.same(s2_data, [2, 4, 6, 8]);
        test.same(s3_data, [3, 6, 9, 12]);

        test.done();
    },
    'returnsSameStream': returnsSameStreamTest(function(s) {
        return s.fork();
    }, [1]),
    'multiplex at emit time - pull then add fork': function (test) {
        test.expect(2);
        var s1Arr, s2Arr;
        var s = _();

        s.fork().toArray(function (a) {
            s1Arr = a;
            if (s1Arr != null && s2Arr != null) {
                runTest();
            }
        });

        var s2 = s.fork();
        s.write(1);

        s2.toArray(function (a) {
            s2Arr = a;
            if (s1Arr != null && s2Arr != null) {
                runTest();
            }
        });

        s.end();

        function runTest() {
            test.same(s1Arr, [1]);
            test.same(s2Arr, [1]);
            test.done();
        }
    },
    'multiplex at emit time - pull then add pulling fork': function (test) {
        test.expect(2);
        var s1Arr, s2Arr;
        var s = _();

        s.fork().toArray(function (a) {
            s1Arr = a;
            if (s1Arr != null && s2Arr != null) {
                runTest();
            }
        });

        s.fork().toArray(function (a) {
            s2Arr = a;
            if (s1Arr != null && s2Arr != null) {
                runTest();
            }
        });

        s.write(1);
        s.end();

        function runTest() {
            test.same(s1Arr, [1]);
            test.same(s2Arr, [1]);
            test.done();
        }
    },
    'fork shuffling before emit': function (test) {
        test.expect(2);
        var arr1 = [];
        var arr2 = [];
        var s = _();
        var s1 = s.fork();
        var s2 = s.fork();

        s1.toArray(function (a) {
            arr1 = a;
        });
        s2.toArray(function (a) {
            arr2 = a;
        });
        s1.destroy();

        s.write(1);
        s.end();
        test.same(arr1, []);
        test.same(arr2, [1]);
        test.done();
    },
    'destroyed forks should not exert backpressure': function (test) {
        test.expect(2);
        var s = _([1, 2, 3]);
        var s1 = s.fork();
        var s2 = s.fork().take(1);

        s1.toArray(function (arr) {
            test.deepEqual(arr, [1, 2, 3]);
        });

        s2.toArray(function (arr) {
            test.deepEqual(arr, [1]);
        });

        test.done();
    }
};

exports.observe = function (test) {
    test.expect(11);

    var s = _([1, 2, 3, 4]);
    s.id = 's';
    var s2 = s.map(function (x) {
        return x * 2;
    });
    s2.id = 's2';

    var s3_source = s.observe();
    var s3 = s3_source.map(function (x) {
        return x * 3;
    });
    s3.id = 's3';

    var s2_data = [];
    var s3_data = [];

    takeNext(s2, 1, s2_data);

    test.same(s2_data, [2]);
    test.same(s3_data, []);
    test.same(s3_source._outgoing.toArray(), [1]);

    takeNext(s3, 2, s3_data);
    test.same(s2_data, [2]);
    test.same(s3_data, [3]);

    takeNext(s2, 1, s2_data);
    test.same(s2_data, [2, 4]);
    test.same(s3_data, [3, 6]);

    takeNext(s3, 2, s3_data);
    test.same(s2_data, [2, 4]);
    test.same(s3_data, [3, 6]);

    takeNext(s2, 2, s2_data);
    test.same(s2_data, [2, 4, 6, 8]);
    test.same(s3_data, [3, 6, 9, 12]);
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
    test.expect(4);
    var s = _([]),
        o = s.observe();
    var o2 = o.observe();

    test.same(o._observers, [o2], 'o._observers should not be empty before destroy.');
    test.same(s._observers, [o], 'source._observers should not be empty before destroy.');

    o.destroy();

    test.same(o._observers, [], 'o._observers should be empty after destroy.');
    test.same(s._observers, [], 'source._observers should be empty after destroy.');
    test.done();
};

/* TODO: not working, doesn't consume
exports['observe - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.observe();
}, [1]);
*/

exports['observe - observe consume before source emit should not throw'] = function (test) {
    test.expect(2);
    var arr1, arr2;

    var s = _();
    var s1 = s.observe().toArray(function (a) {
        arr1 = a;
        if (arr1 && arr2) {
            runTest();
        }
    });
    var s2 = s.observe().toArray(function (a) {
        arr2 = a;
        if (arr1 && arr2) {
            runTest();
        }
    });

    s.write(1);
    s.end();
    s.resume();

    function runTest() {
        test.same(arr1, [1]);
        test.same(arr2, [1]);
        test.done();
    }
};

// TODO: test redirect after fork, forked streams should transfer over
// TODO: test redirect after observe, observed streams should transfer over

exports.flatten = function (test) {
    _.flatten([1, [2, [3, 4], 5], [6]]).toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4, 5, 6]);
        test.done();
    });
};

exports['flatten - noValueOnError'] = noValueOnErrorTest(_.flatten());

exports['flatten - onDestroyTest'] = onDestroyTest(_.flatten, 1);

exports['flatten - ArrayStream'] = function (test) {
    _([1, [2, [3, 4], 5], [6]]).flatten().toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4, 5, 6]);
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
        test.same(xs, [1, 2, 3, 4, 5, 6]);
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

exports['flatten - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.flatten();
}, [1], [[1]]);

exports.otherwise = function (test) {
    test.expect(5);
    _.otherwise(_([4, 5, 6]), _([1, 2, 3])).toArray(function (xs) {
        test.same(xs, [1, 2, 3]);
    });
    _.otherwise(_([4, 5, 6]), _([])).toArray(function (xs) {
        test.same(xs, [4, 5, 6]);
    });
    _.otherwise(_([]), _([1, 2, 3])).toArray(function (xs) {
        test.same(xs, [1, 2, 3]);
    });
    _.otherwise(_([]), _([])).toArray(function (xs) {
        test.same(xs, []);
    });
    // partial application
    _.otherwise(_([4, 5, 6]))(_([1, 2, 3])).toArray(function (xs) {
        test.same(xs, [1, 2, 3]);
    });
    test.done();
};


exports['otherwise - noValueOnError'] = noValueOnErrorTest(_.otherwise(_([])));

exports['otherwise - onDestroyTest'] = onDestroyTest(_.otherwise(_([])), 1);

exports['otherwise - ArrayStream'] = function (test) {
    test.expect(5);
    _([1, 2, 3]).otherwise([4, 5, 6]).toArray(function (xs) {
        test.same(xs, [1, 2, 3]);
    });
    _([]).otherwise([4, 5, 6]).toArray(function (xs) {
        test.same(xs, [4, 5, 6]);
    });
    _([4, 5, 6]).otherwise([]).otherwise([]).toArray(function (xs) {
        test.same(xs, [4, 5, 6]);
    });
    _([]).otherwise([4, 5, 6]).otherwise([]).toArray(function (xs) {
        test.same(xs, [4, 5, 6]);
    });
    _([]).otherwise([]).otherwise([4, 5, 6]).toArray(function (xs) {
        test.same(xs, [4, 5, 6]);
    });
    test.done();
};

exports['otherwise - Redirect'] = function(test) {
    test.expect(3);
    _(function (push, next) {
        next(_([1, 2, 3]));
    }).otherwise([]).toArray(function (xs) {
        test.same(xs, [1, 2, 3]);
    });
    _(function (push, next) {
        next(_([1, 2, 3]));
    }).otherwise([4, 5, 6]).toArray(function (xs) {
        test.same(xs, [1, 2, 3]);
    });
    _(function (push, next) {
        next(_([]));
    }).otherwise([4, 5, 6]).toArray(function (xs) {
        test.same(xs, [4, 5, 6]);
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
    _([1, 2, 3]).otherwise(function() {
        calls++;
        return _([4, 5, 6]);
    }).toArray(function (xs) {
        test.same(calls, 0);
        test.same(xs, [1, 2, 3]);
    });

    var calls2 = 0;
    _([]).otherwise(function() {
        calls2++;
        return _([4, 5, 6]);
    }).toArray(function (xs) {
        test.same(calls2, 1);
        test.same(xs, [4, 5, 6]);
    });

    test.done();
};

exports['otherwise - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.otherwise([1]);
}, [1], []);

exports.append = function (test) {
    test.expect(2);
    _.append(4, [1, 2, 3]).toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4]);
    });
    // partial application
    _.append(4)([1, 2, 3]).toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4]);
    });
    test.done();
};

exports['append - noValueOnError'] = noValueOnErrorTest(_.append(1), [1]);

exports['append - onDestroy'] = onDestroyTest(_.append(2), 1, true);

exports['append - ArrayStream'] = function (test) {
    _([1, 2, 3]).append(4).toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4]);
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
        test.same(xs, [1, 2, 3, 4]);
        test.done();
    });
};

exports['append - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.append(2);
}, [1, 2]);

exports.reduce = function (test) {
    test.expect(3);
    function add(a, b) {
        return a + b;
    }
    _.reduce(add, 10, [1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [20]);
    });
    // partial application
    _.reduce(add, 10)([1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [20]);
    });
    _.reduce(add)(10)([1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [20]);
    });
    test.done();
};
exports['reduce - noValueOnError'] = noValueOnErrorTest(_.reduce(_.add, 0), [0]);
exports['reduce - onDestroy'] = onDestroyTest(_.reduce(_.add, 0), 1, true);
exports['reduce - argument function throws'] = function (test) {
    test.expect(2);
    var err = new Error('error');
    var s = _([1, 2, 3, 4, 5]).reduce(function (memo, x) {
        if (x === 3) { throw err; }
        return memo + x;
    }, 0);
    s.pull(errorEquals(test, 'error'));
    s.pull(valueEquals(test, _.nil));
    test.done();
};
exports['reduce - ArrayStream'] = function (test) {
    function add(a, b) {
        return a + b;
    }
    _([1, 2, 3, 4]).reduce(add, 10).toArray(function (xs) {
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
    s.reduce(add, 10).toArray(function (xs) {
        test.same(xs, [20]);
        test.done();
    });
};

exports['reduce - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.reduce(_.add, 0);
}, [3], [1, 2]);

exports.reduce1 = function (test) {
    test.expect(3);
    function add(a, b) {
        return a + b;
    }
    _.reduce1(add, [1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [10]);
    });
    // partial application
    _.reduce1(add)([1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [10]);
    });
    // single argument
    _.reduce1(add, [1]).toArray(function (xs) {
        test.same(xs, [1]);
    });
    test.done();
};

exports['reduce1 - noValueOnError'] = noValueOnErrorTest(_.reduce1(_.add));

exports['reduce1 - onDestroy'] = onDestroyTest(_.reduce1(_.add), 1, true);

exports['reduce1 - argument function throws'] = function (test) {
    test.expect(2);
    var err = new Error('error');
    var s = _([1, 2, 3, 4, 5]).reduce1(function (memo, x) {
        if (x === 3) { throw err; }
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
    _([1, 2, 3, 4]).reduce1(add).toArray(function (xs) {
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

exports['reduce1 - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.reduce1(_.add);
}, [3], [1, 2]);

exports.scan = function (test) {
    test.expect(3);
    function add(a, b) {
        return a + b;
    }
    _.scan(add, 10, [1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [10, 11, 13, 16, 20]);
    });
    // partial application
    _.scan(add, 10)([1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [10, 11, 13, 16, 20]);
    });
    _.scan(add)(10)([1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [10, 11, 13, 16, 20]);
    });
    test.done();
};
exports['scan - noValueOnError'] = noValueOnErrorTest(_.scan(_.add, 0), [0]);

exports['scan - onDestroy'] = onDestroyTest(_.scan(_.add, 0), 1, true);

exports['scan - argument function throws'] = function (test) {
    test.expect(5);
    var err = new Error('error');
    var s = _([1, 2, 3, 4, 5]).scan(function (memo, x) {
        if (x === 3) { throw err; }
        return memo + x;
    }, 0);
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
    _([1, 2, 3, 4]).scan(add, 10).toArray(function (xs) {
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
    s.scan(add, 10).toArray(function (xs) {
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
    s.scan(add, 10).take(3).toArray(function (xs) {
        test.same(calls, [
            [10, 1],
            [11, 2]
        ]);
        test.same(xs, [10, 11, 13]);
        test.done();
    });
};

exports['scan - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.scan(_.add, 0);
}, [0, 1, 3], [1, 2]);

exports.scan1 = function (test) {
    test.expect(3);
    function add(a, b) {
        return a + b;
    }
    _.scan1(add, [1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [1, 3, 6, 10]);
    });
    // partial application
    _.scan1(add)([1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [1, 3, 6, 10]);
    });
    // single argument
    _.scan1(add, [1]).toArray(function (xs) {
        test.same(xs, [1]);
    });
    test.done();
};

exports['scan1 - noValueOnError'] = noValueOnErrorTest(_.scan1(_.add));

exports['scan1 - onDestroyTest'] = onDestroyTest(_.scan1(_.add), 1);

exports['scan1 - argument function throws'] = function (test) {
    test.expect(4);
    var err = new Error('error');
    var s = _([1, 2, 3, 4, 5]).scan1(function (memo, x) {
        if (x === 3) { throw err; }
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
    _([1, 2, 3, 4]).scan1(add).toArray(function (xs) {
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

exports['scan1 - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.scan1(_.add);
}, [1, 3], [1, 2]);

exports.collect = function (test) {
    _.collect([1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [[1, 2, 3, 4]]);
        test.done();
    });
};

exports['collect - noValueOnError'] = noValueOnErrorTest(_.collect(), [[]]);

exports['collect - onDestroy'] = onDestroyTest(_.collect, 1, true);

exports['collect - ArrayStream'] = function (test) {
    _([1, 2, 3, 4]).collect().toArray(function (xs) {
        test.same(xs, [[1, 2, 3, 4]]);
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
        test.same(xs, [[1, 2, 3, 4]]);
        test.done();
    });
};

exports['collect - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.collect();
}, [[1]]);

exports.transduce = {
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
    },
    'onDestroy': function (test) {
        onDestroyTest(_.transduce(this.xf), 1)(test);
    },
    'returnsSameStream': function (test) {
        var self = this;
        returnsSameStreamTest(function(s) {
            return s.transduce(self.xf);
        }, [2])(test);
    }
};

exports.concat = function (test) {
    test.expect(2);
    _.concat([3, 4], [1, 2]).toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4]);
    });
    // partial application
    _.concat([3, 4])([1, 2]).toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4]);
    });
    test.done();
};

exports['concat - noValueOnError'] = noValueOnErrorTest(_.concat([1]), [1]);

exports['concat - ArrayStream'] = function (test) {
    _([1, 2]).concat([3, 4]).toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4]);
        test.done();
    });
};

exports['concat - piped ArrayStream'] = function (test) {
    _.concat(streamify([3, 4]).pipe(through()), streamify([1, 2])).toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4]);
        test.done();
    });
};

exports['concat - piped ArrayStream - paused'] = function (test) {
    var s1 = streamify([1, 2]);
    var s2 = streamify([3, 4]);
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
        test.same(xs, [1, 2, 3, 4]);
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
        test.same(xs, [1, 2, 3, 4]);
        test.done();
    });
};

exports['concat - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.concat([2]);
}, [1, 2]);

exports.merge = {
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
            test.same(xs, [1, 4, 2, 5, 3, 6]);
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
            test.same(xs, [1, 4, 2, 5, 3, 6]);
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
            test.same(xs, [1, 4, 2, 5, 3, 6]);
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
            test.same(xs, [3, 4, 5, 1, 2]);
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
        });
        srcs.merge().toArray(function(xs) {
            test.same(xs, [1, 3, 6, 9, 12, 2, 4, 7, 10, 13, 3, 5, 8, 11, 14]);
            test.done();
        });
    },
    'github issue #124: detect late end of stream': function(test) {
        var s = _([1, 2, 3])
              .map(function(x) { return _([x]); })
              .merge();

        s.toArray(function(xs) {
            test.same(xs, [1, 2, 3]);
            test.done();
        });
    },
    'handle backpressure': function (test) {
        var s1 = _([1, 2, 3, 4]);
        var s2 = _([5, 6, 7, 8]);
        var s = _.merge([s1, s2]);

        takeNext(s, 5).then(function (xs) {
            test.same(xs, [1, 5, 2, 6, 3]);
            _.setImmediate(function () {
                test.equal(s._outgoing.length, 1);
                test.equal(s1._outgoing.length, 2);
                test.equal(s2._outgoing.length, 2);
                test.done();
            });
        });
        this.clock.tick(100);
    },
    'fairer merge algorithm': function (test) {
        // make sure one stream with many buffered values doesn't crowd
        // out another stream being merged
        var s1 = _([1, 2, 3, 4]);
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

        var self = this;
        takeNext(s, 1).then(function (xs) {
            test.same(xs, [1]);
            return new Promise(function (res, rej) {
                setTimeout(function () {
                    takeNext(s, 4).then(res, rej);
                }, 150);
            });
        }).then(function (xs) {
            test.same(xs, [5, 2, 6, 3]);
            return takeNext(s, 4);
        }).then(function (xs) {
            test.same(xs, [4, 7, 8, _.nil]);
            test.done();
        });
        this.clock.tick(400);
    },
    'noValueOnError': noValueOnErrorTest(_.merge()),
    'returnsSameStream': returnsSameStreamTest(function(s) {
        return s.merge();
    }, [1], [_([1])]),
    'pass through errors (issue #141)': function (test) {
        test.expect(1);

        var s = _(function (push, next) {
            push(new Error());
            push(null, _.nil);
        });
        _([s])
            .merge()
            .errors(anyError(test))
            .each(test.ok.bind(test, false, 'each should not be called'));
        test.done();
    }
};

exports.mergeWithLimit = {
    setUp: function (callback) {
        this.clock = sinon.useFakeTimers();
        this.__delay = function (n){
            return _(function (push, next) {
                setTimeout(function () {
                    push(null, n);
                    push(null, _.nil);
                }, n * 10);
            });
        };
        callback();
    },
    tearDown: function (callback) {
        this.clock.restore();
        delete this.__delay;
        callback();
    },
    'run three at a time': function (test) {
        _.mergeWithLimit(3, [5, 3, 4, 4, 2].map(this.__delay)).toArray(function (xs) {
            test.same(xs, [3, 4, 5, 2, 4]);
            test.done();
        });
        this.clock.tick(100);
    },
    'run two at a time': function (test) {
        _.mergeWithLimit(2, [4, 3, 2, 3, 1].map(this.__delay)).toArray(function (xs) {
            test.same(xs, [3, 4, 2, 1, 3]);
            test.done();
        });
        this.clock.tick(100);
    },
    'run one at a time': function (test) {
        _.mergeWithLimit(1, [4, 3, 2, 3, 1].map(this.__delay)).toArray(function (xs) {
            test.same(xs, [4, 3, 2, 3, 1]);
            test.done();
        });
        this.clock.tick(150);
    },
    'handle backpressure': function (test) {
        var s1 = _([1, 2, 3, 4]);
        var s2 = _([5, 6, 7, 8]);
        var s = _.mergeWithLimit(10, [s1, s2]);
        takeNext(s, 5).then(function (xs) {
            test.same(xs, [1, 5, 2, 6, 3]);
            _.setImmediate(function () {
                test.equal(s._outgoing.length, 1);
                test.equal(s1._outgoing.length, 2);
                test.equal(s2._outgoing.length, 2);
                test.done();
            });
        });
        this.clock.tick(100);
    },
    'correctly forwards errors - issue #475': function (test) {
        test.expect(2);
        var s1 = _([1, 2, 3, 4]);
        var s2 = _(function (push, next) {
            push(new Error('error'));
            push(null, _.nil);
        });
        _([s1, s2]).mergeWithLimit(2)
            .errors(function (err) {
                test.equal(err.message, 'error');
            })
            .toArray(function (xs) {
                test.same(xs, [1, 2, 3, 4]);
                test.done();
            });

        // We use setImmediate, so tick a bunch of times.
        this.clock.tick(1000);
    },
    'noValueOnError': noValueOnErrorTest(_.mergeWithLimit(1))
};

exports.invoke = function (test) {
    test.expect(2);
    _.invoke('toString', [], [1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, ['1', '2', '3', '4']);
    });
    // partial application
    _.invoke('toString')([])([1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, ['1', '2', '3', '4']);
    });
    test.done();
};

exports['invoke - noValueOnError'] = noValueOnErrorTest(_.invoke('toString', []));

exports['invoke - returnsSameStreamTest'] = returnsSameStreamTest(function(s) {
    return s.invoke('toString', []);
}, ['1']);

exports['invoke - ArrayStream'] = function (test) {
    _([1, 2, 3, 4]).invoke('toString', []).toArray(function (xs) {
        test.same(xs, ['1', '2', '3', '4']);
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
        test.same(xs, ['1', '2', '3', '4']);
        test.done();
    });
};

exports.nfcall = function (test) {
    test.expect(4);

    function add(n) {
        return function(state, push) {
            state.val += n;
            push(null, n);
        };
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

exports['nfcall - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.nfcall([]).series();
}, [1], [function(c) { c(null, 1); }]);

exports['nfcall - wraps same stream'] = function (test) {
    var s = _.use({
        foo: true
    });

    s([function(c) { c(null, 1); }]).nfcall([]).apply(function(xs) {
        test.ok(xs.foo);
        test.done();
    });
};

exports['nfcall - ArrayStream'] = function (test) {
    function add(n) {
        return function(state, push) {
            state.val += n;
            return push(null, n);
        };
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
        };
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
};

exports.map = function (test) {
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

exports['map - noValueOnError'] = noValueOnErrorTest(_.map(function (x) { return x; }));

exports['map - onDestroyTest'] = onDestroyTest(_.map(function (x) { return x; }), 1);

exports['map - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.map(function (x) { return x; });
});

exports['map - argument function throws'] = function (test) {
    test.expect(6);
    var err = new Error('error');
    var s = _([1, 2, 3, 4, 5]).map(function (x) {
        if (x === 3) { throw err; }
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

exports['map non-function throws'] = function (test) {
    test.expect(2);

    test.throws(function () {
        _.map('foo', [1, 2]).toArray(function (xs) {
            test.ok(false, 'shouldn\'t be called');
        });
    },
    'map expects a function as its only argument.');

    test.throws(function () {
        _([1, 2, 3]).map(1).toArray(function (xs) {
            test.ok(false, 'shouldn\'t be called');
        });
    },
    'map expects a function as its only argument.');

    test.done();
};

exports.doto = function (test) {
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

exports['doto - noValueOnError'] = noValueOnErrorTest(_.doto(function (x) { return x; }));

exports['doto - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.doto(function (x) { return x; });
});

exports['tap - doto alias'] = function (test) {
    test.expect(2);

    test.strictEqual(_.tap, _.doto);
    test.strictEqual(_([]).tap, _([]).doto);

    test.done();
};

exports.flatTap = function (test) {
    test.expect(2);

    var seen;
    function record(x) {
        var y = x * 2;
        seen.push(y);
        return _([y]);
    }

    seen = [];
    _.flatTap(record, [1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [1, 2, 3, 4]);
        test.same(seen, [2, 4, 6, 8]);
    });
    test.done();
};

exports['flatTap - noValueOnError'] = noValueOnErrorTest(_.doto(function (x) { return x; }));

exports['flatTap - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.flatTap(function (x) { return _([x]); });
});

exports.flatMap = function (test) {
    var f = function (x) {
        return _(function (push, next) {
            setTimeout(function () {
                push(null, x * 2);
                push(null, _.nil);
            }, 10);
        });
    };
    _.flatMap(f, [1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [2, 4, 6, 8]);
        test.done();
    });
};

exports['flatMap - noValueOnError'] = noValueOnErrorTest(_.flatMap(function (x) { return _(); }));

exports['flatMap - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.flatMap(function (x) { return _([x]); });
});

exports['flatMap - argument function throws'] = function (test) {
    test.expect(4);
    var err = new Error('error');
    var s = _([1, 2, 3, 4]).flatMap(function (x) {
        if (x === 1) { return _([x]); }
        if (x === 2) { throw err; }
        if (x === 3) { return _([]); }
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
    _([1, 2, 3, 4]).flatMap(f).toArray(function (xs) {
        test.same(xs, [2, 4, 6, 8]);
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
        test.same(xs, [2, 4, 6, 8]);
        test.done();
    });
};

exports['flatMap - map to Stream of Array'] = function (test) {
    test.expect(1);
    var f = function (x) {
        return _([[x]]);
    };
    var s = _([1, 2, 3, 4]).flatMap(f).toArray(function (xs) {
        test.same(xs, [[1], [2], [3], [4]]);
        test.done();
    });
};

exports.pluck = function (test) {
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

exports['pluck - onDestroy'] = onDestroyTest(_.pluck('foo'), {foo: 1, bar: 2});

exports['pluck - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.pluck('foo');
}, ['bar'], [{foo: 'bar'}]);

exports['pluck - non-object argument'] = function (test) {
    var a = _([1, {type: 'blogpost', title: 'foo'}]);
    test.throws(function () {
        a.pluck('title').toArray(function (xs) {
            test.ok(false, 'shouldn\'t be called');
        });
    },
    'Expected Object, got array');
    test.done();
};


exports.pick = function (test) {
    test.expect(2);
    var a = _([
        {breed: 'chihuahua', name: 'Princess', age: 5},
        {breed: 'labrador', name: 'Rocky', age: 3},
        {breed: 'german-shepherd', name: 'Waffles', age: 9}
    ]);
    a.pick(['breed', 'age']).toArray(function (xs) {
        test.deepEqual(xs, [
          {breed: 'chihuahua', age: 5},
          {breed: 'labrador', age: 3},
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
            {breed: 'labrador', age: 3},
            {breed: 'german-shepherd', age: 9}
        ]);
    });

    test.done();
};

exports['pick - noValueOnError'] = noValueOnErrorTest(_.pick(['plug']));

exports['pick - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.pick(['foo']);
}, [{foo: 'bar'}], [{foo: 'bar', baz: 'quux'}]);

exports['pick - non-existant property'] = function (test) {
    test.expect(9);

    var a = [
        {breed: 'labrador', name: 'Rocky'} // <- missing age
    ];

    _(a).pick(['breed', 'age']).toArray(function (xs) {
        test.equal(xs[0].breed, 'labrador');
        test.ok(Object.keys(xs[0]).length === 1);
    });

    _(a).pick(['age']).toArray(function (xs) {
        test.ok(Object.keys(xs[0]).length === 0);
    });

    var b = _([
        {breed: 'labrador', age: void 0}
    ]);

    b.pick(['breed', 'age']).toArray(function (xs) {
        test.equal(xs[0].breed, 'labrador');
        test.ok(xs[0].hasOwnProperty('age'));
        test.ok(typeof (xs[0].age) === 'undefined');
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
        test.equal(xs[0].breed, 'labrador');
        test.ok(Object.keys(xs[0]).length === 1);
    });

    test.done();
};

exports['pick - non-enumerable properties'] = function (test) {
    test.expect(5);
    var aObj = {breed: 'labrador',
        name: 'Rocky',
        owner: 'Adrian',
        color: 'chocolate'
    };
    Object.defineProperty(aObj, 'age', {enumerable: false, value: 12});
    delete aObj.owner;
    aObj.name = undefined;

    var a = _([
        aObj // <- owner delete, name undefined, age non-enumerable
    ]);


    a.pick(['breed', 'age', 'name', 'owner']).toArray(function (xs) {
        test.equal(xs[0].breed, 'labrador');
        test.equal(xs[0].age, 12);
        test.ok(xs[0].hasOwnProperty('name'));
        test.ok(typeof (xs[0].name) === 'undefined');
        // neither owner nor color was selected
        test.ok(Object.keys(xs[0]).length === 3);
    });


    test.done();
};

exports.pickBy = function (test) {
    test.expect(4);

    var objs = [{a: 1, _a: 2}, {a: 1, _c: 3}];

    _(objs).pickBy(function (value, key) {
        return key.indexOf('_') === 0 && typeof value !== 'function';
    }).toArray(function (xs) {
        test.deepEqual(xs, [{_a: 2}, {_c: 3}]);
    });

    var objs2 = [{a: 1, b: {c: 2}}, {a: 1, b: {c: 4}}, {d: 1, b: {c: 9}}];

    _(objs2).pickBy(function (value, key) {
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

    objs3.pickBy(function (value, key) {
        if (key === 'b' && typeof value.c !== 'undefined') {
            return value.c > 3;
        }
        return false;
    }).toArray(function (xs) {
        test.deepEqual(xs, [{}, {b: {c: 4}}, {b: {c: 9}}]);
    });

    var objs4 = [Object.create({a: 1, _a: 2}), {a: 1, _c: 3}];

    _(objs4).pickBy(function (value, key) {
        return key.indexOf('_') === 0 && typeof value !== 'function';
    }).toArray(function (xs) {
        test.deepEqual(xs, [{_a: 2}, {_c: 3}]);
    });

    test.done();
};

exports['pickBy - noValueOnError'] = noValueOnErrorTest(_.pickBy(' '));

exports['pickBy - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.pickBy(function(v, k) { return k === 'foo'; });
}, [{foo: 'bar'}], [{foo: 'bar'}]);

exports['pickBy - non-existant property'] = function (test) {
    test.expect(3);

    var objs = [{a: 1, b: 2}, {a: 1, d: 3}];

    _(objs).pickBy(function (value, key) {
        return key.indexOf('_') === 0 && typeof value !== 'function';
    }).toArray(function (xs) {
        test.deepEqual(xs, [{}, {}]);
    });

    var objs2 = [{a: 1, b: {c: 2}}, {a: 1, b: {c: 4}}, {d: 1, b: {c: 9}}];

    _(objs2).pickBy(function (value, key) {
        if (key === 'b' && typeof value.c !== 'undefined') {
            return value.c > 10;
        }
        return false;
    }).toArray(function (xs) {
        test.deepEqual(xs, [{}, {}, {}]);
    });

    var objs3 = [{}, {}];

    _(objs3).pickBy(function (value, key) {
        return key.indexOf('_') === 0 && typeof value !== 'function';
    }).toArray(function (xs) {
        test.deepEqual(xs, [{}, {}]);
    });

    test.done();
};

var isES5 = (function () {
    'use strict';
    return Function.prototype.bind && !this;
}());

exports['pickBy - non-enumerable properties'] = function (test) {
    test.expect(5);
    var aObj = {a: 5,
        c: 5,
        d: 10,
        e: 10
    };
    Object.defineProperty(aObj, 'b', {enumerable: false, value: 15});
    delete aObj.c;
    aObj.d = undefined;

    var a = _([
        aObj // <- c delete, d undefined, b non-enumerable but valid
    ]);


    a.pickBy(function (value, key) {
        if (key === 'b' || value === 5 || typeof value === 'undefined') {
            return true;
        }
        return false;
    }).toArray(function (xs) {
        test.equal(xs[0].a, 5);
        if (isES5) {
            test.equal(xs[0].b, 15);
        }
        else {
            test.ok(typeof (xs[0].b) === 'undefined');
        }
        test.ok(xs[0].hasOwnProperty('d'));
        test.ok(typeof (xs[0].d) === 'undefined');
        // neither c nor e was selected, b is not selected by keys
        if (isES5) {
            test.ok(Object.keys(xs[0]).length === 3);
        }
        else {
            test.ok(Object.keys(xs[0]).length === 2);
        }
    });

    test.done();
};

exports['pickBy - overridden properties'] = function (test) {
    test.expect(7);
    var aObj = {
        a: 5,
        c: 5,
        d: 10,
        e: 10,
        valueOf: 10
    };

    var bObj = Object.create(aObj);
    bObj.b = 10;
    bObj.c = 10;
    bObj.d = 5;

    var a = _([
        bObj
    ]);


    a.pickBy(function (value, key) {
        if (value > 7) {
            return true;
        }
        return false;
    }).toArray(function (xs) {
        test.ok(typeof (xs[0].a) === 'undefined');
        test.equal(xs[0].b, 10);
        test.equal(xs[0].c, 10);
        test.ok(typeof (xs[0].d) === 'undefined');
        test.equal(xs[0].e, 10);
        test.equal(xs[0].valueOf, 10);
        test.ok(Object.keys(xs[0]).length === 4);
    });

    test.done();
};


exports.filter = function (test) {
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

exports['filter - noValueOnError'] = noValueOnErrorTest(_.filter(function (x) { return true; }));

exports['filter - onDestroy'] = onDestroyTest(_.filter(function (x) { return true; }), 1);

exports['filter - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.filter(function (x) { return true; });
});

exports['filter - argument function throws'] = function (test) {
    test.expect(3);
    var err = new Error('error');
    var s = _([1, 2, 3]).filter(function (x) {
        if (x === 2) { throw err; }
        if (x === 3) { return false; }
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

exports.flatFilter = function (test) {
    var f = function (x) {
        return _([x % 2 === 0]);
    };
    _.flatFilter(f, [1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [2, 4]);
        test.done();
    });
};

exports['flatFilter - noValueOnError'] = noValueOnErrorTest(_.flatFilter(function (x) { return _([true]); }));

exports['flatFilter - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.flatFilter(function (x) { return _([true]); });
});

exports['flatFilter - argument function throws'] = function (test) {
    test.expect(4);
    var err = new Error('error');
    var s = _([1, 2, 3, 4]).flatFilter(function (x) {
        if (x === 1) { return _([false]); }
        if (x === 2) { throw err; }
        if (x === 3) { return _([]); }
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
    _([1, 2, 3, 4]).flatFilter(f).toArray(function (xs) {
        test.same(xs, [2, 4]);
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
        test.same(xs, [2, 4]);
        test.done();
    });
};

exports.reject = function (test) {
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

exports['reject - noValueOnError'] = noValueOnErrorTest(_.reject(function (x) { return false; }));

exports['reject - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.reject(function (x) { return false; });
});

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

exports.find = function (test) {
    test.expect(2);
    var xs = [
        {type: 'foo', name: 'wibble'},
        {type: 'foo', name: 'wobble'},
        {type: 'bar', name: '123'},
        {type: 'bar', name: 'asdf'},
        {type: 'baz', name: 'asdf'}
    ];
    var f = function (x) {
        return x.type === 'bar';
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

exports['find - noValueOnError'] = noValueOnErrorTest(_.find(function (x) { return true; }));

exports['find - returnsSameStreamTest'] = returnsSameStreamTest(function(s) {
    return s.find(function (x) { return true; });
});

exports['find - argument function throws'] = function (test) {
    test.expect(4);
    var err = new Error('error');
    var s = _([1, 2, 3, 4, 5]).find(function (x) {
        if (x < 3) { throw err; }
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
        return x.type === 'bar';
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
        return x.type === 'baz';
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

    var primatives = [1, 2, 3, 'cat'];

    var pexpected = {1: [1], 2: [2], 3: [3], 'cat': ['cat']};
    var pexpectedUndefined = {'undefined': [1, 2, 3, 'cat']};

    var f = function (x) {
        return x.type;
    };

    var pf = function (o) { return o; };

    var s = 'type';

    exports.group = function (test) {
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

    exports['group - returnsSameStream'] = returnsSameStreamTest(function(s) {
        return s.group('foo');
    }, [{bar: [{foo: 'bar'}]}], [{foo: 'bar'}]);

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
        var s = _([1, 2, 3, 4, 5]).group(function (x) {
            if (x === 5) { throw err; }
            return x % 2 === 0 ? 'even' : 'odd';
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


exports.compact = function (test) {
    test.expect(1);
    _.compact([0, 1, false, 3, undefined, null, 6]).toArray(function (xs) {
        test.same(xs, [1, 3, 6]);
    });
    test.done();
};

exports['compact - noValueOnError'] = noValueOnErrorTest(_.compact());

exports['compact - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.compact();
});

exports['compact - ArrayStream'] = function (test) {
    _([0, 1, false, 3, undefined, null, 6]).compact().toArray(function (xs) {
        test.same(xs, [1, 3, 6]);
        test.done();
    });
};

exports.where = function (test) {
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

exports['where - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.where({'foo': 'bar'});
}, []);

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

exports.findWhere = function (test) {
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
exports['findWhere - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.findWhere({'foo': 'bar'});
}, []);

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

exports.uniqBy = function(test) {
    test.expect(1);
    var xs = ['blue', 'red', 'red', 'yellow', 'blue', 'red'];
    _.uniqBy(function(a, b) { return a[1] === b[1]; }, xs).toArray(function(xs) {
        test.same(xs, ['blue', 'red']);
    });
    test.done();
};

exports['uniqBy - compare error'] = function(test) {
    test.expect(4);
    var xs = ['blue', 'red', 'red', 'yellow', 'blue', 'red'];
    var s = _.uniqBy(function(a, b) {
        if (a === 'yellow') {
            throw new Error('yellow');
        }
        return a === b;
    }, xs);
    s.pull(function(err, x) {
        test.equal(x, 'blue');
    });
    s.pull(function(err, x) {
        test.equal(x, 'red');
    });
    s.pull(function(err, x) {
        test.equal(err.message, 'yellow');
    });
    s.pull(function(err, x) {
        test.equal(x, _.nil);
    });
    test.done();
};

exports['uniqBy - noValueOnError'] = noValueOnErrorTest(_.uniqBy(function(a, b) { return a === b; }));

exports['uniqBy - onDestroy'] = onDestroyTest(_.uniqBy(function(a, b) { return a === b; }), 1);

exports['uniqBy - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.uniqBy(function(a, b) { return a === b; });
});

exports.uniq = function(test) {
    test.expect(1);
    var xs = ['blue', 'red', 'red', 'yellow', 'blue', 'red'];
    _.uniq(xs).toArray(function(xs) {
        test.same(xs, ['blue', 'red', 'yellow']);
    });
    test.done();
};

exports['uniq - preserves Nan'] = function(test) {
    test.expect(5);
    var xs = ['blue', 'red', NaN, 'red', 'yellow', 'blue', 'red', NaN];
    _.uniq(xs).toArray(function(xs) {
        test.equal(xs[0], 'blue');
        test.equal(xs[1], 'red');
        test.equal(xs[2] !== xs[2], true);
        test.equal(xs[3], 'yellow');
        test.equal(xs[4] !== xs[4], true);
    });
    test.done();
};

exports['uniq - noValueOnError'] = noValueOnErrorTest(_.uniq());

exports['uniq - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.uniq();
});

exports.zip = function (test) {
    test.expect(2);
    _.zip([1, 2, 3], ['a', 'b', 'c']).toArray(function (xs) {
        test.same(xs, [['a', 1], ['b', 2], ['c', 3]]);
    });
    // partial application
    _.zip([1, 2, 3, 4, 5])(['a', 'b', 'c']).toArray(function (xs) {
        test.same(xs, [['a', 1], ['b', 2], ['c', 3]]);
    });
    test.done();
};

exports['zip - noValueOnError'] = noValueOnErrorTest(_.zip([1]));

exports['zip - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.zip([1]);
}, [[1, 1]]);

exports['zip - source emits error'] = function (test) {
    test.expect(4);
    var err = new Error('error');
    var s1 = _([1, 2]);
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
    _(['a', 'b', 'c']).zip([1, 2, 3]).toArray(function (xs) {
        test.same(xs, [['a', 1], ['b', 2], ['c', 3]]);
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
        test.same(xs, [['a', 1], ['b', 2], ['c', 3]]);
        test.done();
    });
};

exports.zipEach = function (test) {
    test.expect(3);
    _.zipEach([[4, 5, 6], [7, 8, 9], [10, 11, 12]], [1, 2, 3]).toArray(function (xs) {
        test.same(xs, [[1, 4, 7, 10], [2, 5, 8, 11], [3, 6, 9, 12]]);
    });
    _.zipEach([_([4, 5, 6]), _([7, 8, 9]), _([10, 11, 12])], [1, 2, 3]).toArray(function (xs) {
        test.same(xs, [[1, 4, 7, 10], [2, 5, 8, 11], [3, 6, 9, 12]]);
    });
    // partial application
    _.zipEach([[4, 5, 6], [7, 8, 9], [10, 11, 12]])([1, 2, 3]).toArray(function (xs) {
        test.same(xs, [[1, 4, 7, 10], [2, 5, 8, 11], [3, 6, 9, 12]]);
    });
    test.done();
};

exports['zipEach - noValueOnError'] = noValueOnErrorTest(_.zipEach([1]));

exports['zipEach - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.zipEach([[1]]);
}, [[1, 1]]);

exports['zipEach - StreamOfStreams'] = function (test) {
    test.expect(1);
    _.zipEach(_([[4, 5, 6], [7, 8, 9], [10, 11, 12]]), [1, 2, 3]).toArray(function (xs) {
        test.same(xs, [[1, 4, 7, 10], [2, 5, 8, 11], [3, 6, 9, 12]]);
    });
    test.done();
};

exports['zipEach - source emits error'] = function (test) {
    test.expect(2);
    var err = new Error('zip all error');
    var s1 = _([1, 2, 3]);
    var s2 = _(function (push) {
        push(null, [4, 5, 6]);
        push(err);
        push(null, [7, 8, 9]);
        push(null, [10, 11, 12]);
        push(null, _.nil);
    });

    s1.zipEach(s2).errors(function (err) {
        test.equal(err.message, 'zip all error');
    }).toArray(function (xs) {
        test.same(xs, [[1, 4, 7, 10], [2, 5, 8, 11], [3, 6, 9, 12]]);
    });
    test.done();
};

exports['zipEach - GeneratorStream'] = function (test) {
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

    s1.zipEach(s2).toArray(function (xs) {
        test.same(xs, [[1, 4, 7, 10], [2, 5, 8, 11], [3, 6, 9, 12]]);
        test.done();
    });
};

exports['zipEach - Differing length streams'] = function (test) {
    test.expect(1);
    _.zipEach([[5, 6, 7, 8], [9, 10, 11, 12], [13, 14]])([1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [[1, 5, 9, 13], [2, 6, 10, 14]]);
    });
    test.done();
};

exports.zipAll = {
    setUp: function (cb) {
        this.input = [
            _([1, 2, 3]),
            _([4, 5, 6]),
            _([7, 8, 9]),
            _([10, 11, 12])
        ];
        this.expected = [
            [1, 4, 7, 10],
            [2, 5, 8, 11],
            [3, 6, 9, 12]
        ];
        this.tester = function (expected, test) {
            return function (xs) {
                test.same(xs, expected);
            };
        };
        this.clock = sinon.useFakeTimers();
        cb();
    },
    tearDown: function (cb) {
        this.clock.restore();
        cb();
    },
    'ArrayStream': function (test) {
        test.expect(1);
        _(this.input)
            .zipAll()
            .toArray(this.tester(this.expected, test));
        test.done();
    },
    'partial application': function (test) {
        test.expect(1);
        _.zipAll(this.input)
            .toArray(this.tester(this.expected, test));
        test.done();
    },
    'empty stream': function (test) {
        test.expect(1);
        _.zipAll([]).toArray(this.tester([], test));
        test.done();
    },
    'noValueOnError': noValueOnErrorTest(_.zipAll),
    'returnsSameStream': returnsSameStreamTest(function(s) {
        return s.zipAll();
    }, [[1, 1]], [_([1]), _([1])]),
    'source emits error': function (test) {
        test.expect(5);
        var self = this;
        var err = new Error('zip all error');
        var s = _(function (push) {
            push(null, self.input[0]);
            push(null, self.input[1]);
            push(err);
            push(null, self.input[2]);
            push(null, self.input[3]);
            push(null, _.nil);
        }).zipAll();

        s.pull(errorEquals(test, 'zip all error'));
        s.pull(valueEquals(test, this.expected[0]));
        s.pull(valueEquals(test, this.expected[1]));
        s.pull(valueEquals(test, this.expected[2]));
        s.pull(valueEquals(test, _.nil));
        test.done();
    },
    'GeneratorStream': function (test) {
        var self = this;
        var s = _(function (push, next) {
            push(null, self.input[0]);
            setTimeout(function () {
                push(null, self.input[1]);
                push(null, self.input[2]);
                setTimeout(function () {
                    push(null, self.input[3]);
                    push(null, _.nil);
                }, 50);
            }, 50);
        });

        s.zipAll().toArray(this.tester(this.expected, test));
        this.clock.tick(100);
        test.done();
    },
    'Differing length streams': function (test) {
        test.expect(1);
        _.zipAll([
            this.input[0],
            this.input[1],
            this.input[2],
            this.input[3].take(2)
        ]).toArray(this.tester([
            this.expected[0],
            this.expected[1]
        ], test));
        test.done();
    }
};

exports.batch = function (test) {
    test.expect(5);
    _.batch(3, [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]).toArray(function (xs) {
        test.same(xs, [[1, 2, 3], [4, 5, 6], [7, 8, 9], [0]]);
    });

    _.batch(3, [1, 2, 3]).toArray(function (xs) {
        test.same(xs, [[1, 2, 3]]);
    });

    _.batch(2, [1, 2, 3]).toArray(function (xs) {
        test.same(xs, [[1, 2], [3]]);
    });

    _.batch(1, [1, 2, 3]).toArray(function (xs) {
        test.same(xs, [[1], [2], [3]]);
    });

    _.batch(0, [1, 2, 3]).toArray(function (xs) {
        test.same(xs, [[1, 2, 3]]);
    });

    test.done();
};

exports['batch - noValueOnError'] = noValueOnErrorTest(_.batch(1));
exports['batch - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.batch(1);
}, [[1]]);

exports['batch - ArrayStream'] = function (test) {
    test.expect(5);
    _([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]).batch(3).toArray(function (xs) {
        test.same(xs, [[1, 2, 3], [4, 5, 6], [7, 8, 9], [0]]);
    });

    _([1, 2, 3]).batch(4).toArray(function (xs) {
        test.same(xs, [[1, 2, 3]]);
    });

    _([1, 2, 3]).batch(2).toArray(function (xs) {
        test.same(xs, [[1, 2], [3]]);
    });

    _([1, 2, 3]).batch(1).toArray(function (xs) {
        test.same(xs, [[1], [2], [3]]);
    });

    _([1, 2, 3]).batch(0).toArray(function (xs) {
        test.same(xs, [[1, 2, 3]]);
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

exports.batchWithTimeOrCount = {
    setUp: function (callback) {
        this.clock = sinon.useFakeTimers();

        function delay(push, ms, x) {
            setTimeout(function () {
                push(null, x);
            }, ms);
        }
        this.generator = function (push, next) {
            delay(push, 10, 1);
            delay(push, 20, 2);
            delay(push, 30, 3);
            delay(push, 100, 4);
            delay(push, 110, 5);
            delay(push, 120, 6);
            delay(push, 130, _.nil);
        };

        this.tester = function (stream, test) {
            var results = [];

            stream.each(function (x) {
                results.push(x);
            });

            this.clock.tick(10);
            test.same(results, []);
            this.clock.tick(50);
            test.same(results, [[1, 2]]);
            this.clock.tick(30);
            test.same(results, [[1, 2], [3]]);
            this.clock.tick(10);
            test.same(results, [[1, 2], [3]]);
            this.clock.tick(25);
            test.same(results, [[1, 2], [3], [4, 5]]);
            this.clock.tick(10);
            test.same(results, [[1, 2], [3], [4, 5], [6]]);
            test.done();
        };

        callback();
    },
    tearDown: function (callback) {
        this.clock.restore();
        callback();
    },
    'async generator': function (test) {
        this.tester(_(this.generator).batchWithTimeOrCount(50, 2), test);
    },
    'toplevel - partial application, async generator': function (test) {
        this.tester(_.batchWithTimeOrCount(50)(2)(this.generator), test);
    }
};

exports['batchWithTimeOrCount - noValueOnError'] = noValueOnErrorTest(_.batchWithTimeOrCount(10, 2));
exports['batchWithTimeOrCount - onDestroy'] = onDestroyTest(_.batchWithTimeOrCount(1, 1), 1);
exports['batchWithTimeOrCount - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.batchWithTimeOrCount(10, 2);
}, [[1]]);

exports.splitBy = function(test) {
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

exports['splitBy - onDestroyTest'] = onDestroyTest(_.splitBy('s'), 'miss');

exports['splitBy - returnsSameStreamTest'] = returnsSameStreamTest(function(s) {
    return s.splitBy(' ');
}, ['hello', 'world'], ['hello world']);

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

exports.split = function (test) {
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

exports.intersperse = function(test) {
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
};

exports['intersperse - noValueOnError'] = noValueOnErrorTest(_.intersperse(1));

exports['intersperse - onDestroyTest'] = onDestroyTest(_.intersperse('b'), 'e');

exports['intersperse - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.intersperse(1);
});

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
};

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
};

exports.parallel = function (test) {
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

exports['parallel - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.parallel(1);
}, [1], [_([1])]);

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
    test.expect(1);
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

exports['parallel - behaviour of parallel with fork() - issue #234'] = function (test) {
    test.expect(1);

    function addTen(a) {
        return a + 10;
    }

    function addTwenty(a) {
        return a + 20;
    }

    var arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    var expected = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
        20, 21, 22, 23, 24, 25, 26, 27, 28, 29];

    var baseRange = _(arr);
    var loRange = baseRange.fork();
    var midRange = baseRange.fork().map(addTen);
    var hiRange = baseRange.fork().map(addTwenty);

    _([loRange, midRange, hiRange])
        .parallel(3)
        .toArray(function (xs) {
            test.same(xs, expected);
            test.done();
        });
};

exports['parallel consumption liveness - issue #302'] = function (test) {
    test.expect(3);
    var clock = sinon.useFakeTimers(),
        s3flag = false,
        expected = [1, 2, 10, 20, 30, 40, 100];

    function delay(push, ms, x) {
        setTimeout(function () {
            push(null, x);
        }, ms);
    }

    var s1 = _(function (push) {
        delay(push, 10, 1);
        delay(push, 15, 2);
        delay(push, 20, _.nil);
    });

    var s2 = _(function (push) {
        delay(push, 10, 10);
        delay(push, 20, 20);
        delay(push, 30, 30);
        delay(push, 40, 40);
        delay(push, 50, _.nil);
    });

    var s3 = _(function (push, next) {
        s3flag = true;
        push(null, 100);
        push(null, _.nil);
    });

    _([s1, s2, s3]).parallel(2)
        .toArray(function (xs) {
            test.same(xs, expected);
            test.done();
            clock.restore();
        });

    clock.tick(15);
    test.equal(s3flag, false);
    clock.tick(25);
    test.equal(s3flag, true);
    clock.tick(25);
};


exports['parallel - throw descriptive error on not-stream'] = function (test) {
    test.expect(2);
    var s = _([1]).parallel(2);
    s.pull(errorEquals(test, 'Expected Stream, got number'));
    s.pull(valueEquals(test, _.nil));
    test.done();
};

exports['parallel - parallel should not drop data if paused (issue #328)'] = function (test) {
    test.expect(1);
    var s1 = _([1, 2, 3]);
    var s2 = _([11, 12, 13]);
    _([s1.fork(), s2, s1.fork()])
        .parallel(3)
        .consume(function (err, x, push, next) {
            push(err, x);
            if (x.buf === 21) {
                // Pause for a while.
                setTimeout(next, 1000);
            }
            else if (x !== _.nil) {
                next();
            }
        })
        .toArray(function (xs) {
            test.same(xs, [1, 2, 3, 11, 12, 13, 1, 2, 3]);
            test.done();
        });
};

exports['parallel - should throw if arg is not a number (issue #420)'] = function (test) {
    test.expect(1);
    test.throws(function () {
        _([]).parallel();
    });
    test.done();
};

exports['parallel - should throw if arg is not positive'] = function (test) {
    test.expect(1);
    test.throws(function () {
        _([]).parallel(-1);
    });
    test.done();
};

exports.throttle = {
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
    'noValueOnError': noValueOnErrorTest(_.throttle(10)),
    'onDestroy': onDestroyTest(_.throttle(1), 1),
    'returnsSameStream': returnsSameStreamTest(function(s) {
        return s.throttle(10);
    })
};

exports.debounce = {
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
    'noValueOnError': noValueOnErrorTest(_.debounce(10)),
    'onDestroy': onDestroyTest(_.debounce(1), 1, true),
    'returnsSameStream': returnsSameStreamTest(function(s) {
        return s.debounce(10);
    })
};

exports.latest = {
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
    },
    noValueOnError: noValueOnErrorTest(_.latest),
    onDestroy: onDestroyTest(_.latest, 1, true),
    returnsSameStream: returnsSameStreamTest(function(s) {
        return s.latest();
    })
};

exports.last = function (test) {
    test.expect(3);
    _([1, 2, 3, 4]).last().toArray(function (xs) {
        test.same(xs, [4]);
    });
    _.last([1, 2, 3, 4]).toArray(function (xs) {
        test.same(xs, [4]);
    });
    _.last([]).toArray(function (xs) {
        test.same(xs, []);
    });
    test.done();
};

exports['last - noValueOnError'] = noValueOnErrorTest(_.last());

exports['last - onDestroyTest'] = onDestroyTest(_.last, 1, true);

exports['last - returnsSameStream'] = returnsSameStreamTest(function(s) {
    return s.last();
});

exports.sortBy = {
    setUp: function (cb) {
        this.input = [5, 2, 4, 1, 3];
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
    'noValueOnError': noValueOnErrorTest(_.sortBy(this.compDesc)),
    'returnsSameStream': function(test) {
        var self = this;
        returnsSameStreamTest(function(s) {
            return s.sortBy(self.compDesc);
        })(test);
    }
};

exports.sort = {
    setUp: function (cb) {
        this.input = ['e', 'a', 'd', 'c', 'b'];
        this.sorted = ['a', 'b', 'c', 'd', 'e'];
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
    'noValueOnError': noValueOnErrorTest(_.sort()),
    'returnsSameStream': returnsSameStreamTest(function(s) {
        return s.sort();
    })
};

exports.through = {
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
        this.stringArray = ['1', '2', '3', '4'];
        this.tester = function (expected, test) {
            return function (xs) {
                test.same(xs, expected);
                test.done();
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
    },
    'stream': function (test) {
        test.expect(1);
        var s = _.through(this.parser, this.stringArray);
        s.toArray(this.tester(this.numArray, test));
    },
    'stream - ArrayStream': function (test) {
        test.expect(1);
        var s = _(this.stringArray).through(this.parser);
        s.toArray(this.tester(this.numArray, test));
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
        s.toArray(this.tester([2, 4, 6, 8], test));
    },
    'inputstream - error': function (test) {
        test.expect(2);
        var s = _(function (push) {
            push(new Error('Input error'));
            push(null, _.nil);
        }).through(this.parser);

        s.errors(errorEquals(test, 'Input error'))
            .toArray(this.tester([], test));
    },
    'throughstream - error': function (test) {
        test.expect(2);
        var s = _(['zz{"a": 1}']).through(this.parser);
        s.errors(anyError(test))
            .toArray(this.tester([], test));
    },
    'noValueOnError': function (test) {
        noValueOnErrorTest(_.through(function (x) { return x; }))(test);
    },
    'returnsSameStream - function': function (test) {
        returnsSameStreamTest(function(s) {
            return s.through(function (x) { return x; });
        })(test);
    },
    'returnsSameStream - stream': function (test) {
        var self = this;
        returnsSameStreamTest(function(s) {
            return s.through(self.parser);
        }, this.numArray, this.stringArray)(test);
    }
};

exports.pipeline = {
    'usage test': function (test) {
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
            test.same(xs, [2, 4, 6, 8]);
            test.done();
        });
    },
    'single through function': function (test) {
        var src = streamify([1, 2, 3, 4]);
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
    },
    'no arguments': function (test) {
        var src = streamify([1, 2, 3, 4]);
        var through = _.pipeline();
        src.pipe(through).toArray(function (xs) {
            test.same(xs, [1, 2, 3, 4]);
            test.done();
        });
    },
    'should have backpressure': function (test) {
        test.expect(3);
        var arr = [];
        var pipeline1 = _.pipeline(_.map(function (x) {
            return x + 10;
        }));

        test.ok(pipeline1.paused, 'pipeline should be paused.');
        test.strictEqual(pipeline1.write(1), false,
               'pipeline should return false for calls to write since it is paused.');

        var pipeline2 = _.pipeline(_.map(function (x) {
            return x + 10;
        }));

        _([1, 2, 3])
            .doto(arr.push.bind(arr))
            .pipe(pipeline2)
            .each(arr.push.bind(arr))
            .done(function () {
                test.same(arr, [1, 11, 2, 12, 3, 13]);
                test.done();
            });
    },
    'drain should only be called when there is a need': function (test) {
        test.expect(14);
        var pipeline = _.pipeline(_.flatMap(function (x) {
            return _([x, x + 10]);
        }));

        var spy = sinon.spy();
        pipeline.on('drain', spy);

        var s = _([1, 2, 3]).pipe(pipeline);

        takeNext(s, 1)
            .then(expect(1, 0))
            .then(expect(11, 0))
            .then(expect(2, 1))
            .then(expect(12, 1))
            .then(expect(3, 2))
            .then(expect(13, 2))
            .then(expectDone(3));

        function expect(value, spyCount) {
            return function (arr) {
                test.strictEqual(spy.callCount, spyCount);
                test.deepEqual(arr, [value]);
                return takeNext(s, 1);
            };
        }

        function expectDone(spyCount) {
            return function (arr) {
                test.strictEqual(spy.callCount, spyCount);
                test.deepEqual(arr, [_.nil]);
                test.done();
                return [];
            };
        }
    },
    'ended pipelines should be neither readable nor writable': function (test) {
        var p = _.pipeline(_.map(function (x) { return x + 1; }));
        test.ok(p.readable);
        test.ok(p.writable);
        p.write(0);
        test.ok(p.readable);
        test.ok(p.writable);
        p.end();
        test.ok(p.readable);
        test.ok(!p.writable);
        p.done(function (err, x) {
            test.ok(!p.readable);
            test.ok(!p.writable);
            test.done();
        });
    }
};

exports['pipeline - substream'] = function (test) {
    var s = _.use({
        foo: true
    });

    var src = streamify([1]);

    var through = s.pipeline(function(s) {
        return s;
    });

    test.ok(src.pipe(through).foo);
    test.done();
};


// TODO: test lazy getting of values from obj keys (test using getters?)
exports.values = function (test) {
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

exports.keys = function (test) {
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

exports.pairs = function (test) {
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

exports.extend = function (test) {
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

exports.get = function (test) {
    var a = {foo: 'bar', baz: 123};
    test.equal(_.get('foo', a), 'bar');
    test.equal(_.get('baz')(a), 123);
    test.done();
};

exports.set = function (test) {
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

exports.log = function (test) {
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

exports.wrapCallback = function (test) {
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
            test.ok(false, 'this shouldn\'t be called');
        });
    });
    test.done();
};

exports['wrapCallback - substream'] = function (test) {
    var s = _.use({
        foo: true
    });
    var f = function (cb) {
        cb(null, 'hello');
    };
    test.ok(s.wrapCallback(f)().foo);
    test.done();
};

exports['wrapCallback - with args wrapping by function'] = function (test) {
    function f(cb) {
        cb(null, 1, 2, 3);
    }
    function mapper(){
        return Array.prototype.slice.call(arguments);
    }
    _.wrapCallback(f, mapper)().each(function (x) {
        test.same(x, [1, 2, 3]);
        test.done();
    });
};

exports['wrapCallback - with args wrapping by number'] = function (test) {
    function f(cb) {
        cb(null, 1, 2, 3);
    }
    _.wrapCallback(f, 2)().each(function (x) {
        test.same(x, [1, 2]);
        test.done();
    });
};

exports['wrapCallback - with args wrapping by array'] = function (test) {
    function f(cb) {
        cb(null, 1, 2, 3);
    }
    _.wrapCallback(f, ['one', 'two', 'three'])().each(function (x) {
        test.same(x, {'one': 1, 'two': 2, 'three': 3});
        test.done();
    });
};

exports['wrapCallback - default mapper discards all but first arg'] = function (test) {
    function f(cb) {
        cb(null, 1, 2, 3);
    }
    _.wrapCallback(f)().each(function (x) {
        test.same(x, 1);
        test.done();
    });
};

exports.wrapAsync = {
    'basic functionality': function (test) {
        test.expect(1);
        var f = function (a, b) {
            return new Promise(function (resolve) {
                resolve(a + b);
            });
        };
        _.wrapAsync(f)(1, 2).toArray(function (xs) {
            test.same(xs, [3]);
            test.done();
        });
    },
    context: function (test) {
        test.expect(2);
        var o = {
            f: function (a, b) {
                test.equal(this, o);
                return new Promise(function (resolve) {
                    resolve(a + b);
                });
            }
        };
        o.g = _.wrapAsync(o.f);
        o.g(1, 2).toArray(function (xs) {
            test.same(xs, [3]);
            test.done();
        });
    },
    'promise error': function (test) {
        test.expect(3);
        var errs = [];
        var f = function (a, b) {
            return new Promise(function (resolve, reject) {
                reject(new Error('boom'));
            });
        };
        _.wrapAsync(f)(1, 2)
            .errors(function (err) {
                errs.push(err);
            })
            .toArray(function (xs) {
                test.equal(errs[0].message, 'boom');
                test.equal(errs.length, 1);
                test.same(xs, []);
                test.done();
            });
    },
    'wrong type error': function (test) {
        test.expect(3);
        var errs = [];
        var f = function (a, b) {
            return {};
        };
        _.wrapAsync(f)()
            .errors(function (err) {
                errs.push(err);
            })
            .toArray(function (xs) {
                test.equal(errs[0].message, 'Wrapped function did not return a promise');
                test.equal(errs.length, 1);
                test.same(xs, []);
                test.done();
            });
    },
    substream: function (test) {
        test.expect(1);
        var s = _.use({
            foo: true
        });
        var f = function () {
            return new Promise(function (resolve) {
                resolve('hello');
            });
        };
        test.ok(s.wrapAsync(f)().foo);
        test.done();
    }
};

exports.streamifyAll = {
    'throws when passed a non-function non-object': function (test) {
        test.throws(function () {
            _.streamifyAll(1);
        }, TypeError);
        test.done();
    },
    'streamifies object methods': function (test) {
        var plainObject = {fn: function (a, b, cb) { cb(null, a + b); }};
        var obj = _.streamifyAll(plainObject);
        test.equal(typeof obj.fnStream, 'function');
        obj.fnStream(1, 2).apply(function (res) {
            test.equal(res, 3);
            test.done();
        });
    },
    'streamifies constructor prototype methods': function (test) {
        function ExampleClass (a) { this.a = a; }
        ExampleClass.prototype.fn = function (b, cb) { cb(null, this.a + b); };
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
        Grandfather.prototype.fn1 = function (b, cb) { cb(null, this.a * b); };
        function Father () {}
        Father.prototype = Object.create(Grandfather.prototype);
        Father.prototype.fn2 = function (b, cb) { cb(null, this.a / b); };
        function Child (a) { this.a = a; }
        Child.prototype = Object.create(Father.prototype);
        Child.prototype.fn3 = function (b, cb) { cb(null, this.a + b); };
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
        var plainObject = {fn: function (a, b, cb) { cb(null, a + b); }};
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
    'doesn\'t break when property has custom getter': function (test) {
        function ExampleClass (a) { this.a = {b: a}; }
        Object.defineProperty(ExampleClass.prototype, 'c',
            {get: function () { return this.a.b; }});

        test.doesNotThrow(function () {
            _.streamifyAll(ExampleClass);
        });
        test.done();
    },
    'substream': function (test) {
        var s = _.use({
            foo: true
        });
        var obj = s.streamifyAll({
            bar: function(cb) {
                cb(null, 'hello');
            }
        });

        test.ok(obj.barStream().foo);
        test.done();
    }
};

exports.add = function (test) {
    test.equal(_.add(1, 2), 3);
    test.equal(_.add(3)(2), 5);
    return test.done();
};

exports.not = function (test) {
    test.equal(_.not(true), false);
    test.equal(_.not(123), false);
    test.equal(_.not('asdf'), false);
    test.equal(_.not(false), true);
    test.equal(_.not(0), true);
    test.equal(_.not(''), true);
    test.equal(_.not(null), true);
    test.equal(_.not(undefined), true);
    return test.done();
};

exports.use = {
    'creates a new Stream environment': function (test) {
        var sub = _.use();
        test.ok(_.isStream(sub()));
        test.done();
    },

    'streams': function (test) {
        var sub = _.use();
        sub([1, 2, 3]).toArray(function(xs) {
            test.same(xs, [1, 2, 3]);
            test.done();
        });
    },

    'returns streams of the same type': function(test) {
        var sub = _.use({foo: true});
        var s = sub([1, 2, 3]).map(function(i) { return i; });
        test.ok(s.foo);
        test.done();
    },

    'attatches methods': function(test) {
        var sub = _.use({
            foo: function() {
                return this;
            }
        });

        var s = sub();
        test.equal(s.foo(), s);
        test.done();
    },

    'doesn\'t modify original environment': function(test) {
        var sub = _.use({
            foo: function() {}
        });

        var s = _();
        var t = sub();
        test.equal(typeof t.foo, 'function');
        test.equal(typeof s.foo, 'undefined');
        test.done();
    },

    'casts between streams calling methods': function(test) {
        var streamA = _.use({
            foo: function() {
                return this;
            }
        });
        var streamB = _.use();
        test.equal(typeof streamA.foo(streamB()).foo, 'function');
        test.done();
    },

    'casts between streams calling topLevel': function(test) {
        var streamA = _.use({
            foo: function() {
                return this;
            }
        });
        var streamB = _.use();
        test.equal(typeof streamA(streamB()).foo, 'function');
        test.done();
    },

    'can add methods directly to topLevel': function(test) {
        var sub = _.use({
            foo: true
        }, {
            bar: function() {
                return this();
            }
        });
        test.ok(sub.bar().foo);
        test.done();
    }
};

exports['streams can be used as orchestrator tasks (issue #438)'] = function (test) {
    var isReady = false;
    var s = _();
    runTask(function () { return s; }, function () {
        test.ok(isReady, 'task finished too early');
        test.done();
    });
    setTimeout(function () {
        isReady = true;
        s.end();
    }, 10);
};

exports['ended streams should be neither readable nor writable'] = function (test) {
    var s = _();
    test.ok(s.readable);
    test.ok(s.writable);
    s.write(1);
    test.ok(s.readable);
    test.ok(s.writable);
    s.end();
    test.ok(s.readable);
    test.ok(!s.writable);
    s.done(function (err, x) {
        test.ok(!s.readable);
        test.ok(!s.writable);
        test.done();
    });
};

exports['errored streams should not be readable'] = function (test) {
    var s = _();
    var s1 = s.map(function () { throw new Error(); });
    s1.resume();
    test.ok(s1.readable);
    s.write(1);
    test.ok(!s1.readable);
    test.done();
};

exports['destroyed streams should be neither readable nor writable'] = function (test) {
    var s = _();
    test.ok(s.readable);
    test.ok(s.writable);
    s.destroy();
    test.ok(!s.readable);
    test.ok(!s.writable);
    test.done();
};
