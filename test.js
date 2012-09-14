var L = require('./highland');


/***** Functions *****/

exports['curry'] = function (test) {
    var fn = L.curry(function (a, b, c, d) {
        return a + b + c + d;
    });
    test.equal(fn(1,2,3,4), fn(1,2)(3,4));
    test.equal(fn(1,2,3,4), fn(1)(2)(3)(4));
    var fn2 = function (a, b, c, d) {
        return a + b + c + d;
    };
    test.equal(L.curry(fn2)(1,2,3,4), L.curry(fn2,1,2,3,4));
    test.equal(L.curry(fn2)(1,2,3,4), L.curry(fn2,1,2)(3,4));
    test.done();
};

exports['ncurry'] = function (test) {
    var fn = L.ncurry(3, function (a, b, c, d) {
        return a + b + c + (d || 0);
    });
    test.equal(fn(1,2,3,4), 6);
    test.equal(fn(1,2,3,4), fn(1,2)(3));
    test.equal(fn(1,2,3,4), fn(1)(2)(3));
    var fn2 = function () {
        var args = Array.prototype.slice(arguments);
        return L.foldl(function (a, b) { return a + b; }, 0, args);
    };
    test.equal(L.ncurry(3,fn2)(1,2,3,4), L.ncurry(3,fn2,1,2,3,4));
    test.equal(L.ncurry(3,fn2)(1,2,3,4), L.ncurry(3,fn2,1,2)(3,4));
    test.done();
};

exports['compose'] = function (test) {
    var fn1 = L.concat('one:');
    var fn2 = L.concat('two:');
    var fn = L.compose(fn2, fn1);
    test.equal(fn('zero'), 'two:one:zero');
    // partial application
    test.equal(L.compose(fn2)(fn1)('zero'), 'two:one:zero');
    test.done();
};

exports['apply'] = function (test) {
    var fn = function (a, b, c, d) {
        return a + b + c + d;
    };
    test.equal(L.apply(fn, [1,2,3,4]), 10);
    test.equal(L.apply(fn, [1,1,1,1]), 4);
    // partial application
    test.equal(L.apply(fn)([1,2,3,4]), 10);
    test.done();
};

exports['partial'] = function (test) {
    var addAll = function () {
        var args = Array.prototype.slice.call(arguments);
        return L.foldl1(L.add, args);
    };
    var f = L.partial(addAll, 1, 2);
    test.equal(f(3, 4), 10);
    test.done();
};

exports['flip'] = function (test) {
    var subtract = function (a, b) {
        return a - b;
    };
    test.equal(subtract(4,2), 2);
    test.equal(L.flip(subtract)(4,2), -2);
    test.equal(L.flip(subtract, 4)(2), -2);
    test.equal(L.flip(subtract, 4, 2), -2);
    test.done();
};


/***** Operators *****/

