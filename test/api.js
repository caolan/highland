var highland = require('../highland'),
    Stream = highland.Stream,
    Nil = highland.Nil;


exports['empty stream returns Nil on read'] = function (test) {
    var s = Stream();
    var c = s.consume(function (err, x) {
        test.equal(x, Nil);
        test.done();
    });
    c.resume();
};

exports['calls generator on read'] = function (test) {
    var gen_calls = 0;
    var s = Stream(function (push, next) {
        gen_calls++;
        push(1);
        push(Nil);
    });
    test.equal(gen_calls, 0);
    var c = s.consume(function (err, x) {
        test.equal(gen_calls, 1);
        test.equal(x, 1);
        c.reader = function (err, x) {
            test.equal(gen_calls, 1);
            test.equal(x, Nil);
            test.done();
        };
    });
    c.resume();
};

exports['calls generator multiple times if paused by next'] = function (test) {
    var gen_calls = 0;
    var vals = [1, 2];
    var s = Stream(function (push, next) {
        gen_calls++;
        if (vals.length) {
            push(vals.shift());
            next();
        }
        else {
            push(Nil);
        }
    });
    test.equal(gen_calls, 0);
    var c = s.consume(function (err, x) {
        test.equal(gen_calls, 1);
        test.equal(x, 1);
        c.reader = function (err, x) {
            test.equal(gen_calls, 2);
            test.equal(x, 2);
            c.reader = function (err, x) {
                test.equal(gen_calls, 3);
                test.equal(x, Nil);
                test.done();
            };
        };
    });
    c.resume();
};

exports['switch to alternate stream using next'] = function (test) {
    var s2_gen_calls = 0;
    var s2 = Stream(function (push, next) {
        s2_gen_calls++;
        push(2);
        push(Nil);
    });
    var s1_gen_calls = 0;
    var s1 = Stream(function (push, next) {
        s1_gen_calls++;
        push(1);
        next(s2);
    });
    test.equal(s1_gen_calls, 0);
    test.equal(s2_gen_calls, 0);
    var c = s1.consume(function (err, x) {
        test.equal(s1_gen_calls, 1);
        test.equal(s2_gen_calls, 0);
        test.equal(x, 1);
        c.reader = function (err, x) {
            test.equal(s1_gen_calls, 1);
            test.equal(s2_gen_calls, 1);
            test.equal(x, 2);
            c.reader = function (err, x) {
                test.equal(s1_gen_calls, 1);
                test.equal(s2_gen_calls, 1);
                test.equal(x, Nil);
                test.done();
            };
        };
    });
    c.resume();
};

exports['push events to stream and map'] = function (test) {
    var s = Stream(function (push, next) {
        push(1);
        push(2);
        push(3);
        push(4);
        next(Stream());
    });
    var doubled = s.map(function (x) {
        return x * 2;
    });
    doubled.toArray(function (xs) {
        test.same(xs, [2,4,6,8]);
        test.done();
    });
};

exports['lazily pull values from stream'] = function (test) {
    function countdown(n) {
        return Stream(function (push, next) {
            if (n === 0) {
                next(Stream());
            }
            else {
                push(n);
                next(countdown(n - 1));
            }
        });
    }
    var s = countdown(5).transform(function (err, x, push, next) {
        setTimeout(function () {
            push(x);
            if (x !== Nil) {
                next();
            }
        }, 100);
    });
    s.toArray(function (xs) {
        test.same(xs, [5,4,3,2,1]);
        test.done();
    });
};

exports['make sure buffer is exhausted before passing to next stream'] = function (test) {
    var s2 = Stream(function (push, next) {
        push(3);
        push(Nil);
    });
    var s1 = Stream(function (push, next) {
        push(1);
        push(2);
        next(s2);
    });
    var c = s1.consume(function (err, x) {
        c.pause();
        test.equal(x, 1);
        setTimeout(function () {
            c.reader = function (err, x) {
                c.pause();
                test.equal(x, 2);
                setTimeout(function () {
                    c.reader = function (err, x) {
                        c.pause();
                        test.equal(x, 3);
                        setTimeout(function () {
                            c.reader = function (err, x) {
                                test.equal(x, Nil);
                                test.done();
                            };
                            c.resume();
                        }, 100);
                    };
                    c.resume();
                }, 100);
            };
            c.resume();
        }, 100);
    });
    c.resume();
};

exports['initialize a stream with an array'] = function (test) {
    var s = Stream([1,2,3,4]);
    var s2 = s.map(function (x) {
        return x * 2;
    });
    s2.toArray(function (xs) {
        test.same(xs, [2,4,6,8]);
        test.done();
    });
};

