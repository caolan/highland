var h = require('../highland');


/***** Functions *****/

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
        return h.foldl(function (a, b) { return a + b; }, 0, args);
    };
    test.equal(h.ncurry(3,fn2)(1,2,3,4), h.ncurry(3,fn2,1,2,3,4));
    test.equal(h.ncurry(3,fn2)(1,2,3,4), h.ncurry(3,fn2,1,2)(3,4));
    test.done();
};

exports['compose'] = function (test) {
    var fn1 = h.concat('one:');
    var fn2 = h.concat('two:');
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
        return h.foldl1(h.add, args);
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
    var fn1 = h.concat('one:');
    var fn2 = h.concat('two:');
    var fn = h.seq(fn1, fn2);
    test.equal(fn('zero'), 'two:one:zero');
    // partial application
    test.equal(h.seq(fn1)(fn2)('zero'), 'two:one:zero');
    test.done();
};

exports['tailopt'] = function (test) {
    var sum = h.tailopt(function(x, y, recur) {
        return y > 0 ? recur(x + 1, y - 1) :
               y < 0 ? recur(x - 1, y + 1) :
               x;
    });
    test.equal(sum(20, 100000), 100020);
    var foo = h.tailopt(function (x, y, foo) {
        if (x === 0) {
            return foo(x + 1, y);
        }
        else if (x === 1) {
            bar(x, y); // check for side-effects
            return x + y;
        }
    });
    var bar = function (x, y) {
        // check public function is side-effect free when used
        // elsewhere during recursion
        return foo(x * 2, y * 2);
    };
    test.equal(foo(0, 1), 2);
    var foo2 = h.tailopt(function (x, y, foo2) {
        if (x === 0) {
            return foo(x + 1, y);
        }
        else if (x === 1) {
            bar2(x, y, foo2); // check for side-effects
            return x + y;
        }
    });
    var bar2 = function (x, y, foo2) {
        // check continuation function is side-effect free when used
        // elsewhere during recursion
        return foo2(x * 2, y * 2);
    };
    test.equal(foo(0, 1), 2);
    // make sure you can still make non-tail optimized calls
    var len = h.tailopt(function (arr, len) {
        if (arr.length === 0) {
            return 0;
        }
        return 1 + len(h.tail(arr));
    });
    test.equal(len([1,2,3]), 3);
    var strtest = h.tailopt(function (arr, len) {
        if (arr.length === 0) {
            return '0';
        }
        return '1' + len(h.tail(arr));
    });
    test.equal(strtest([1,2,3]), '1110');
    /*
    var strtest2 = h.tailopt(function (arr, len) {
        if (arr.length === 0) {
            return ['0'];
        }
        return h.cons('1', len(h.tail(arr)));
    });
    test.equal(strtest2([1,2,3]), ['1','1','1','0']);
    */
    test.done();
};


/***** Operators *****/

exports['eq'] = function (test) {
    function testTrue(args) {
        test.strictEqual(h.eq(args[0], args[1]), true);
    }
    function testFalse(args) {
        test.strictEqual(h.eq(args[0], args[1]), false);
    }
    var a = [1,2,3,4];
    var b = {foo: 'bar'};

    var passes = [
        [123,123], ['abc','abc'], [true,true], [false,false],
        [null,null], [undefined,undefined], [a,a], [b,b]
    ];
    passes.forEach(testTrue)

    var fails = [
        [123,321], ['abc','def'], [true,false], [null,false],
        [null,'asdf'], ['123',123], [undefined,null], ['','0'],
        [0,''], [0,'0'], [false,'false'], [false,'0'],
        [false,undefined], [false,null], [null,undefined],
        [' \t\r\n ',0], [a, [1,2,3,4]], [b, {foo: 'bar'}]
    ];
    fails.forEach(testFalse);

    // partial application
    test.equal(h.eq(123)(123), true);
    test.equal(h.eq(123)(321), false);

    test.done();
};

exports['ne'] = function (test) {
    function testTrue(args) {
        test.strictEqual(h.ne(args[0], args[1]), true);
    }
    function testFalse(args) {
        test.strictEqual(h.ne(args[0], args[1]), false);
    }
    var a = [1,2,3,4];
    var b = {foo: 'bar'};

    var fails = [
        [123,123], ['abc','abc'], [true,true], [false,false],
        [null,null], [undefined,undefined], [a,a], [b,b]
    ];
    fails.forEach(testFalse)

    var passes = [
        [123,321], ['abc','def'], [true,false], [null,false],
        [null,'asdf'], ['123',123], [undefined,null], ['','0'],
        [0,''], [0,'0'], [false,'false'], [false,'0'],
        [false,undefined], [false,null], [null,undefined],
        [' \t\r\n ',0], [a, [1,2,3,4]], [b, {foo: 'bar'}]
    ];
    passes.forEach(testTrue);

    // partial application
    test.equal(h.ne(123)(123), false);
    test.equal(h.ne(123)(321), true);

    test.done();
};

exports['not'] = function (test) {
    test.equal(!true, h.not(true));
    test.equal(!false, h.not(false));
    test.done();
};

exports['eqv'] = function (test) {
    function testTrue(args) {
        test.strictEqual(h.eqv(args[0], args[1]), true);
    }
    function testFalse(args) {
        test.strictEqual(h.eqv(args[0], args[1]), false);
    }

    var passes = [
        [{a: 1}, {a: 1}], [{a: 1, b: {c: 2}}, {a: 1, b: {c: 2}}],
        [[1,2,3],[1,2,3]], [[1,2,{a:'asdf'}],[1,2,{a:'asdf'}]],
        [new Date(2012,0,1), new Date(2012,0,1)],
        [{},{}], [[],[]]
    ];
    passes.forEach(testTrue);

    var fails = [
        [{a:1},{b:2}], [[1,2,{a:3}],[1,2,{a:'asdf'}]],
        [{a:1, b:{c:2}}, {a:1, b:{c:3}}]
    ];
    fails.forEach(testFalse);

    // partial application
    test.equal(h.eqv({a:1})({b:2}), false);
    test.equal(h.eqv({a:1})({a:1}), true);

    test.done();
};

exports['lt'] = function (test) {
    function testTrue(args) {
        test.strictEqual(h.lt(args[0], args[1]), true);
    }
    function testFalse(args) {
        test.strictEqual(h.lt(args[0], args[1]), false);
    }
    function testThrows(args) {
        test.throws(function () {
            h.lt(args[0], args[1]);
        });
    }
    var passes = [
        ['abc','def'], [123,456], [[1,2,3],[4,5,6]],
        [[1,2],[1,2,3]], [[1,1],[1,1,1]], [[1,2,3],[5]]
    ];
    passes.forEach(testTrue);

    var fails = [
        ['abc','abc'], [123,123], [[1,2],[1,2]],
        ['def','abc'], [456,123], [[4,5,6],[1,2,3]],
        [[1,2,3],[1,2]], [[1,1,1],[1,1]], [[5],[1,2,3]]
    ];
    fails.forEach(testFalse);

    var throwers = [
        [{a:1},{a:1}], [{a:1},[1,2,3]], ['asdf',123], [[1,2,3],123],
        [[1,2,3],'1,2,3'], [true,false], [null,123], [undefined,123],
        ['asdf',false], [123,false], [[1,2,3],false]
        [[1,2,{a:1}],[1,3,{a:1}]], [[null,null],[null,undefined]]
    ];
    throwers.forEach(testThrows);

    // partial application
    test.equal(h.lt('abc')('def'), true);
    test.equal(h.lt(456)(123), false);

    test.done();
};