exports['eq'] = function (test) {
    function testTrue(args) {
        test.strictEqual(L.eq(args[0], args[1]), true);
    }
    function testFalse(args) {
        test.strictEqual(L.eq(args[0], args[1]), false);
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
    test.equal(L.eq(123)(123), true);
    test.equal(L.eq(123)(321), false);

    test.done();
};

exports['ne'] = function (test) {
    function testTrue(args) {
        test.strictEqual(L.ne(args[0], args[1]), true);
    }
    function testFalse(args) {
        test.strictEqual(L.ne(args[0], args[1]), false);
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
    test.equal(L.ne(123)(123), false);
    test.equal(L.ne(123)(321), true);

    test.done();
};

exports['not'] = function (test) {
    test.equal(!true, L.not(true));
    test.equal(!false, L.not(false));
    test.throws(function () { L.not(123); });
    test.throws(function () { L.not('asdf'); });
    test.throws(function () { L.not(null); });
    test.throws(function () { L.not(undefined); });
    test.throws(function () { L.not({}); });
    test.throws(function () { L.not([]); });
    test.done();
};

exports['eqv'] = function (test) {
    function testTrue(args) {
        test.strictEqual(L.eqv(args[0], args[1]), true);
    }
    function testFalse(args) {
        test.strictEqual(L.eqv(args[0], args[1]), false);
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
    test.equal(L.eqv({a:1})({b:2}), false);
    test.equal(L.eqv({a:1})({a:1}), true);

    test.done();
};

exports['lt'] = function (test) {
    function testTrue(args) {
        test.strictEqual(L.lt(args[0], args[1]), true);
    }
    function testFalse(args) {
        test.strictEqual(L.lt(args[0], args[1]), false);
    }
    function testThrows(args) {
        test.throws(function () {
            L.lt(args[0], args[1]);
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
    test.equal(L.lt('abc')('def'), true);
    test.equal(L.lt(456)(123), false);

    test.done();
};

exports['gt'] = function (test) {
    function testTrue(args) {
        test.strictEqual(L.gt(args[0], args[1]), true);
    }
    function testFalse(args) {
        test.strictEqual(L.gt(args[0], args[1]), false);
    }
    function testThrows(args) {
        test.throws(function () {
            L.gt(args[0], args[1]);
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
    test.equal(L.gt('abc')('def'), false);
    test.equal(L.gt(456)(123), true);

    test.done();
};

exports['le'] = function (test) {
    function testTrue(args) {
        test.strictEqual(L.le(args[0], args[1]), true);
    }
    function testFalse(args) {
        test.strictEqual(L.le(args[0], args[1]), false);
    }
    function testThrows(args) {
        test.throws(function () {
            L.le(args[0], args[1]);
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
    test.equal(L.le('abc')('def'), true);
    test.equal(L.le(456)(123), false);
    test.equal(L.le(123)(123), true);

    test.done();
};

exports['ge'] = function (test) {
    function testTrue(args) {
        test.strictEqual(L.ge(args[0], args[1]), true);
    }
    function testFalse(args) {
        test.strictEqual(L.ge(args[0], args[1]), false);
    }
    function testThrows(args) {
        test.throws(function () {
            L.ge(args[0], args[1]);
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
    test.equal(L.ge('abc')('def'), false);
    test.equal(L.ge(456)(123), true);
    test.equal(L.ge(123)(123), true);

    test.done();
};

exports['and'] = function (test) {
    test.strictEqual(L.and(true, true), true);
    test.strictEqual(L.and(false, true), false);
    test.strictEqual(L.and(true, false), false);
    test.strictEqual(L.and(false, false), false);
    test.throws(function () { L.and('asdf', true); });
    test.throws(function () { L.and('asdf', 123); });
    test.throws(function () { L.and(123, {}); });
    test.throws(function () { L.and([], undefined); });
    test.throws(function () { L.and(undefined, null); });
    // partial application
    test.equal(true && true, L.and(true)(true));
    test.equal(true && false, L.and(true)(false));
    test.equal(false && true, L.and(false)(true));
    test.equal(false && false, L.and(false)(false));
    test.done();
};

exports['or'] = function (test) {
    test.strictEqual(L.or(true, true), true);
    test.strictEqual(L.or(false, true), true);
    test.strictEqual(L.or(true, false), true);
    test.strictEqual(L.or(false, false), false);
    test.throws(function () { L.or('asdf', true); });
    test.throws(function () { L.or('asdf', 123); });
    test.throws(function () { L.or(123, {}); });
    test.throws(function () { L.or([], undefined); });
    test.throws(function () { L.or(undefined, null); });
    // partial application
    test.equal(true || true, L.or(true)(true));
    test.equal(true || false, L.or(true)(false));
    test.equal(false || true, L.or(false)(true));
    test.equal(false || false, L.or(false)(false));
    test.done();
};

exports['add'] = function (test) {
    test.strictEqual(L.add(1,2), 3);
    test.strictEqual(L.add(2,2), 4);
    test.strictEqual(L.add(2.3,2.12), 4.42);
    test.throws(function () { L.add('123', true); });
    test.throws(function () { L.add('123', 123); });
    test.throws(function () { L.add(123, {}); });
    test.throws(function () { L.add([], undefined); });
    test.throws(function () { L.add(undefined, null); });
    // partial application
    test.equal(L.add(1)(1), L.add(1,1));
    test.equal(L.add(2)(5), L.add(2,5));
    test.done();
};

exports['sub'] = function (test) {
    test.strictEqual(L.sub(2,1), 1);
    test.strictEqual(L.sub(2,2), 0);
    test.strictEqual(L.sub(2,5), -3);
    test.throws(function () { L.sub('123', true); });
    test.throws(function () { L.sub('123', 123); });
    test.throws(function () { L.sub(123, {}); });
    test.throws(function () { L.sub([], undefined); });
    test.throws(function () { L.sub(undefined, null); });
    // partial application
    test.equal(L.sub(1)(1), L.sub(1,1));
    test.equal(L.sub(5)(2), L.sub(5,2));
    test.done();
};

exports['mul'] = function (test) {
    test.strictEqual(L.mul(2,1), 2);
    test.strictEqual(L.mul(2,2), 4);
    test.strictEqual(L.mul(2,5), 10);
    test.throws(function () { L.mul('123', true); });
    test.throws(function () { L.mul('123', 123); });
    test.throws(function () { L.mul(123, {}); });
    test.throws(function () { L.mul([], undefined); });
    test.throws(function () { L.mul(undefined, null); });
    // partial application
    test.equal(L.mul(1)(1), L.mul(1,1));
    test.equal(L.mul(5)(2), L.mul(5,2));
    test.done();
};

exports['div'] = function (test) {
    test.strictEqual(L.div(2,1), 2);
    test.strictEqual(L.div(2,2), 1);
    test.strictEqual(L.div(10,2), 5);
    test.throws(function () { L.div('123', true); });
    test.throws(function () { L.div('123', 123); });
    test.throws(function () { L.div(123, {}); });
    test.throws(function () { L.div([], undefined); });
    test.throws(function () { L.div(undefined, null); });
    // partial application
    test.equal(L.div(1)(1), L.div(1,1));
    test.equal(L.div(5)(2), L.div(5,2));
    test.done();
};

exports['rem'] = function (test) {
    test.strictEqual(L.rem(1,2), 1);
    test.strictEqual(L.rem(2,2), 0);
    test.strictEqual(L.rem(-1,5), -1);
    test.throws(function () { L.rem('123', true); });
    test.throws(function () { L.rem('123', 123); });
    test.throws(function () { L.rem(123, {}); });
    test.throws(function () { L.rem([], undefined); });
    test.throws(function () { L.rem(undefined, null); });
    // partial application
    test.equal(L.rem(1)(1), L.rem(1,1));
    test.equal(L.rem(5)(2), L.rem(5,2));
    test.done();
};

exports['mod'] = function (test) {
    test.strictEqual(L.mod(1,2), 1);
    test.strictEqual(L.mod(2,2), 0);
    test.strictEqual(L.mod(-1,5), 4);
    test.throws(function () { L.mod('123', true); });
    test.throws(function () { L.mod('123', 123); });
    test.throws(function () { L.mod(123, {}); });
    test.throws(function () { L.mod([], undefined); });
    test.throws(function () { L.mod(undefined, null); });
    // partial application
    test.equal(L.mod(1)(1), L.mod(1,1));
    test.equal(L.mod(5)(2), L.mod(5,2));
    test.done();
};


/***** Types *****/

exports['isArray'] = function (test) {
    function testTrue(x) {
        test.strictEqual(L.isArray(x), true);
    }
    function testFalse(x) {
        test.strictEqual(L.isArray(x), false);
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
        test.strictEqual(L.isObject(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(L.isObject(x), false, x);
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
        test.strictEqual(L.isFunction(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(L.isFunction(x), false, x);
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
        test.strictEqual(L.isString(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(L.isString(x), false, x);
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
        test.strictEqual(L.isNumber(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(L.isNumber(x), false, x);
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
        test.strictEqual(L.isBoolean(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(L.isBoolean(x), false, x);
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
        test.strictEqual(L.isNull(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(L.isNull(x), false, x);
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
        test.strictEqual(L.isUndefined(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(L.isUndefined(x), false, x);
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
        test.strictEqual(L.isNaN(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(L.isNaN(x), false, x);
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
        test.strictEqual(L.isDateObject(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(L.isDateObject(x), false, x);
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
        test.strictEqual(L.isRegExpObject(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(L.isRegExpObject(x), false, x);
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
        test.strictEqual(L.isArgumentsObject(x), true, x);
    }
    function testFalse(x) {
        test.strictEqual(L.isArgumentsObject(x), false, x);
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
    test.equal(L.type({}), 'object');
    test.equal(L.type([]), 'array');
    test.equal(L.type(function () {}), 'function');
    test.equal(L.type('asdf'), 'string');
    test.equal(L.type(new String('asdf')), 'string');
    test.equal(L.type(123), 'number');
    test.equal(L.type(Infinity), 'number');
    test.equal(L.type(true), 'boolean');
    test.equal(L.type(null), 'null');
    test.equal(L.type(undefined), 'undefined');
    test.equal(L.type(NaN), 'number'); // yes, really
    test.equal(L.type(new Date()), 'object');
    test.equal(L.type(new RegExp('asdf')), 'object');
    test.equal(L.type(arguments), 'object');
    test.done();
};


/***** Numbers *****/

exports['max'] = function (test) {
    test.equal(L.max(1,2), 2);
    test.equal(L.max(2,2), 2);
    test.equal(L.max(2,1), 2);
    test.equal(L.max('abc','def'), 'def');
    test.same(L.max([1,2],[3,4]), [3,4]);
    test.throws(function () { L.max(1, {}); });
    test.throws(function () { L.max('asdf', 1); });
    test.throws(function () { L.max([], 1); });
    test.throws(function () { L.max(true, 1); });
    test.throws(function () { L.max(null, 1); });
    test.throws(function () { L.max(undefined, 1); });
    // partial application
    test.equal(L.max(1)(2), 2);
    test.equal(L.max(2)(2), 2);
    test.equal(L.max(2)(1), 2);
    test.done();
};

exports['min'] = function (test) {
    test.equal(L.min(1,2), 1);
    test.equal(L.min(2,2), 2);
    test.equal(L.min(2,1), 1);
    test.equal(L.min('abc','def'), 'abc');
    test.same(L.min([1,2],[3,4]), [1,2]);
    test.throws(function () { L.min(1, {}); });
    test.throws(function () { L.min('asdf', 1); });
    test.throws(function () { L.min([], 1); });
    test.throws(function () { L.min(true, 1); });
    test.throws(function () { L.min(null, 1); });
    test.throws(function () { L.min(undefined, 1); });
    // partial application
    test.equal(L.min(1)(2), 1);
    test.equal(L.min(2)(2), 2);
    test.equal(L.min(2)(1), 1);
    test.done();
};

exports['compare'] = function (test) {
    test.equal(L.compare(1,2), -1);
    test.equal(L.compare(2,2), 0);
    test.equal(L.compare(2,1), 1);
    test.equal(L.compare('abc','def'), -1);
    test.same(L.compare([1,2],[3,4]), -1);
    test.throws(function () { L.compare(1, {}); });
    test.throws(function () { L.compare('asdf', 1); });
    test.throws(function () { L.compare([], 1); });
    test.throws(function () { L.compare(true, 1); });
    test.throws(function () { L.compare(null, 1); });
    test.throws(function () { L.compare(undefined, 1); });
    // partial application
    test.equal(L.compare(1)(2), -1);
    test.equal(L.compare(2)(2), 0);
    test.equal(L.compare(2)(1), 1);
    test.done();
};


/***** Lists *****/

exports['cons'] = function (test) {
    test.same(L.cons(1, [2,3,4]), [1,2,3,4]);
    test.same(L.cons(1, []), [1]);
    // partial application
    test.same(L.cons(1)([2,3,4]), [1,2,3,4]);
    test.same(L.cons(1)([]), [1]);
    test.done();
};

exports['append'] = function (test) {
    test.same(L.append(4, [1,2,3]), [1,2,3,4]);
    test.done();
};

exports['head'] = function (test) {
    var a = [1,2,3,4];
    test.equal(L.head(a), 1);
    test.same(a, [1,2,3,4]);
    var b = [4,3,2,1];
    test.equal(L.head(b), 4);
    test.same(b, [4,3,2,1]);
    // head of an empty list should result in an error
    test.throws(function () {
        L.head([]);
    });
    try {
        L.head([]);
    }
    catch (e) {
        test.equal(e.message, 'head of empty array');
    }
    test.done();
};

exports['last'] = function (test) {
    var a = [1,2,3,4];
    test.equal(L.last(a), 4);
    test.same(a, [1,2,3,4]);
    var b = [4,3,2,1];
    test.equal(L.last(b), 1);
    test.same(b, [4,3,2,1]);
    // last of an empty list should result in an error
    test.throws(function () {
        L.last([]);
    });
    test.done();
};

exports['tail'] = function (test) {
    var a = [1,2,3,4];
    test.same(L.tail(a), [2,3,4]);
    test.same(a, [1,2,3,4]);
    var b = [4,3,2,1];
    test.same(L.tail(b), [3,2,1]);
    test.same(b, [4,3,2,1]);
    // tail of an empty list should result in an error
    test.throws(function () {
        L.tail([]);
    });
    test.done();
};

exports['init'] = function (test) {
    var a = [1,2,3,4];
    test.same(L.init(a), [1,2,3]);
    test.same(a, [1,2,3,4]);
    var b = [4,3,2,1];
    test.same(L.init(b), [4,3,2]);
    test.same(b, [4,3,2,1]);
    // init of an empty list should result in an error
    test.throws(function () {
        L.init([]);
    });
    test.done();
};

exports['empty'] = function (test) {
    test.equal(L.empty([1,2,3]), false);
    test.equal(L.empty([]), true);
    test.equal(L.empty(''), true);
    test.equal(L.empty('abc'), false);
    test.done();
};

exports['length'] = function (test) {
    test.equal(L.length([1,2,3,4]), 4);
    test.equal(L.length([1,2,3]), 3);
    test.equal(L.length('abc'), 3);
    test.done();
};

exports['concat'] = function (test) {
    var a = [1];
    var b = [2,3];
    test.same(L.concat(a, b), [1,2,3]);
    // test original arrays are unchanged
    test.same(a, [1]);
    test.same(b, [2,3]);
    test.same(L.concat([1,2,3], []), [1,2,3]);
    // partial application
    var fn = L.concat([1,2]);
    test.same(fn([3,4]), [1,2,3,4]);
    test.same(fn([3,4,5]), [1,2,3,4,5]);
    test.equal(L.concat('abc', 'def'), 'abcdef');
    test.throws(function () { L.concat('abc', [1,2]); });
    test.throws(function () { L.concat([1,2], 'abc'); });
    test.throws(function () { L.concat(1, [2,3]); });
    test.throws(function () { L.concat([2,3], null); });
    test.throws(function () { L.concat(undefined, [2,3]); });
    test.throws(function () { L.concat([2,3], {}); });
    test.done();
};

exports['foldl'] = function (test) {
    test.equal(L.foldl(L.concat, '', ['1','2','3','4']), '1234');
    var fn = function (x, y) {
        return x + y;
    };
    test.equal(L.foldl(fn, 0, [1,2,3,4]), 10);
    // partial application
    test.equal(L.foldl(fn, 0)([1,2,3,4]), 10);
    test.equal(L.foldl(fn)(0, [1,2,3,4]), 10);
    test.equal(L.foldl(fn)(0)([1,2,3,4]), 10);
    var minus = function (a, b) {
        return a - b;
    };
    test.equal(L.foldl(minus, 1, [1,2,3]), -5);
    var concatUpper = function (a, b) {
        return (a + b).toUpperCase();
    };
    test.equal(L.foldl(concatUpper, 'a', 'bcd'), 'ABCD');
    test.equal(L.foldl(L.div, 4, [4, 2]), 0.5);
    test.done();
};

exports['foldl1'] = function (test) {
    var fn = function (x, y) {
        return x + y;
    };
    test.equal(L.foldl1(fn, [1,2,3,4]), 10);
    // partial application
    test.equal(L.foldl1(fn)([1,2,3,4]), 10);
    var minus = function (a, b) {
        return a - b;
    };
    test.equal(L.foldl1(minus, [1,2,3]), -4);
    var concatUpper = function (a, b) {
        return (a + b).toUpperCase();
    };
    test.equal(L.foldl1(concatUpper, 'abcd'), 'ABCD');
    test.done();
};

exports['foldr'] = function (test) {
    var minus = function (a, b) {
        return a - b;
    };
    test.equal(L.foldr(minus, 1, [1,2,3]), 1);
    var concatUpper = function (a, b) {
        return (a + b).toUpperCase();
    };
    test.equal(L.foldr(concatUpper, 'd', 'abc'), 'ABCD');
    test.equal(L.foldr(L.div, 4, [4, 2]), 8);
    // partial application
    test.equal(L.foldr(minus, 1)([1,2,3]), 1);
    test.equal(L.foldr(minus)(1)([1,2,3]), 1);
    test.done();
};

exports['foldr1'] = function (test) {
    var minus = function (a, b) {
        return a - b;
    };
    test.equal(L.foldr1(minus, [1,2,3]), 2);
    var concatUpper = function (a, b) {
        return (a + b).toUpperCase();
    };
    test.equal(L.foldr1(concatUpper, 'abcd'), 'ABCD');
    // partial application
    test.equal(L.foldr1(minus)([1,2,3]), 2);
    test.done();
};

exports['map'] = function (test) {
    var dbl = function (x) {
        test.equal(arguments.length, 1);
        return x * 2;
    };
    var a = [1,2,3,4];
    test.same(L.map(dbl, a), [2,4,6,8]);
    // test original array is unchanged
    test.same(a, [1,2,3,4]);
    // partial application
    test.same(L.map(dbl)(a), [2,4,6,8]);
    test.done();
};

exports['reverse'] = function (test) {
    test.same(L.reverse([1,2,3,4]), [4,3,2,1]);
    test.same(L.reverse([4,3,2,1]), [1,2,3,4]);
    test.same(L.reverse([1]), [1]);
    test.same(L.reverse([]), []);
    // make sure original array is unchanged
    var a = [1,2];
    test.same(L.reverse(a), [2,1]);
    test.same(a, [1,2]);
    test.done();
};

exports['concatMap'] = function (test) {
    var fn = function (c) {
        return c.toUpperCase();
    };
    test.equal(L.concatMap(fn, ['a','b','c']), 'ABC');
    test.done();
};

exports['all'] = function (test) {
    test.equal(L.all(L.not, [false, false, false]), true);
    test.equal(L.all(L.not, [true, false, false]), false);
    // partial applicatoin
    test.equal(L.all(L.not)([false, false, false]), true);
    test.equal(L.all(L.not)([true, false, false]), false);
    test.done();
};

exports['any'] = function (test) {
    test.equal(L.any(L.not, [false, false, false]), true);
    test.equal(L.any(L.not, [true, false, false]), true);
    test.equal(L.any(L.not, [true, true, true]), false);
    // partial applicatoin
    test.equal(L.any(L.not)([false, false, false]), true);
    test.equal(L.any(L.not)([true, false, false]), true);
    test.equal(L.any(L.not)([true, true, true]), false);
    test.done();
};

exports['maximum'] = function (test) {
    test.equal(L.maximum([1,2,3,4]), 4);
    test.equal(L.maximum([1,4,2,3]), 4);
    test.done();
};

exports['minimum'] = function (test) {
    test.equal(L.minimum([1,2,3,4]), 1);
    test.equal(L.minimum([3,2,4,1]), 1);
    test.done();
};

exports['replicate'] = function (test) {
    test.same(L.replicate(3, "ho"), ["ho","ho","ho"]);
    test.same(L.replicate(5, 1), [1,1,1,1,1]);
    test.same(L.replicate(1, 2), [2]);
    test.same(L.replicate(0, 2), []);
    // partial application
    test.same(L.replicate(3)("ho"), ["ho","ho","ho"]);
    test.same(L.replicate(5)(1), [1,1,1,1,1]);
    test.same(L.replicate(1)(2), [2]);
    test.same(L.replicate(0)(2), []);
    test.done();
};

exports['range'] = function (test) {
    test.same(L.range(1, 10), [1,2,3,4,5,6,7,8,9,10]);
    test.done();
};

exports['take'] = function (test) {
    var a = [1,2,3,4];
    test.same(L.take(1, a), [1]);
    test.same(a, [1,2,3,4]);
    test.same(L.take(2, a), [1,2]);
    test.same(a, [1,2,3,4]);
    test.same(L.take(3, a), [1,2,3]);
    test.same(a, [1,2,3,4]);
    test.same(L.take(4, a), [1,2,3,4]);
    test.same(a, [1,2,3,4]);
    test.same(L.take(5, a), [1,2,3,4]);
    test.same(a, [1,2,3,4]);
    // partial application
    test.same(L.take(1)(a), [1]);
    test.same(a, [1,2,3,4]);
    test.same(L.take(2)(a), [1,2]);
    test.same(a, [1,2,3,4]);
    test.done();
};

exports['drop'] = function (test) {
    var a = [1,2,3,4];
    test.same(L.drop(1, a), [2,3,4]);
    test.same(a, [1,2,3,4]);
    test.same(L.drop(2, a), [3,4]);
    test.same(a, [1,2,3,4]);
    test.same(L.drop(3, a), [4]);
    test.same(a, [1,2,3,4]);
    test.same(L.drop(4, a), []);
    test.same(a, [1,2,3,4]);
    test.same(L.drop(5, a), []);
    test.same(a, [1,2,3,4]);
    // partial application
    test.same(L.drop(1)(a), [2,3,4]);
    test.same(a, [1,2,3,4]);
    test.same(L.drop(2)(a), [3,4]);
    test.same(a, [1,2,3,4]);
    test.done();
};

exports['splitAt'] = function (test) {
    test.same(L.splitAt(3, [1,2,3,4,5]), [[1,2,3], [4,5]]);
    // partial application
    test.same(L.splitAt(3)([1,2,3,4,5]), [[1,2,3], [4,5]]);
    test.done();
};

exports['takeWhile'] = function (test) {
    var lt3 = function (x) {
        return x < 3;
    };
    test.same(L.takeWhile(lt3, [1,2,3,4]), [1,2]);
    test.same(L.takeWhile(lt3, [1,2,1,2]), [1,2,1,2]);
    test.same(L.takeWhile(lt3, [3,3,3,3]), []);
    // partial application
    test.same(L.takeWhile(lt3)([1,2,3,4]), [1,2]);
    test.same(L.takeWhile(lt3)([1,2,1,2]), [1,2,1,2]);
    test.same(L.takeWhile(lt3)([3,3,3,3]), []);
    test.done();
};

exports['dropWhile'] = function (test) {
    var lt3 = function (x) {
        return x < 3;
    };
    test.same(L.dropWhile(lt3, [1,2,3,4]), [3,4]);
    test.same(L.dropWhile(lt3, [1,2,1,2]), []);
    test.same(L.dropWhile(lt3, [3,3,3,3]), [3,3,3,3]);
    // partial application
    test.same(L.dropWhile(lt3)([1,2,3,4]), [3,4]);
    test.same(L.dropWhile(lt3)([1,2,1,2]), []);
    test.same(L.dropWhile(lt3)([3,3,3,3]), [3,3,3,3]);
    test.done();
};

exports['span'] = function (test) {
    var lt3 = function (x) {
        return x < 3;
    };
    test.same(L.span(lt3, [1,2,3,4]), [[1,2], [3,4]]);
    test.same(L.span(lt3, [1,2]), [[1,2], []]);
    test.same(L.span(lt3, [3,4]), [[], [3,4]]);
    test.same(L.span(lt3, []), [[], []]);
    // partial application
    test.same(L.span(lt3)([1,2,3,4]), [[1,2], [3,4]]);
    test.same(L.span(lt3)([1,2]), [[1,2], []]);
    test.same(L.span(lt3)([3,4]), [[], [3,4]]);
    test.same(L.span(lt3)([]), [[], []]);
    test.done();
};

exports['elem'] = function (test) {
    test.equal(L.elem(3, [1,2,3,4]), true);
    test.equal(L.elem(6, [1,2,3,4]), false);
    test.equal(L.elem(6, []), false);
    // partial application
    test.equal(L.elem(3)([1,2,3,4]), true);
    test.equal(L.elem(6)([1,2,3,4]), false);
    test.equal(L.elem(6)([]), false);
    test.done();
};

exports['notElem'] = function (test) {
    test.equal(L.notElem(3, [1,2,3,4]), false);
    test.equal(L.notElem(6, [1,2,3,4]), true);
    test.equal(L.notElem(6, []), true);
    // partial application
    test.equal(L.notElem(3)([1,2,3,4]), false);
    test.equal(L.notElem(6)([1,2,3,4]), true);
    test.equal(L.notElem(6)([]), true);
    test.done();
};

exports['find'] = function (test) {
    test.strictEqual(L.find(L.eq(2), [1,2,3,4]), 2);
    test.strictEqual(L.find(L.eq(10), [1,2,3,4]), undefined);
    test.done();
};

exports['filter'] = function (test) {
    var odd = function (x) {
        return x % 2;
    };
    var a = [1,2,3,4];
    test.same(L.filter(odd, a), [1,3]);
    // test original array is unchanged
    test.same(a, [1,2,3,4]);
    // partial application
    test.same(L.filter(odd)(a), [1,3]);
    test.done();
};

exports['zip'] = function (test) {
    test.same(L.zip([1,2,3], [4,5,6]), [[1,4],[2,5],[3,6]]);
    test.same(L.zip([1,2], [4,5,6]), [[1,4],[2,5]]);
    // partial application
    test.same(L.zip([1,2])([4,5]), [[1,4],[2,5]]);
    test.done();
};

exports['zipWith'] = function (test) {
    var add = function (a, b) {
        return a + b;
    };
    test.same(L.zipWith(add, [1,2,3,4,5], [6,7,8,9,10]), [7,9,11,13,15]);
    test.same(L.zipWith(add, [1,2,3], [6,7,8,9,10]), [7,9,11]);
    // partial application
    test.same(L.zipWith(add, [1,2,3])([6,7,8]), [7,9,11]);
    test.same(L.zipWith(add)([1,2,3], [6,7,8]), [7,9,11]);
    test.same(L.zipWith(add)([1,2,3])([6,7,8]), [7,9,11]);
    test.done();
};

exports['nub'] = function (test) {
    test.same(L.nub([1,2,1,1,2,3,3,4]), [1,2,3,4]);
    test.same(L.nub([1,2,3,4]), [1,2,3,4]);
    test.same(L.nub(['a','c','b','b']), ['a','c','b']);
    test.done();
};

exports['sort'] = function (test) {
    var a = [2,4,3,1];
    test.same(L.sort(a), [1,2,3,4]);
    test.same(a, [2,4,3,1]);
    var b = [1,2,3,4];
    test.same(L.sort([1,2,3,4]), [1,2,3,4]);
    test.same(b, [1,2,3,4]);
    test.same(L.sort([1,2,14,21,3]), [1,2,3,14,21]);
    test.same(L.sort(['a','c','b']), ['a','b','c']);
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

    var b = L.set(['three', 'four'], 40, a);

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

    var d = L.set(1, {four: 4}, c);

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
    test.equal(L.get(['one', 'two', 'three'], a), 3);
    test.equal(L.get(['one', 'two'], a), a.one.two);
    test.equal(L.get(['four', 'five', 'six'], a), undefined);
    test.equal(L.get(['four', 'five', 'six', 'seven'], a), undefined);
    /*
    test.throws(function () {
        L.get(a, ['four', 'five', 'six', 'seven'], true);
    });
    */
    test.equal(L.get('six', a), 6);

    test.equal(L.get(1, [1,2,3,4]), 2);
    test.equal(L.get(2, [1,2,3,4]), 3);
    test.equal(L.get(5, [1,2,3,4]), undefined);

    test.done();
};







exports['install'] = function (test) {
    test.expect(4);
    L.install();
    test.strictEqual(init, L.init);
    test.strictEqual(tail, L.tail);
    test.strictEqual(head, L.head);
    test.strictEqual(last, L.last);
    test.done();
};


exports['shallowClone'] = function (test) {
    var a = {x: 1, y: {z: 'foo'}};
    var b = L.shallowClone(a);
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
    var b = L.deepClone(a);
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
    var b = L.jsonClone(a);
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
    test.same(L.keys(a), ['a','b','c']);
    test.done();
};

exports['values'] = function (test) {
    var a = {a: 1, b: 2, c: {d: 3}};
    test.same(L.values(a), [1,2,{d:3}]);
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
    test.same(L.pairs(a), [
        ['one', 1],
        ['two', 2],
        ['three', {four: 4, five: {six: 6}}],
        ['seven', {eight: 8}]
    ]);
    test.done();
};

exports['join'] = function (test) {
    test.equal(L.join(':', ['a', 'b', 'c']), 'a:b:c');
    test.equal(L.join(' and ', ['abc', '123']), 'abc and 123');
    // partial application
    test.equal(L.join(':')(['a', 'b', 'c']), 'a:b:c');
    test.done();
};








exports['id'] = function (test) {
    test.equal(L.id(1), 1);
    test.equal(L.id('abc'), 'abc');
    test.equal(L.id(L.id(1)), 1);
    test.equal(L.id(L.id(L.id(1))), 1);
    test.done();
};










exports['until'] = function (test) {
    var p = function (x) {
        return x > 1000;
    };
    var f = function (x) {
        return x * 2;
    };
    test.equal(L.until(p, f, 1), 1024);
    // partial application
    test.equal(L.until(p)(f, 1), 1024);
    test.equal(L.until(p, f)(1), 1024);
    test.equal(L.until(p)(f)(1), 1024);
    test.done();
};




exports['error'] = function (test) {
    test.expect(1);
    try {
        L.error('my message');
    }
    catch (e) {
        test.equal(e.message, 'my message');
    }
    test.done();
};