exports['merge streams in parallel'] = function (test) {
    var s1 = Stream(function (push, next) {
        setTimeout(function () {
            push(1);
            next(Stream());
        }, 200);
    });
    var s2 = Stream(function (push, next) {
        setTimeout(function () {
            push(2);
            next(Stream());
        }, 100);
    });
    var s3 = Stream(function (push, next) {
        setTimeout(function () {
            push(3);
            next(Stream());
        }, 300);
    });
    Stream([s1, s2, s3]).parallel().toArray(function (arr) {
        test.same(arr, [2, 1, 3]);
        test.done();
    });
};

exports['consume array stream'] = function (test) {
    var s = Stream([1,2,3]);
    var c = s.consume(function (err, x) {
        test.equal(x, 1);
        c.reader = function (err, x) {
            test.equal(x, 2);
            c.reader = function (err, x) {
                test.equal(x, 3);
                c.reader = function (err, x) {
                    test.equal(x, Nil);
                    test.done();
                };
            };
        };
    });
    c.resume();
};

exports['push error onto stream'] = function (test) {
    var e = new Error('broken');
    var s = Stream(function (push, next) {
        push(1);
        push.error(e);
        push(2);
        next(Stream());
    });
    var errors = [];
    var values = [];
    s.walk(function (err, val) {
        if (err) {
            errors.push(err);
        }
        else if (val) {
            if (val !== Nil) {
                values.push(val);
            }
            else {
                test.same(errors, [e]);
                test.same(values, [1,2]);
                test.done();
            }
        }
    });
};

exports['throw error if consumed by each'] = function (test) {
    var e = new Error('broken');
    var s = Stream(function (push, next) {
        push(1);
        push.error(e);
        push(2);
        next(Stream());
    });
    test.throws(function () {
        s.each(function (x) {
            // do nothing
        });
    });
    test.done();
};

exports['map - pass errors along stream'] = function (test) {
    var e = new Error('broken');
    var s = Stream(function (push, next) {
        push(1);
        push.error(e);
        push(2);
        next(Stream());
    });
    var errors = [];
    var values = [];
    var s2 = s.map(function (x) {
        return x * 2;
    });
    s2.walk(function (err, val) {
        if (err) {
            errors.push(err);
        }
        else if (val) {
            if (val !== Nil) {
                values.push(val);
            }
            else {
                test.same(errors, [e]);
                test.same(values, [2,4]);
                test.done();
            }
        }
    });
};

exports['thunk stream'] = function (test) {
    var map_calls = [];
    var s = Stream(function (push, next) {
        push(1);
        push(2);
        push(3);
        next(Stream());
    });
    var s2 = s.map(function (x) {
        map_calls.push(x);
        return x * 2;
    });
    test.same(map_calls, []);
    s2.thunk(function () {
        test.same(map_calls, [1,2,3]);
        test.done();
    });
};

exports['thunk array stream'] = function (test) {
    var map_calls = [];
    var s = Stream([1,2,3]).map(function (x) {
        map_calls.push(x);
        return x * 2;
    });
    test.same(map_calls, []);
    s.thunk(function () {
        test.same(map_calls, [1,2,3]);
        test.done();
    });
};

exports['merge streams in series'] = function (test) {
    var s1 = Stream(function (push, next) {
        setTimeout(function () {
            push(1);
            next(Stream());
        }, 200);
    });
    var s2 = Stream(function (push, next) {
        setTimeout(function () {
            push(2);
            next(Stream());
        }, 100);
    });
    var s3 = Stream(function (push, next) {
        setTimeout(function () {
            push(3);
            next(Stream());
        }, 300);
    });
    Stream([s1, s2, s3]).series().toArray(function (arr) {
        test.same(arr, [1, 2, 3]);
        test.done();
    });
};

exports['stream.apply'] = function (test) {
    var s = Stream(function (push, next) {
        push(1);
        push(2);
        push(3);
        next(Stream());
    });
    s.apply(function (a, b, c) {
        test.equal(a, 1);
        test.equal(b, 2);
        test.equal(c, 3);
        test.equal(arguments.length, 3);
        test.done();
    });
};

exports['stream.concat'] = function (test) {
    var s1 = Stream(function (push, next) {
        setTimeout(function () {
            push(1);
            next(Stream());
        }, 200);
    });
    var s2 = Stream([2]);
    var s = s1.concat(s2).concat([3,4]).toArray(function (arr) {
        test.same(arr, [1,2,3,4]);
        test.done();
    });
};

exports['stream.last'] = function (test) {
    Stream([1,2,3,4]).last().apply(function (x) {
        test.equal(x, 4);
        test.done();
    });
};

// TODO: test filter function

/*
exports['long sync stream generator'] = function (test) {
    test.done();
};

exports['deeply recursive sync stream generator using next'] = function (test) {
    test.done();
};
*/