exports['gt'] = function (test) {
    function testTrue(args) {
        test.strictEqual(h.gt(args[0], args[1]), true);
    }
    function testFalse(args) {
        test.strictEqual(h.gt(args[0], args[1]), false);
    }
    function testThrows(args) {
        test.throws(function () {
            h.gt(args[0], args[1]);
        });
    }
    var fails = [
        ['abc','abc'], [123,123], [[1,2],[1,2]],
        ['abc','def'], [123,456], [[1,2,3],[4,5,6]],
        [[1,2],[1,2,3]], [[1,1],[1,1,1]], [[1,2,3],[5]]
    ];
    fails.forEach(testFalse);

    var passes = [
        ['def','abc'], [456,123], [[4,5,6],[1,2,3]],
        [[1,2,3],[1,2]], [[1,1,1],[1,1]], [[5],[1,2,3]]
    ];
    passes.forEach(testTrue);

    var throwers = [
        [{a:1},{a:1}], [{a:1},[1,2,3]], ['asdf',123], [[1,2,3],123],
        [[1,2,3],'1,2,3'], [true,false], [null,123], [undefined,123],
        ['asdf',false], [123,false], [[1,2,3],false]
        [[1,2,{a:1}],[1,3,{a:1}]], [[null,null],[null,undefined]]
    ];
    throwers.forEach(testThrows);

    // partial application
    test.equal(h.gt('abc')('def'), false);
    test.equal(h.gt(456)(123), true);

    test.done();
};

exports['le'] = function (test) {
    function testTrue(args) {
        test.strictEqual(h.le(args[0], args[1]), true);
    }
    function testFalse(args) {
        test.strictEqual(h.le(args[0], args[1]), false);
    }
    function testThrows(args) {
        test.throws(function () {
            h.le(args[0], args[1]);
        });
    }
    var passes = [
        ['abc','abc'], [123,123], [[1,2],[1,2]],
        ['abc','def'], [123,456], [[1,2,3],[4,5,6]],
        [[1,2],[1,2,3]], [[1,1],[1,1,1]], [[1,2,3],[5]]
    ];
    passes.forEach(testTrue);

    var fails = [
        ['def','abc'], [456,123], [[4,5,6],[1,2,3]],
        [[1,2,3],[1,2]], [[1,1,1],[1,1]], [[5],[1,2,3]]
    ];
    fails.forEach(testFalse);

    var throwers = [
        [{a:1},{a:1}], [{a:1},[1,2,3]], ['asdf',123], [[1,2,3],123],
        [[1,2,3],'1,2,3'], [true,false], [null,123], [undefined,123],
        ['asdf',false], [123,false], [[1,2,3],false]
        [[1,2,{a:1}],[1,3,{a:1}]], [[null,null],[null,undefined]]
    ];
    throwers.forEach(testThrows);

    // partial application
    test.equal(h.le('abc')('def'), true);
    test.equal(h.le(456)(123), false);
    test.equal(h.le(123)(123), true);

    test.done();
};

exports['ge'] = function (test) {
    function testTrue(args) {
        test.strictEqual(h.ge(args[0], args[1]), true);
    }
    function testFalse(args) {
        test.strictEqual(h.ge(args[0], args[1]), false);
    }
    function testThrows(args) {
        test.throws(function () {
            h.ge(args[0], args[1]);
        });
    }
    var fails = [
        ['abc','def'], [123,456], [[1,2,3],[4,5,6]],
        [[1,2],[1,2,3]], [[1,1],[1,1,1]], [[1,2,3],[5]]
    ];
    fails.forEach(testFalse);

    var passes = [
        ['abc','abc'], [123,123], [[1,2],[1,2]],
        ['def','abc'], [456,123], [[4,5,6],[1,2,3]],
        [[1,2,3],[1,2]], [[1,1,1],[1,1]], [[5],[1,2,3]]
    ];
    passes.forEach(testTrue);

    var throwers = [
        [{a:1},{a:1}], [{a:1},[1,2,3]], ['asdf',123], [[1,2,3],123],
        [[1,2,3],'1,2,3'], [true,false], [null,123], [undefined,123],
        ['asdf',false], [123,false], [[1,2,3],false]
        [[1,2,{a:1}],[1,3,{a:1}]], [[null,null],[null,undefined]]
    ];
    throwers.forEach(testThrows);

    // partial application
    test.equal(h.ge('abc')('def'), false);
    test.equal(h.ge(456)(123), true);
    test.equal(h.ge(123)(123), true);

    test.done();
};

exports['and'] = function (test) {
    test.strictEqual(h.and(true, true), true);
    test.strictEqual(h.and(false, true), false);
    test.strictEqual(h.and(true, false), false);
    test.strictEqual(h.and(false, false), false);
    // partial application
    test.equal(true && true, h.and(true)(true));
    test.equal(true && false, h.and(true)(false));
    test.equal(false && true, h.and(false)(true));
    test.equal(false && false, h.and(false)(false));
    test.done();
};

exports['or'] = function (test) {
    test.strictEqual(h.or(true, true), true);
    test.strictEqual(h.or(false, true), true);
    test.strictEqual(h.or(true, false), true);
    test.strictEqual(h.or(false, false), false);
    // partial application
    test.equal(true || true, h.or(true)(true));
    test.equal(true || false, h.or(true)(false));
    test.equal(false || true, h.or(false)(true));
    test.equal(false || false, h.or(false)(false));
    test.done();
};

exports['add'] = function (test) {
    test.strictEqual(h.add(1,2), 3);
    test.strictEqual(h.add(2,2), 4);
    test.strictEqual(h.add(2.3,2.12), 4.42);
    test.throws(function () { h.add('123', true); });
    test.throws(function () { h.add('123', 123); });
    test.throws(function () { h.add(123, {}); });
    test.throws(function () { h.add([], undefined); });
    test.throws(function () { h.add(undefined, null); });
    // partial application
    test.equal(h.add(1)(1), h.add(1,1));
    test.equal(h.add(2)(5), h.add(2,5));
    test.done();
};

exports['sub'] = function (test) {
    test.strictEqual(h.sub(2,1), 1);
    test.strictEqual(h.sub(2,2), 0);
    test.strictEqual(h.sub(2,5), -3);
    test.throws(function () { h.sub('123', true); });
    test.throws(function () { h.sub('123', 123); });
    test.throws(function () { h.sub(123, {}); });
    test.throws(function () { h.sub([], undefined); });
    test.throws(function () { h.sub(undefined, null); });
    // partial application
    test.equal(h.sub(1)(1), h.sub(1,1));
    test.equal(h.sub(5)(2), h.sub(5,2));
    test.done();
};

exports['mul'] = function (test) {
    test.strictEqual(h.mul(2,1), 2);
    test.strictEqual(h.mul(2,2), 4);
    test.strictEqual(h.mul(2,5), 10);
    test.throws(function () { h.mul('123', true); });
    test.throws(function () { h.mul('123', 123); });
    test.throws(function () { h.mul(123, {}); });
    test.throws(function () { h.mul([], undefined); });
    test.throws(function () { h.mul(undefined, null); });
    // partial application
    test.equal(h.mul(1)(1), h.mul(1,1));
    test.equal(h.mul(5)(2), h.mul(5,2));
    test.done();
};

