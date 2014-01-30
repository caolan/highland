var //EventEmitter = require('events').EventEmitter,
    //streamify = require('stream-array'),
    //concat = require('concat-stream'),
    _ = require('./index');


/***** Streams *****/

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
    test.same(s.incoming, []);
    test.strictEqual(s.write(1), false);
    test.same(s.incoming, [1]);
    test.strictEqual(s.write(2), false);
    test.same(s.incoming, [1,2]);
    test.done();
};

exports['write when not paused sends to consumer'] = function (test) {
    var vals = [];
    var s1 = _();
    var s2 = s1.through(function (err, x, push, next) {
        vals.push(x);
        next();
    });
    test.ok(s1.paused);
    test.ok(s2.paused);
    test.same(s1.incoming, []);
    test.same(s2.incoming, []);
    s2.resume();
    test.ok(!s1.paused);
    test.ok(!s2.paused);
    test.strictEqual(s1.write(1), true);
    test.strictEqual(s1.write(2), true);
    test.same(s1.incoming, []);
    test.same(s2.incoming, []);
    test.same(vals, [1,2]);
    test.done();
};

exports['buffered incoming data released on resume'] = function (test) {
    var vals = [];
    var s1 = _();
    var s2 = s1.through(function (err, x, push, next) {
        vals.push(x);
        next();
    });
    test.strictEqual(s1.write(1), false);
    test.same(s1.incoming, [1]);
    test.same(s2.incoming, []);
    s2.resume();
    test.same(vals, [1]);
    test.same(s1.incoming, []);
    test.same(s2.incoming, []);
    test.strictEqual(s1.write(2), true);
    test.same(vals, [1,2]);
    test.done();
};

exports['restart buffering incoming data on pause'] = function (test) {
    var vals = [];
    var s1 = _();
    var s2 = s1.through(function (err, x, push, next) {
        vals.push(x);
        next();
    });
    s2.resume();
    test.strictEqual(s1.write(1), true);
    test.strictEqual(s1.write(2), true);
    test.same(s1.incoming, []);
    test.same(s2.incoming, []);
    test.same(vals, [1,2]);
    s2.pause();
    test.strictEqual(s1.write(3), false);
    test.strictEqual(s1.write(4), false);
    test.same(s1.incoming, [3,4]);
    test.same(s2.incoming, []);
    test.same(vals, [1,2]);
    s2.resume();
    test.same(s1.incoming, []);
    test.same(s2.incoming, []);
    test.same(vals, [1,2,3,4]);
    test.done();
};

/*
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
*/

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
    var consumer = s.through(function (err, x, push, next) {
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

/*
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
        console.log(['RESULT 1', xs]);
        test.equal(s1_gen_calls, 1);
        test.equal(s2_gen_calls, 0);
        test.same(xs, [1]);
        s1.take(1).toArray(function (xs) {
            console.log(['RESULT 2', xs]);
            test.equal(s1_gen_calls, 1);
            test.equal(s2_gen_calls, 1);
            test.same(xs, [2]);
            s1.take(1).toArray(function (xs) {
                console.log(['RESULT 3', xs]);
                test.equal(s1_gen_calls, 1);
                test.equal(s2_gen_calls, 1);
                test.same(xs, []);
                test.done();
            });
        });
    });
};

exports['lazily evalute stream'] = function (test) {
    var map_calls = [];
    function doubled(x) {
        map_calls.push(x);
        return x * 2;
    }
    var s = _([1, 2, 3, 4]);
    s.map(doubled).take(2).toArray(function (xs) {
        test.same(xs, [2, 4]);
    });
    test.same(map_calls, [1, 2]);
    test.done();
};


/*
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
        test.same(s1.incoming, [1]);
        test.same(s2.incoming, []);
        test.same(xs, []);
        s2.resume();
        setTimeout(function () {
            test.same(s1.incoming, []);
            test.same(s2.incoming, []);
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
    var src = _([1,2,3,4]);
    var xs = [];
    var dest = new EventEmitter();
    dest.writable = true;
    dest.write = function (x) {
        xs.push(x);
        if (xs.length === 2) {
            setImmediate(function () {
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

exports['adding multiple consumers should error'] = function (test) {
    var s = _([1,2,3,4]);
    s.consume(function () {});
    test.throws(function () {
        s.consume(function () {});
    });
    test.done();
};

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
        test.same(calls, 3);
        test.done();
    });
};
*/
