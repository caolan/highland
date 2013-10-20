var h = require('../highland');


exports['curry'] = function (test) {
    var fn = h.curry(function (a, b, c, d) {
        return a + b + c + d;
    });
    test.equal(fn(1,2,3,4), fn(1,2)(3,4));
    test.equal(fn(1,2,3,4), fn(1)(2)(3)(4));
    var fn2 = function (a, b, c, d) {
        return a + b + c + d;
    };
    test.equal(h.curry(fn2)(1,2,3,4), h.curry(fn2,1,2,3,4));
    test.equal(h.curry(fn2)(1,2,3,4), h.curry(fn2,1,2)(3,4));
    test.done();
};

exports['ncurry'] = function (test) {
    var fn = h.ncurry(3, function (a, b, c, d) {
        return a + b + c + (d || 0);
    });
    test.equal(fn(1,2,3,4), 6);
    test.equal(fn(1,2,3,4), fn(1,2)(3));
    test.equal(fn(1,2,3,4), fn(1)(2)(3));
    var fn2 = function () {
        var args = Array.prototype.slice(arguments);
        return args.reduce(function (a, b) { return a + b; }, 0);
    };
    test.equal(h.ncurry(3,fn2)(1,2,3,4), h.ncurry(3,fn2,1,2,3,4));
    test.equal(h.ncurry(3,fn2)(1,2,3,4), h.ncurry(3,fn2,1,2)(3,4));
    test.done();
};

exports['compose'] = function (test) {
    function prepend(x) {
        return function (str) {
            return x + str;
        };
    }
    var fn1 = prepend('one:');
    var fn2 = prepend('two:');
    var fn = h.compose(fn2, fn1);
    test.equal(fn('zero'), 'two:one:zero');
    // partial application
    test.equal(h.compose(fn2)(fn1)('zero'), 'two:one:zero');
    test.done();
};

exports['apply'] = function (test) {
    var fn = function (a, b, c, d) {
        return a + b + c + d;
    };
    test.equal(h.apply(fn, [1,2,3,4]), 10);
    test.equal(h.apply(fn, [1,1,1,1]), 4);
    // partial application
    test.equal(h.apply(fn)([1,2,3,4]), 10);
    test.done();
};

exports['partial'] = function (test) {
    var addAll = function () {
        var args = Array.prototype.slice.call(arguments);
        return args.reduce(function (a, b) { return a + b; }, 0);
    };
    var f = h.partial(addAll, 1, 2);
    test.equal(f(3, 4), 10);
    test.done();
};

exports['flip'] = function (test) {
    var subtract = function (a, b) {
        return a - b;
    };
    test.equal(subtract(4,2), 2);
    test.equal(h.flip(subtract)(4,2), -2);
    test.equal(h.flip(subtract, 4)(2), -2);
    test.equal(h.flip(subtract, 4, 2), -2);
    test.done();
};

exports['seq'] = function (test) {
    function prepend(x) {
        return function (str) {
            return x + str;
        };
    }
    var fn1 = prepend('one:');
    var fn2 = prepend('two:');
    var fn = h.seq(fn1, fn2);
    test.equal(fn('zero'), 'two:one:zero');
    // partial application
    test.equal(h.seq(fn1)(fn2)('zero'), 'two:one:zero');
    test.done();
}




exports['top level map function - array'] = function (test) {
    var mul2 = function (x) {
        return x * 2;
    };
    h.map(mul2, [1,2,3]).toArray(function (xs) {
        test.same(xs, [2,4,6]);
        test.done();
    });
};

exports['top level map function curry - array'] = function (test) {
    var mul2 = function (x) {
        return x * 2;
    };
    var mapper = h.map(mul2);
    mapper([1,2,3]).toArray(function (xs) {
        test.same(xs, [2,4,6]);
        test.done();
    });
};

exports['concat'] = function (test) {
    var a = [1];
    var b = [2,3];
    h.concat(a, b).toArray(function (arr) {
        test.same(arr, [1,2,3]);
        test.done();
    });
};

exports['zip'] = function (test) {
    h.zip([1,2,3], [4,5,6]).toArray(function (arr) {
        test.same(arr, [[1,4],[2,5],[3,6]]);
    });
    h.zip([1,2], [4,5,6]).toArray(function (arr) {
        test.same(arr, [[1,4],[2,5],[h.Nil, 6]]);
    });
    // partial application
    h.zip([1,2])([4,5]).toArray(function (arr) {
        test.same(arr, [[1,4],[2,5]]);
    });
    var s1 = h.Stream(function (push, next) {
        push(1);
        push(2);
        push(3);
        next(h.Stream());
    });
    var s2 = h.Stream(function (push, next) {
        push(4);
        push(5);
        push(6);
        next(h.Stream());
    });
    h.zip(s1, s2).toArray(function (arr) {
        test.same(arr, [[1,4],[2,5],[3,6]]);
        test.done();
    });
};