exports['div'] = function (test) {
    test.strictEqual(h.div(2,1), 2);
    test.strictEqual(h.div(2,2), 1);
    test.strictEqual(h.div(10,2), 5);
    test.throws(function () { h.div('123', true); });
    test.throws(function () { h.div('123', 123); });
    test.throws(function () { h.div(123, {}); });
    test.throws(function () { h.div([], undefined); });
    test.throws(function () { h.div(undefined, null); });
    // partial application
    test.equal(h.div(1)(1), h.div(1,1));
    test.equal(h.div(5)(2), h.div(5,2));
    test.done();
};

exports['rem'] = function (test) {
    test.strictEqual(h.rem(1,2), 1);
    test.strictEqual(h.rem(2,2), 0);
    test.strictEqual(h.rem(-1,5), -1);
    test.throws(function () { h.rem('123', true); });
    test.throws(function () { h.rem('123', 123); });
    test.throws(function () { h.rem(123, {}); });
    test.throws(function () { h.rem([], undefined); });
    test.throws(function () { h.rem(undefined, null); });
    // partial application
    test.equal(h.rem(1)(1), h.rem(1,1));
    test.equal(h.rem(5)(2), h.rem(5,2));
    test.done();
};

exports['mod'] = function (test) {
    test.strictEqual(h.mod(1,2), 1);
    test.strictEqual(h.mod(2,2), 0);
    test.strictEqual(h.mod(-1,5), 4);
    test.throws(function () { h.mod('123', true); });
    test.throws(function () { h.mod('123', 123); });
    test.throws(function () { h.mod(123, {}); });
    test.throws(function () { h.mod([], undefined); });
    test.throws(function () { h.mod(undefined, null); });
    // partial application
    test.equal(h.mod(1)(1), h.mod(1,1));
    test.equal(h.mod(5)(2), h.mod(5,2));
    test.done();
};


/***** Types *****/

exports['isArray'] = function (test) {
    function testTrue(x) {
        test.strictEqual(h.isArray(x), true);
    }
    function testFalse(x) {
        test.strictEqual(h.isArray(x), false);
    }

    var fails = [
        null,
        undefined,
        'asdf',
        new String('asdf'),
        123,
        {},
        new Date(),
        new RegExp('asdf'),
        true,
        function () {},
        arguments,
        NaN,
        Infinity
    ];
    fails.forEach(testFalse);

    var passes = [
        []
    ];
    passes.forEach(testTrue);

    test.done();
};

