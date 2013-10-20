var Stream = require('../highland').Stream,
    Nil = require('../highland').Nil;


exports['consume array stream'] = function (test) {
    var calls = [];
    var c = Stream([1,2,3]).consume(function (err, x) {
        if (x === Nil) {
            test.same(calls, [1,2,3]);
            test.done();
        }
        else {
            calls.push(x);
        }
    });
    c.resume();
};

exports['array consumers have independent iterators'] = function (test) {
    var s = Stream([1,2,3]);
    var c1_calls = [];
    var c2_calls = [];
    var c1 = s.consume(function (err, x) {
        c1_calls.push(x);
    });
    var c2 = s.consume(function (err, x) {
        c2_calls.push(x);
    });
    c1.resume();
    test.same(c1_calls, [1,2,3,Nil]);
    test.same(c2_calls, []);
    c2.resume();
    test.same(c1_calls, [1,2,3,Nil]);
    test.same(c2_calls, [1,2,3,Nil]);
    test.done();
};

exports['array consumers are sent values eagerly until pause'] = function (test) {
    var s = Stream([1,2,3]);
    var paused_once = false;
    var calls = [];
    var c = s.consume(function (err, x) {
        if (x === 2 && !paused_once) {
            c.pause();
            paused_once = true;
        }
        calls.push(x);
    });
    test.same(calls, []);
    c.resume();
    test.same(calls, [1,2]);
    c.resume();
    test.same(calls, [1,2,3,Nil]);
    test.done();
};

exports['consume mapped array stream'] = function (test) {
    var mul2 = function (x) {
        return x * 2;
    };
    var calls = [];
    var c = Stream([1,2,3]).map(mul2).consume(function (err, x) {
        if (x === Nil) {
            test.same(calls, [2,4,6]);
            test.done();
        }
        else {
            calls.push(x);
        }
    });
    c.resume();
};

exports['mapped array consumers have independent iterators'] = function (test) {
    var mul2 = function (x) {
        return x * 2;
    };
    var s = Stream([1,2,3]).map(mul2);
    var c1_calls = [];
    var c2_calls = [];
    var c1 = s.consume(function (err, x) {
        c1_calls.push(x);
    });
    var c2 = s.consume(function (err, x) {
        c2_calls.push(x);
    });
    c1.resume();
    test.same(c1_calls, [2,4,6,Nil]);
    test.same(c2_calls, []);
    c2.resume();
    test.same(c1_calls, [2,4,6,Nil]);
    test.same(c2_calls, [2,4,6,Nil]);
    test.done();
};

exports['mapped array consumers are sent values eagerly until pause'] = function (test) {
    var mul2 = function (x) {
        return x * 2;
    };
    var s = Stream([1,2,3]).map(mul2);
    var paused_once = false;
    var calls = [];
    var c = s.consume(function (err, x) {
        if (x === 4 && !paused_once) {
            c.pause();
            paused_once = true;
        }
        calls.push(x);
    });
    test.same(calls, []);
    c.resume();
    test.same(calls, [2,4]);
    c.resume();
    test.same(calls, [2,4,6,Nil]);
    test.done();
};

exports['consume async generator stream'] = function (test) {
    var s = Stream(function (push, next) {
        push(1)
        setTimeout(function () {
            push(2);
            setTimeout(function () {
                push(Nil);
            }, 0);
        }, 0);
    });
    var calls = [];
    var c = s.consume(function (err, x) {
        calls.push(x);
    });
    c.resume();
    setTimeout(function () {
        test.same(calls, [1,2,Nil]);
        test.done();
    }, 100);
};

exports['consume sync generator stream'] = function (test) {
    var s = Stream(function (push, next) {
        push(1)
        push(2);
        push(Nil);
    });
    var calls = [];
    var c = s.consume(function (err, x) {
        calls.push(x);
    });
    c.resume();
    test.same(calls, [1,2,Nil]);
    test.done();
};

exports['consume long sync generator stream'] = function (test) {
    var arr = [];
    for (var i = 0; i < 50000; i++) {
        arr.push(i);
    }
    arr.push(Nil);
    var s = Stream(function (push, next) {
        for (var i = 0; i < 50000; i++) {
            push(i);
        }
        push(Nil);
    });
    var calls = [];
    var c = s.consume(function (err, x) {
        calls.push(x);
    });
    c.resume();
    test.same(calls, arr);
    test.done();
};

exports['redirect generator stream using next'] = function (test) {
    function countdown(n) {
        return Stream(function (push, next) {
            push(n);
            if (n === 1) {
                push(Nil);
            }
            else {
                next(countdown(n - 1));
            }
        });
    }
    var calls = [];
    countdown(5).each(function (x) {
        calls.push(x);
    });
    test.same(calls, [5,4,3,2,1]);
    test.done();
};

exports['generator stream consumers share iterator'] = function (test) {
    var s = Stream(function (push, next) {
        push(1);
        push(2);
        push(3);
        push(4);
        push(Nil);
    });
    var m1 = s.map(function (x) {
        return x * 2;
    });
    var m2 = s.map(function (x) {
        return x * x;
    });
    var calls1 = [];
    var calls2 = [];
    var c1 = m1.consume(function (err, x) {
        calls1.push(x);
        c1.pause();
    });
    var c2 = m2.consume(function (err, x) {
        calls2.push(x);
    });
    c1.resume();
    test.same(calls1, []);
    test.same(calls2, []);
    c2.resume();
    test.same(calls1, [2]);
    test.same(calls2, [1]);
    c1.resume();
    test.same(calls1, [2,4]);
    test.same(calls2, [1,4]);
    c2.pause();
    c1.resume();
    test.same(calls1, [2,4]);
    test.same(calls2, [1,4]);
    c2.resume();
    test.same(calls1, [2,4,6]);
    test.same(calls2, [1,4,9]);
    c1.resume();
    test.same(calls1, [2,4,6,8]);
    test.same(calls2, [1,4,9,16]);
    test.done();
};

exports['generator consumers are sent values eagerly until pause'] = function (test) {
    var s = Stream(function (push, next) {
        push(1);
        push(2);
        push(3);
        push(Nil);
    });
    var paused_once = false;
    var calls = [];
    var c = s.consume(function (err, x) {
        if (x === 2 && !paused_once) {
            c.pause();
            paused_once = true;
        }
        calls.push(x);
    });
    test.same(calls, []);
    c.resume();
    test.same(calls, [1,2]);
    c.resume();
    test.same(calls, [1,2,3,Nil]);
    test.done();
};