exports['isObject'] = function (test) {
    function testTrue(x) {
        test.strictEqual(h.isObject(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(h.isObject(x), false, x);
    }

    var fails = [
        null,
        undefined,
        'asdf',
        new String('asdf'),
        123,
        [],
        true,
        function () {},
        NaN,
        Infinity
    ];
    fails.forEach(testFalse);

    var passes = [
        {},
        new Date(),
        new RegExp('asdf'),
        arguments
    ];
    passes.forEach(testTrue);

    test.done();
};

exports['isFunction'] = function (test) {
    function testTrue(x) {
        test.strictEqual(h.isFunction(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(h.isFunction(x), false, x);
    }

    var fails = [
        null,
        undefined,
        'asdf',
        new String('asdf'),
        123,
        {},
        [],
        true,
        NaN,
        Infinity,
        new Date(),
        new RegExp('asdf'),
        arguments
    ];
    fails.forEach(testFalse);

    var passes = [
        function () {}
    ];
    passes.forEach(testTrue);

    test.done();
};

exports['isString'] = function (test) {
    function testTrue(x) {
        test.strictEqual(h.isString(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(h.isString(x), false, x);
    }

    var fails = [
        null,
        undefined,
        123,
        {},
        [],
        true,
        NaN,
        Infinity,
        new Date(),
        new RegExp('asdf'),
        arguments,
        function () {}
    ];
    fails.forEach(testFalse);

    var passes = [
        'asdf',
        new String('asdf')
    ];
    passes.forEach(testTrue);

    test.done();
};

exports['isNumber'] = function (test) {
    function testTrue(x) {
        test.strictEqual(h.isNumber(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(h.isNumber(x), false, x);
    }

    var fails = [
        null,
        undefined,
        {},
        [],
        true,
        new Date(),
        new RegExp('asdf'),
        arguments,
        function () {},
        'asdf',
        new String('asdf')
    ];
    fails.forEach(testFalse);

    var passes = [
        123,
        Infinity,
        NaN // yes, really. it's part of the IEEE standard
    ];
    passes.forEach(testTrue);

    test.done();
};

exports['isBoolean'] = function (test) {
    function testTrue(x) {
        test.strictEqual(h.isBoolean(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(h.isBoolean(x), false, x);
    }

    var fails = [
        null,
        undefined,
        {},
        [],
        new Date(),
        new RegExp('asdf'),
        arguments,
        function () {},
        'asdf',
        new String('asdf'),
        123,
        Infinity,
        NaN
    ];
    fails.forEach(testFalse);

    var passes = [
        true,
        false
    ];
    passes.forEach(testTrue);

    test.done();
};

exports['isNull'] = function (test) {
    function testTrue(x) {
        test.strictEqual(h.isNull(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(h.isNull(x), false, x);
    }

    var fails = [
        undefined,
        {},
        [],
        new Date(),
        new RegExp('asdf'),
        arguments,
        function () {},
        'asdf',
        new String('asdf'),
        123,
        Infinity,
        NaN,
        true
    ];
    fails.forEach(testFalse);

    var passes = [
        null
    ];
    passes.forEach(testTrue);

    test.done();
};

exports['isUndefined'] = function (test) {
    function testTrue(x) {
        test.strictEqual(h.isUndefined(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(h.isUndefined(x), false, x);
    }

    var fails = [
        {},
        [],
        new Date(),
        new RegExp('asdf'),
        arguments,
        function () {},
        'asdf',
        new String('asdf'),
        123,
        Infinity,
        NaN,
        true,
        null
    ];
    fails.forEach(testFalse);

    var passes = [
        undefined
    ];
    passes.forEach(testTrue);

    test.done();
};

exports['isNaN'] = function (test) {
    function testTrue(x) {
        test.strictEqual(h.isNaN(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(h.isNaN(x), false, x);
    }

    var fails = [
        {},
        [],
        new Date(),
        new RegExp('asdf'),
        arguments,
        function () {},
        'asdf',
        new String('asdf'),
        123,
        Infinity,
        true,
        null,
        undefined
    ];
    fails.forEach(testFalse);

    var passes = [
        NaN
    ];
    passes.forEach(testTrue);

    test.done();
};

exports['isDateObject'] = function (test) {
    function testTrue(x) {
        test.strictEqual(h.isDateObject(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(h.isDateObject(x), false, x);
    }

    var fails = [
        {},
        [],
        new RegExp('asdf'),
        arguments,
        function () {},
        'asdf',
        new String('asdf'),
        123,
        Infinity,
        true,
        null,
        undefined,
        NaN
    ];
    fails.forEach(testFalse);

    var passes = [
        new Date()
    ];
    passes.forEach(testTrue);

    test.done();
};

exports['isRegExpObject'] = function (test) {
    function testTrue(x) {
        test.strictEqual(h.isRegExpObject(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(h.isRegExpObject(x), false, x);
    }

    var fails = [
        {},
        [],
        arguments,
        function () {},
        'asdf',
        new String('asdf'),
        123,
        Infinity,
        true,
        null,
        undefined,
        NaN,
        new Date()
    ];
    fails.forEach(testFalse);

    var passes = [
        new RegExp('asdf'),
        /foo/
    ];
    passes.forEach(testTrue);

    test.done();
};

exports['isArgumentsObject'] = function (test) {
    function testTrue(x) {
        test.strictEqual(h.isArgumentsObject(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(h.isArgumentsObject(x), false, x);
    }

    var fails = [
        {},
        [],
        function () {},
        'asdf',
        new String('asdf'),
        123,
        Infinity,
        true,
        null,
        undefined,
        NaN,
        new Date(),
        new RegExp('asdf')
    ];
    fails.forEach(testFalse);

    var passes = [
        arguments
    ];
    passes.forEach(testTrue);

    test.done();
};

exports['type'] = function (test) {
    test.equal(h.type({}), 'object');
    test.equal(h.type([]), 'array');
    test.equal(h.type(function () {}), 'function');
    test.equal(h.type('asdf'), 'string');
    test.equal(h.type(new String('asdf')), 'string');
    test.equal(h.type(123), 'number');
    test.equal(h.type(Infinity), 'number');
    test.equal(h.type(true), 'boolean');
    test.equal(h.type(null), 'null');
    test.equal(h.type(undefined), 'undefined');
    test.equal(h.type(NaN), 'number'); // yes, really
    test.equal(h.type(new Date()), 'object');
    test.equal(h.type(new RegExp('asdf')), 'object');
    test.equal(h.type(arguments), 'object');
    test.done();
};


/***** Numbers *****/

exports['max'] = function (test) {
    test.equal(h.max(1,2), 2);
    test.equal(h.max(2,2), 2);
    test.equal(h.max(2,1), 2);
    test.equal(h.max('abc','def'), 'def');
    test.same(h.max([1,2],[3,4]), [3,4]);
    test.throws(function () { h.max(1, {}); });
    test.throws(function () { h.max('asdf', 1); });
    test.throws(function () { h.max([], 1); });
    test.throws(function () { h.max(true, 1); });
    test.throws(function () { h.max(null, 1); });
    test.throws(function () { h.max(undefined, 1); });
    // partial application
    test.equal(h.max(1)(2), 2);
    test.equal(h.max(2)(2), 2);
    test.equal(h.max(2)(1), 2);
    test.done();
};

exports['min'] = function (test) {
    test.equal(h.min(1,2), 1);
    test.equal(h.min(2,2), 2);
    test.equal(h.min(2,1), 1);
    test.equal(h.min('abc','def'), 'abc');
    test.same(h.min([1,2],[3,4]), [1,2]);
    test.throws(function () { h.min(1, {}); });
    test.throws(function () { h.min('asdf', 1); });
    test.throws(function () { h.min([], 1); });
    test.throws(function () { h.min(true, 1); });
    test.throws(function () { h.min(null, 1); });
    test.throws(function () { h.min(undefined, 1); });
    // partial application
    test.equal(h.min(1)(2), 1);
    test.equal(h.min(2)(2), 2);
    test.equal(h.min(2)(1), 1);
    test.done();
};

exports['compare'] = function (test) {
    test.equal(h.compare(1,2), -1);
    test.equal(h.compare(2,2), 0);
    test.equal(h.compare(2,1), 1);
    test.equal(h.compare('abc','def'), -1);
    test.same(h.compare([1,2],[3,4]), -1);
    test.throws(function () { h.compare(1, {}); });
    test.throws(function () { h.compare('asdf', 1); });
    test.throws(function () { h.compare([], 1); });
    test.throws(function () { h.compare(true, 1); });
    test.throws(function () { h.compare(null, 1); });
    test.throws(function () { h.compare(undefined, 1); });
    // partial application
    test.equal(h.compare(1)(2), -1);
    test.equal(h.compare(2)(2), 0);
    test.equal(h.compare(2)(1), 1);
    test.done();
};


/***** Lists *****/

exports['cons'] = function (test) {
    test.same(h.cons(1, [2,3,4]), [1,2,3,4]);
    test.same(h.cons(1, []), [1]);
    // partial application
    test.same(h.cons(1)([2,3,4]), [1,2,3,4]);
    test.same(h.cons(1)([]), [1]);
    test.done();
};

exports['append'] = function (test) {
    test.same(h.append(4, [1,2,3]), [1,2,3,4]);
    test.done();
};

exports['head'] = function (test) {
    var a = [1,2,3,4];
    test.equal(h.head(a), 1);
    test.same(a, [1,2,3,4]);
    var b = [4,3,2,1];
    test.equal(h.head(b), 4);
    test.same(b, [4,3,2,1]);
    // head of an empty list should result in an error
    test.throws(function () {
        h.head([]);
    });
    try {
        h.head([]);
    }
    catch (e) {
        test.equal(e.message, 'head of empty array');
    }
    test.done();
};

exports['last'] = function (test) {
    var a = [1,2,3,4];
    test.equal(h.last(a), 4);
    test.same(a, [1,2,3,4]);
    var b = [4,3,2,1];
    test.equal(h.last(b), 1);
    test.same(b, [4,3,2,1]);
    // last of an empty list should result in an error
    test.throws(function () {
        h.last([]);
    });
    test.done();
};

exports['tail'] = function (test) {
    var a = [1,2,3,4];
    test.same(h.tail(a), [2,3,4]);
    test.same(a, [1,2,3,4]);
    var b = [4,3,2,1];
    test.same(h.tail(b), [3,2,1]);
    test.same(b, [4,3,2,1]);
    // tail of an empty list should result in an error
    test.throws(function () {
        h.tail([]);
    });
    test.done();
};

exports['init'] = function (test) {
    var a = [1,2,3,4];
    test.same(h.init(a), [1,2,3]);
    test.same(a, [1,2,3,4]);
    var b = [4,3,2,1];
    test.same(h.init(b), [4,3,2]);
    test.same(b, [4,3,2,1]);
    // init of an empty list should result in an error
    test.throws(function () {
        h.init([]);
    });
    test.done();
};

exports['empty'] = function (test) {
    test.equal(h.empty([1,2,3]), false);
    test.equal(h.empty([]), true);
    test.equal(h.empty(''), true);
    test.equal(h.empty('abc'), false);
    test.done();
};

exports['length'] = function (test) {
    test.equal(h.length([1,2,3,4]), 4);
    test.equal(h.length([1,2,3]), 3);
    test.equal(h.length('abc'), 3);
    test.done();
};

exports['concat'] = function (test) {
    var a = [1];
    var b = [2,3];
    test.same(h.concat(a, b), [1,2,3]);
    // test original arrays are unchanged
    test.same(a, [1]);
    test.same(b, [2,3]);
    test.same(h.concat([1,2,3], []), [1,2,3]);
    // partial application
    var fn = h.concat([1,2]);
    test.same(fn([3,4]), [1,2,3,4]);
    test.same(fn([3,4,5]), [1,2,3,4,5]);
    test.equal(h.concat('abc', 'def'), 'abcdef');
    test.throws(function () { h.concat('abc', [1,2]); });
    test.throws(function () { h.concat([1,2], 'abc'); });
    test.throws(function () { h.concat(1, [2,3]); });
    test.throws(function () { h.concat([2,3], null); });
    test.throws(function () { h.concat(undefined, [2,3]); });
    test.throws(function () { h.concat([2,3], {}); });
    test.done();
};

exports['foldl'] = function (test) {
    test.equal(h.foldl(h.concat, '', ['1','2','3','4']), '1234');
    var fn = function (x, y) {
        return x + y;
    };
    test.equal(h.foldl(fn, 0, [1,2,3,4]), 10);
    // partial application
    test.equal(h.foldl(fn, 0)([1,2,3,4]), 10);
    test.equal(h.foldl(fn)(0, [1,2,3,4]), 10);
    test.equal(h.foldl(fn)(0)([1,2,3,4]), 10);
    var minus = function (a, b) {
        return a - b;
    };
    test.equal(h.foldl(minus, 1, [1,2,3]), -5);
    var concatUpper = function (a, b) {
        return (a + b).toUpperCase();
    };
    test.equal(h.foldl(concatUpper, 'a', 'bcd'), 'ABCD');
    test.equal(h.foldl(h.div, 4, [4, 2]), 0.5);
    test.done();
};

exports['foldl1'] = function (test) {
    var fn = function (x, y) {
        return x + y;
    };
    test.equal(h.foldl1(fn, [1,2,3,4]), 10);
    // partial application
    test.equal(h.foldl1(fn)([1,2,3,4]), 10);
    var minus = function (a, b) {
        return a - b;
    };
    test.equal(h.foldl1(minus, [1,2,3]), -4);
    var concatUpper = function (a, b) {
        return (a + b).toUpperCase();
    };
    test.equal(h.foldl1(concatUpper, 'abcd'), 'ABCD');
    test.done();
};

exports['foldr'] = function (test) {
    var minus = function (a, b) {
        return a - b;
    };
    test.equal(h.foldr(minus, 1, [1,2,3]), 1);
    var concatUpper = function (a, b) {
        return (a + b).toUpperCase();
    };
    test.equal(h.foldr(concatUpper, 'd', 'abc'), 'ABCD');
    test.equal(h.foldr(h.div, 4, [4, 2]), 8);
    // partial application
    test.equal(h.foldr(minus, 1)([1,2,3]), 1);
    test.equal(h.foldr(minus)(1)([1,2,3]), 1);
    test.done();
};

exports['foldr1'] = function (test) {
    var minus = function (a, b) {
        return a - b;
    };
    test.equal(h.foldr1(minus, [1,2,3]), 2);
    var concatUpper = function (a, b) {
        return (a + b).toUpperCase();
    };
    test.equal(h.foldr1(concatUpper, 'abcd'), 'ABCD');
    // partial application
    test.equal(h.foldr1(minus)([1,2,3]), 2);
    test.done();
};

exports['each'] = function (test) {
    var calls = [];
    var val = h.each(function (x) {
        calls.push(x);
    }, [1,2,3,4]);
    test.same(calls, [1,2,3,4]);
    test.strictEqual(val, undefined);
    test.done();
};

// TODO: map to a value eg, stream.map(1) => Stream: 1, 1, 1, 1
exports['map'] = function (test) {
    var dbl = function (x) {
        test.equal(arguments.length, 1);
        return x * 2;
    };
    var a = [1,2,3,4];
    test.same(h.map(dbl, a), [2,4,6,8]);
    // test original array is unchanged
    test.same(a, [1,2,3,4]);
    // partial application
    test.same(h.map(dbl)(a), [2,4,6,8]);
    test.done();
};

exports['reverse'] = function (test) {
    test.same(h.reverse([1,2,3,4]), [4,3,2,1]);
    test.same(h.reverse([4,3,2,1]), [1,2,3,4]);
    test.same(h.reverse([1]), [1]);
    test.same(h.reverse([]), []);
    // make sure original array is unchanged
    var a = [1,2];
    test.same(h.reverse(a), [2,1]);
    test.same(a, [1,2]);
    test.done();
};

exports['concatMap'] = function (test) {
    var fn = function (c) {
        return c.toUpperCase();
    };
    test.equal(h.concatMap(fn, ['a','b','c']), 'ABC');
    test.done();
};

exports['all'] = function (test) {
    test.equal(h.all(h.not, [false, false, false]), true);
    test.equal(h.all(h.not, [true, false, false]), false);
    // partial applicatoin
    test.equal(h.all(h.not)([false, false, false]), true);
    test.equal(h.all(h.not)([true, false, false]), false);
    test.done();
};

exports['any'] = function (test) {
    test.equal(h.any(h.not, [false, false, false]), true);
    test.equal(h.any(h.not, [true, false, false]), true);
    test.equal(h.any(h.not, [true, true, true]), false);
    // partial applicatoin
    test.equal(h.any(h.not)([false, false, false]), true);
    test.equal(h.any(h.not)([true, false, false]), true);
    test.equal(h.any(h.not)([true, true, true]), false);
    test.done();
};

exports['maximum'] = function (test) {
    test.equal(h.maximum([1,2,3,4]), 4);
    test.equal(h.maximum([1,4,2,3]), 4);
    test.done();
};

exports['minimum'] = function (test) {
    test.equal(h.minimum([1,2,3,4]), 1);
    test.equal(h.minimum([3,2,4,1]), 1);
    test.done();
};

exports['replicate'] = function (test) {
    test.same(h.replicate(3, "ho"), ["ho","ho","ho"]);
    test.same(h.replicate(5, 1), [1,1,1,1,1]);
    test.same(h.replicate(1, 2), [2]);
    test.same(h.replicate(0, 2), []);
    // partial application
    test.same(h.replicate(3)("ho"), ["ho","ho","ho"]);
    test.same(h.replicate(5)(1), [1,1,1,1,1]);
    test.same(h.replicate(1)(2), [2]);
    test.same(h.replicate(0)(2), []);
    test.done();
};

exports['range'] = function (test) {
    test.same(h.range(1, 10), [1,2,3,4,5,6,7,8,9,10]);
    test.done();
};

exports['take'] = function (test) {
    var a = [1,2,3,4];
    test.same(h.take(1, a), [1]);
    test.same(a, [1,2,3,4]);
    test.same(h.take(2, a), [1,2]);
    test.same(a, [1,2,3,4]);
    test.same(h.take(3, a), [1,2,3]);
    test.same(a, [1,2,3,4]);
    test.same(h.take(4, a), [1,2,3,4]);
    test.same(a, [1,2,3,4]);
    test.same(h.take(5, a), [1,2,3,4]);
    test.same(a, [1,2,3,4]);
    // partial application
    test.same(h.take(1)(a), [1]);
    test.same(a, [1,2,3,4]);
    test.same(h.take(2)(a), [1,2]);
    test.same(a, [1,2,3,4]);
    test.done();
};

exports['drop'] = function (test) {
    var a = [1,2,3,4];
    test.same(h.drop(1, a), [2,3,4]);
    test.same(a, [1,2,3,4]);
    test.same(h.drop(2, a), [3,4]);
    test.same(a, [1,2,3,4]);
    test.same(h.drop(3, a), [4]);
    test.same(a, [1,2,3,4]);
    test.same(h.drop(4, a), []);
    test.same(a, [1,2,3,4]);
    test.same(h.drop(5, a), []);
    test.same(a, [1,2,3,4]);
    // partial application
    test.same(h.drop(1)(a), [2,3,4]);
    test.same(a, [1,2,3,4]);
    test.same(h.drop(2)(a), [3,4]);
    test.same(a, [1,2,3,4]);
    test.done();
};

exports['splitAt'] = function (test) {
    test.same(h.splitAt(3, [1,2,3,4,5]), [[1,2,3], [4,5]]);
    // partial application
    test.same(h.splitAt(3)([1,2,3,4,5]), [[1,2,3], [4,5]]);
    test.done();
};

exports['takeWhile'] = function (test) {
    var lt3 = function (x) {
        return x < 3;
    };
    test.same(h.takeWhile(lt3, [1,2,3,4]), [1,2]);
    test.same(h.takeWhile(lt3, [1,2,1,2]), [1,2,1,2]);
    test.same(h.takeWhile(lt3, [3,3,3,3]), []);
    // partial application
    test.same(h.takeWhile(lt3)([1,2,3,4]), [1,2]);
    test.same(h.takeWhile(lt3)([1,2,1,2]), [1,2,1,2]);
    test.same(h.takeWhile(lt3)([3,3,3,3]), []);
    test.done();
};

exports['dropWhile'] = function (test) {
    var lt3 = function (x) {
        return x < 3;
    };
    test.same(h.dropWhile(lt3, [1,2,3,4]), [3,4]);
    test.same(h.dropWhile(lt3, [1,2,1,2]), []);
    test.same(h.dropWhile(lt3, [3,3,3,3]), [3,3,3,3]);
    // partial application
    test.same(h.dropWhile(lt3)([1,2,3,4]), [3,4]);
    test.same(h.dropWhile(lt3)([1,2,1,2]), []);
    test.same(h.dropWhile(lt3)([3,3,3,3]), [3,3,3,3]);
    test.done();
};

exports['span'] = function (test) {
    var lt3 = function (x) {
        return x < 3;
    };
    test.same(h.span(lt3, [1,2,3,4]), [[1,2], [3,4]]);
    test.same(h.span(lt3, [1,2]), [[1,2], []]);
    test.same(h.span(lt3, [3,4]), [[], [3,4]]);
    test.same(h.span(lt3, []), [[], []]);
    // partial application
    test.same(h.span(lt3)([1,2,3,4]), [[1,2], [3,4]]);
    test.same(h.span(lt3)([1,2]), [[1,2], []]);
    test.same(h.span(lt3)([3,4]), [[], [3,4]]);
    test.same(h.span(lt3)([]), [[], []]);
    test.done();
};

exports['elem'] = function (test) {
    test.equal(h.elem(3, [1,2,3,4]), true);
    test.equal(h.elem(6, [1,2,3,4]), false);
    test.equal(h.elem(6, []), false);
    // partial application
    test.equal(h.elem(3)([1,2,3,4]), true);
    test.equal(h.elem(6)([1,2,3,4]), false);
    test.equal(h.elem(6)([]), false);
    test.done();
};

exports['notElem'] = function (test) {
    test.equal(h.notElem(3, [1,2,3,4]), false);
    test.equal(h.notElem(6, [1,2,3,4]), true);
    test.equal(h.notElem(6, []), true);
    // partial application
    test.equal(h.notElem(3)([1,2,3,4]), false);
    test.equal(h.notElem(6)([1,2,3,4]), true);
    test.equal(h.notElem(6)([]), true);
    test.done();
};

exports['find'] = function (test) {
    test.strictEqual(h.find(h.eq(2), [1,2,3,4]), 2);
    test.strictEqual(h.find(h.eq(10), [1,2,3,4]), undefined);
    test.done();
};

exports['filter'] = function (test) {
    var odd = function (x) {
        return x % 2;
    };
    var a = [1,2,3,4];
    test.same(h.filter(odd, a), [1,3]);
    // test original array is unchanged
    test.same(a, [1,2,3,4]);
    // partial application
    test.same(h.filter(odd)(a), [1,3]);
    test.done();
};

exports['reject'] = function (test) {
    var odd = function (x) {
        return x % 2;
    };
    var a = [1,2,3,4];
    test.same(h.reject(odd, a), [2,4]);
    // test original array is unchanged
    test.same(a, [1,2,3,4]);
    // partial application
    test.same(h.reject(odd)(a), [2,4]);
    test.done();
};

exports['partition'] = function (test) {
    var odd = function (x) {
        return x % 2;
    };
    var a = [1,2,3,4];
    test.same(h.partition(odd, a), [[1,3],[2,4]]);
    // test original array is unchanged
    test.same(a, [1,2,3,4]);
    // partial application
    test.same(h.partition(odd)(a), [[1,3],[2,4]]);
    test.done();
};

exports['zip'] = function (test) {
    test.same(h.zip([1,2,3], [4,5,6]), [[1,4],[2,5],[3,6]]);
    test.same(h.zip([1,2], [4,5,6]), [[1,4],[2,5]]);
    // partial application
    test.same(h.zip([1,2])([4,5]), [[1,4],[2,5]]);
    test.done();
};

exports['zipWith'] = function (test) {
    var add = function (a, b) {
        return a + b;
    };
    test.same(h.zipWith(add, [1,2,3,4,5], [6,7,8,9,10]), [7,9,11,13,15]);
    test.same(h.zipWith(add, [1,2,3], [6,7,8,9,10]), [7,9,11]);
    // partial application
    test.same(h.zipWith(add, [1,2,3])([6,7,8]), [7,9,11]);
    test.same(h.zipWith(add)([1,2,3], [6,7,8]), [7,9,11]);
    test.same(h.zipWith(add)([1,2,3])([6,7,8]), [7,9,11]);
    test.done();
};

exports['nub'] = function (test) {
    test.same(h.nub([1,2,1,1,2,3,3,4]), [1,2,3,4]);
    test.same(h.nub([1,2,3,4]), [1,2,3,4]);
    test.same(h.nub(['a','c','b','b']), ['a','c','b']);
    test.done();
};

exports['sort'] = function (test) {
    var a = [2,4,3,1];
    test.same(h.sort(a), [1,2,3,4]);
    test.same(a, [2,4,3,1]);
    var b = [1,2,3,4];
    test.same(h.sort([1,2,3,4]), [1,2,3,4]);
    test.same(b, [1,2,3,4]);
    test.same(h.sort([1,2,14,21,3]), [1,2,3,14,21]);
    test.same(h.sort(['a','c','b']), ['a','b','c']);
    test.done();
};







exports['set'] = function (test) {
    /** Objects **/

    var a = {
      one: 1,
      two: 2,
      three: {
        four: 4,
        five: {
          six: 6
        }
      },
      seven: {
        eight: 8
      }
    };
    var orig_a = JSON.stringify(a);

    var b = h.set(['three', 'four'], 40, a);

    // existing values and references are the same
    test.strictEqual(a.one, b.one);
    test.strictEqual(a.two, b.two);
    test.strictEqual(a.three.five, b.three.five);
    test.strictEqual(a.seven, b.seven);

    // the new property is different in each object
    test.strictEqual(a.three.four, 4);
    test.strictEqual(b.three.four, 40);

    test.equal(JSON.stringify(a), orig_a);

    /** Arrays **/

    var c = [{one: 1}, {two: 2}, {three: 3}];
    var orig_c = JSON.stringify(c);

    var d = h.set(1, {four: 4}, c);

    // existing values and references are the same
    test.strictEqual(c[0], d[0]);
    test.strictEqual(c[2], d[2]);

    // the new property is different in each object
    test.same(c[1], {two: 2});
    test.same(d[1], {four: 4});

    test.equal(JSON.stringify(c), orig_c);

    test.done();
};

exports['get'] = function (test) {
    var a = {
        one: { two: { three: 3 } },
        four: { five: 5 },
        six: 6
    };
    test.equal(h.get(['one', 'two', 'three'], a), 3);
    test.equal(h.get(['one', 'two'], a), a.one.two);
    test.equal(h.get(['four', 'five', 'six'], a), undefined);
    test.equal(h.get(['four', 'five', 'six', 'seven'], a), undefined);
    /*
    test.throws(function () {
        h.get(a, ['four', 'five', 'six', 'seven'], true);
    });
    */
    test.equal(h.get('six', a), 6);

    test.equal(h.get(1, [1,2,3,4]), 2);
    test.equal(h.get(2, [1,2,3,4]), 3);
    test.equal(h.get(5, [1,2,3,4]), undefined);

    test.done();
};

exports['trans'] = function (test) {
    var a = {b: 2};
    test.same(h.trans('b', h.add(3), a), {b: 5});
    // partial application
    test.same(h.trans('b', h.add(3))(a), {b: 5});
    test.same(h.trans('b')(h.add(3), a), {b: 5});
    test.same(h.trans('b')(h.add(3))(a), {b: 5});
    test.done();
};

exports['transWhere'] = function (test) {
    var a = [{b: 2}, {b: 4}];
    var bAbove2 = function (obj) { return obj.b > 2; };
    test.same(
        h.transWhere(bAbove2, 'b', h.mul(2), a),
        [{b: 2}, {b: 8}]
    );
    test.done();
};

exports['extend'] = function (test) {
    var a = {a: 1, b: 2};
    var b = {a: 0, c: 3};
    var c = h.extend(a, b);
    test.same(c, {a: 0, b: 2, c: 3});
    test.same(a, {a: 1, b: 2});
    test.same(b, {a: 0, c: 3});
    // partial application
    test.same(h.extend(a)(b), c);
    test.done();
};







exports['install'] = function (test) {
    test.expect(4);
    h.install();
    test.strictEqual(init, h.init);
    test.strictEqual(tail, h.tail);
    test.strictEqual(head, h.head);
    test.strictEqual(last, h.last);
    test.done();
};


exports['shallowClone'] = function (test) {
    var a = {x: 1, y: {z: 'foo'}};
    var b = h.shallowClone(a);
    b.x = 2;
    test.same(a, {x: 1, y: {z: 'foo'}});
    test.same(b, {x: 2, y: {z: 'foo'}});
    b.y.z = 'bar';
    test.same(a, {x: 1, y: {z: 'bar'}});
    test.same(b, {x: 2, y: {z: 'bar'}});
    test.done();
};

exports['deepClone'] = function (test) {
    var a = {x: 1, y: {z: 'foo'}};
    var b = h.deepClone(a);
    b.x = 2;
    test.same(a, {x: 1, y: {z: 'foo'}});
    test.same(b, {x: 2, y: {z: 'foo'}});
    b.y.z = 'bar';
    test.same(a, {x: 1, y: {z: 'foo'}});
    test.same(b, {x: 2, y: {z: 'bar'}});
    test.done();
};

exports['jsonClone'] = function (test) {
    var a = {x: 1, y: {z: 'foo'}};
    var b = h.jsonClone(a);
    b.x = 2;
    test.same(a, {x: 1, y: {z: 'foo'}});
    test.same(b, {x: 2, y: {z: 'foo'}});
    b.y.z = 'bar';
    test.same(a, {x: 1, y: {z: 'foo'}});
    test.same(b, {x: 2, y: {z: 'bar'}});
    test.done();
};










exports['keys'] = function (test) {
    var a = {a: 1, b: 2, c: {d: 3}};
    test.same(h.keys(a), ['a','b','c']);
    test.done();
};

exports['values'] = function (test) {
    var a = {a: 1, b: 2, c: {d: 3}};
    test.same(h.values(a), [1,2,{d:3}]);
    test.done();
};


exports['pairs'] = function (test) {
    var a = {
      one: 1,
      two: 2,
      three: {
        four: 4,
        five: {
          six: 6
        }
      },
      seven: {
        eight: 8
      }
    };
    test.same(h.pairs(a), [
        ['one', 1],
        ['two', 2],
        ['three', {four: 4, five: {six: 6}}],
        ['seven', {eight: 8}]
    ]);
    test.done();
};

exports['join'] = function (test) {
    test.equal(h.join(':', ['a', 'b', 'c']), 'a:b:c');
    test.equal(h.join(' and ', ['abc', '123']), 'abc and 123');
    // partial application
    test.equal(h.join(':')(['a', 'b', 'c']), 'a:b:c');
    test.done();
};








exports['id'] = function (test) {
    test.equal(h.id(1), 1);
    test.equal(h.id('abc'), 'abc');
    test.equal(h.id(h.id(1)), 1);
    test.equal(h.id(h.id(h.id(1))), 1);
    test.done();
};

exports['until'] = function (test) {
    var p = function (x) {
        return x > 1000;
    };
    var f = function (x) {
        return x * 2;
    };
    test.equal(h.until(p, f, 1), 1024);
    // partial application
    test.equal(h.until(p)(f, 1), 1024);
    test.equal(h.until(p, f)(1), 1024);
    test.equal(h.until(p)(f)(1), 1024);
    test.done();
};

exports['error'] = function (test) {
    test.expect(1);
    try {
        h.error('my message');
    }
    catch (e) {
        test.equal(e.message, 'my message');
    }
    test.done();
};

/*
exports['stream.push'] = function (test) {
    var call_order = [];
    var s = h.createStream();
    s.on('data', function (val) {
        call_order.push(val);
    });
    test.same(call_order, []);
    s.push('foo');
    test.same(call_order, ['foo']);
    s.push('bar');
    test.same(call_order, ['foo', 'bar']);
    s.push('baz');
    test.same(call_order, ['foo', 'bar', 'baz']);
    test.done();
};
*/

exports['map stream'] = function (test) {
    var bvalues = [];
    var a = h.createStream();
    var b = h.map(h.add(1), a);
    b.on('data', function (val) {
        bvalues.push(val);
    });
    test.same(bvalues, []);
    a.emit('data', 1);
    test.same(bvalues, [2]);
    a.emit('data', 2);
    test.same(bvalues, [2,3]);
    a.emit('data', 3);
    test.same(bvalues, [2,3,4]);
    test.done();
};

exports['filter stream'] = function (test) {
    var bvalues = [];
    var a = h.createStream();
    function isEqual(n) {
        return !(n % 2);
    }
    var b = h.filter(isEqual, a);
    b.on('data', function (val) {
        bvalues.push(val);
    });
    test.same(bvalues, []);
    a.emit('data', 1);
    test.same(bvalues, []);
    a.emit('data', 2);
    test.same(bvalues, [2]);
    a.emit('data', 3);
    test.same(bvalues, [2]);
    a.emit('data', 4);
    test.same(bvalues, [2,4]);
    test.done();
};

exports['partition stream'] = function (test) {
    var p1values = [];
    var p2values = [];
    var a = h.createStream();
    function isEqual(n) {
        return !(n % 2);
    }
    var p = h.partition(isEqual, a);
    p[0].on('data', function (val) {
        p1values.push(val);
    });
    p[1].on('data', function (val) {
        p2values.push(val);
    });
    test.same(p1values, []);
    test.same(p2values, []);
    a.emit('data', 1);
    test.same(p1values, []);
    test.same(p2values, [1]);
    a.emit('data', 2);
    test.same(p1values, [2]);
    test.same(p2values, [1]);
    a.emit('data', 3);
    test.same(p1values, [2]);
    test.same(p2values, [1,3]);
    a.emit('data', 4);
    test.same(p1values, [2,4]);
    test.same(p2values, [1,3]);
    test.done();
};

exports['foldl stream'] = function (test) {
    var bvalues = [];
    var a = h.createStream();
    var b = h.foldl(add, 10, a);
    b.on('data', function (val) {
        bvalues.push(val);
    });
    a.emit('data', 1);
    test.same(bvalues, [10, 11]);
    a.emit('data', 2);
    test.same(bvalues, [10, 11, 13]);
    a.emit('data', 3);
    test.same(bvalues, [10, 11, 13, 16]);
    a.emit('data', 4);
    test.same(bvalues, [10, 11, 13, 16, 20]);
    test.done();
};

exports['foldr stream'] = function (test) {
    var a = h.createStream();
    // foldr doesn't make sense with streams
    // TODO: perhaps it does! we could accumulate all the steam into an array
    // then do a foldr on it...
    test.throws(function () {
        var b = h.foldr(add, 10, a);
    });
    test.done();
};

exports['each stream'] = function (test) {
    var calls = [];
    var a = h.createStream();
    var b = h.each(function (x) {
        calls.push(x);
    }, a);
    test.strictEqual(b, undefined);
    test.same(calls, []);
    a.emit('data', 1);
    test.same(calls, [1]);
    a.emit('data', 2);
    test.same(calls, [1,2]);
    a.emit('data', 3);
    test.same(calls, [1,2,3]);
    test.done();
};

exports['merge'] = function (test) {
    var vals = [];
    var a = h.createStream();
    var b = h.createStream();
    var c = h.createStream();
    var merged = h.merge([a,b,c]);
    merged.on('data', function (val) {
        vals.push(val);
    });
    test.same(vals, []);
    a.emit('data', 1);
    test.same(vals, [1]);
    b.emit('data', 2);
    test.same(vals, [1,2]);
    c.emit('data', 3);
    test.same(vals, [1,2,3]);
    a.emit('data', 4);
    b.emit('data', 5);
    c.emit('data', 6);
    c.emit('data', 7);
    c.emit('data', 8);
    b.emit('data', 9);
    a.emit('data', 10);
    test.same(vals, [1,2,3,4,5,6,7,8,9,10]);
    test.done();
};

exports['pipe: function, function'] = function (test) {
    var fn1 = h.add(4);
    var fn2 = function (n) {
        return n / 3;
    };
    var svalues = [];
    var s = h.pipe(fn1, fn2);
    s.on('data', function (val) {
        svalues.push(val);
    });
    s.write(8);
    test.same(svalues, [4]);
    test.done();
};

exports['pipe: stream, function'] = function (test) {
    var bvalues = [];
    var a = h.createStream();
    var b = h.pipe(a, h.add(1));
    b.on('data', function (val) {
        bvalues.push(val);
    });
    test.same(bvalues, []);
    a.emit('data', 1);
    test.same(bvalues, [2]);
    a.emit('data', 2);
    test.same(bvalues, [2,3]);
    a.emit('data', 3);
    test.same(bvalues, [2,3,4]);
    test.done();
};

exports['pipe: function, stream'] = function (test) {
    var avalues = [];
    var bvalues = [];
    var a = h.createStream();
    var b = h.pipe(h.add(1), a);
    a.on('data', function (val) {
        avalues.push(val);
    });
    b.on('data', function (val) {
        bvalues.push(val);
    });
    test.same(avalues, []);
    test.same(bvalues, []);
    b.write(1);
    test.same(avalues, [2]);
    test.same(bvalues, [2]);
    b.write(2);
    test.same(avalues, [2,3]);
    test.same(bvalues, [2,3]);
    b.write(3);
    test.same(avalues, [2,3,4]);
    test.same(bvalues, [2,3,4]);
    test.done();
};

exports['pipe: stream, stream'] = function (test) {
    var cvalues = [];
    var bvalues = [];
    var a = h.createStream();
    var b = h.createStream();
    var c = h.pipe(a, b);
    b.on('data', function (val) {
        bvalues.push(val);
    });
    c.on('data', function (val) {
        cvalues.push(val);
    });
    test.same(bvalues, []);
    test.same(cvalues, []);
    a.emit('data', 1);
    test.same(bvalues, [1]);
    test.same(cvalues, [1]);
    a.emit('data', 2);
    test.same(bvalues, [1,2]);
    test.same(cvalues, [1,2]);
    a.emit('data', 3);
    test.same(bvalues, [1,2,3]);
    test.same(cvalues, [1,2,3]);
    test.done();
};

exports['pipe: stream, function, stream'] = function (test) {
    var cvalues = [];
    var bvalues = [];
    var a = h.createStream();
    var b = h.createStream();
    var c = h.pipe(a, add(1), b);
    b.on('data', function (val) {
        bvalues.push(val);
    });
    c.on('data', function (val) {
        cvalues.push(val);
    });
    test.same(bvalues, []);
    test.same(cvalues, []);
    a.emit('data', 1);
    test.same(bvalues, [2]);
    test.same(cvalues, [2]);
    a.emit('data', 2);
    test.same(bvalues, [2,3]);
    test.same(cvalues, [2,3]);
    a.emit('data', 3);
    test.same(bvalues, [2,3,4]);
    test.same(cvalues, [2,3,4]);
    test.done();
};

exports['pipe: function, stream, function'] = function (test) {
    var cvalues = [];
    var bvalues = [];
    var a = add(1);
    var b = h.createStream();
    var c = h.pipe(a, b, mul(2));
    b.on('data', function (val) {
        bvalues.push(val);
    });
    c.on('data', function (val) {
        cvalues.push(val);
    });
    test.same(bvalues, []);
    test.same(cvalues, []);
    c.write(1);
    test.same(bvalues, [2]);
    test.same(cvalues, [4]);
    c.write(2);
    test.same(bvalues, [2,3]);
    test.same(cvalues, [4,6]);
    c.write(3);
    test.same(bvalues, [2,3,4]);
    test.same(cvalues, [4,6,8]);
    test.done();
};
