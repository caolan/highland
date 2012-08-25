/**
 * Highland.js 0.0.1
 * (c) 2012 Caolan McMahon
 *
 * -- Functions --
 *  curry ncurry compose apply flip
 *
 * -- Operators --
 *  eq ne lt gt le ge and or not add mul div rem
 */


/**
 * Universal module definition
 */

(function (root, factory) {

    if (typeof exports === 'object') {
        module.exports = factory(module.exports); // Node
    }
    else if (typeof define === 'function' && define.amd) {
        define(factory); // AMD
    }
    else {
        root.Highland = factory(); // Browser globals
    }

}(this, function () {


var L = {};

var root = this;
var slice = Array.prototype.slice;


/***** Functions *****/

/**
 * curry f args... -> Function
 *
 * Transforms a function with specific arity (all arguments must be
 * defined) in a way that it can be called as a chain of functions until
 * the arguments list is saturated.
 *
 * This function is not itself curryable.
 *
 * Example:
 *
 *     fn = curry(function (a, b, c) {
 *         return a + b + c;
 *     });
 *
 *     fn(1)(2)(3) == fn(1, 2, 3)
 *     fn(1, 2)(3) == fn(1, 2, 3)
 *     fn(1)(2, 3) == fn(1, 2, 3)
 *
 */

L.curry = function (fn /* args... */) {
    var args = slice.call(arguments);
    return L.ncurry.apply(this, [fn.length].concat(args));
};

/**
 * ncurry n fn args... -> Function
 *
 * Same as `curry` but with a specific number of arguments. This can be
 * useful when functions do not explicitly define all its parameters.
 *
 * This function is not itself curryable.
 *
 * Example:
 *
 *     fn = ncurry(3, function () {
 *         return Array.prototype.join.call(arguments, '.');
 *     });
 *
 *     fn(1, 2, 3) == '1.2.3';
 *     fn(1, 2)(3) == '1.2.3';
 *     fn(1)(2)(3) == '1.2.3';
 */

L.ncurry = function (n, fn /* args... */) {
    var largs = slice.call(arguments, 2);
    if (largs.length >= n) {
        return L.apply(fn, largs.slice(0, n));
    }
    return function () {
        var args = largs.concat(slice.call(arguments));
        if (args.length < n) {
            return L.ncurry.apply(this, [n, fn].concat(args));
        }
        return fn.apply(this, args.slice(0, n));
    }
};

/**
 * compose a -> b -> Function
 *
 * Creates a composite function, which is the application of function 'a' to
 * the results of function 'b'.
 *
 * Example:
 *
 *     var add1 = add(1);
 *     var mul3 = mul(3);
 *
 *     var add1mul3 = compose(mul3, add1);
 *     add1mul3(2) == 9
 *
 */

L.compose = L.curry(function (a, b) {
    return function () { return a(L.apply(b, arguments)); };
});

/**
 * apply f -> args -> ?
 *
 * Applies function `f` with arguments array `args`. Same as doing
 * `fn.apply(this, args)`
 */

L.apply = L.curry(function (f, args) { return f.apply(this, args); });

/**
 * flip f -> x -> y -> ?
 *
 * Evaluates the function `f` with the argument positions swapped. Only
 * works with functions that accept two arguments.
 *
 * Example:
 *
 *     div(2, 4) == 0.5
 *     flip(div)(2, 4) == 2
 */

L.flip = L.curry(function (fn, x, y) { return fn(y, x); });


/***** Operators *****/

// helper for generating operator functions, not public
var operator = function (op) {
    return L.curry(new Function ('a', 'b', 'return a ' + op + ' b;'));
};

/**
 * eq a -> b -> Boolean
 *
 * Tests for equality using `===`
 *
 * Example:
 *
 *     eq(1,1) == true
 *     eq(1,2) == false
 */

L.eq = operator('===');

/**
 * eqv a -> b -> Boolean
 *
 * Tests if the values of a and b are equivalent. With objects and arrays
 * this function will recursively test sub-properties in order to determine
 * equivalence. The `eq` function when applied to two instances of the same
 * prototype will return false, this function will return true.
 *
 * Example:
 *
 *     eqv({a: 1}, {a: 1}) == true
 *     eqv({a: 1, b: {c: 2}}, {a: 1, b: {c: 3}}) == false
 */

// used in Node.js
var hasBuffer = (typeof Buffer !== 'undefined');


// Adapted from the Node.js lib/assert.js module
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Available under the MIT license
// https://github.com/joyent/node/blob/master/LICENSE


L.eqv = function (a, b) {
    if (a === b) {
        return true;
    }
    else if (hasBuffer && Buffer.isBuffer(a) && Buffer.isBuffer(b)) {
        if (a.length != b.length) {
            return false;
        }
        for (var i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) {
                return false;
            }
        }
        return true;
    }
    else if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime();
    }
    else if (a instanceof RegExp && b instanceof RegExp) {
        return a.source === b.source &&
            a.global === b.global &&
            a.multiline === b.multiline &&
            a.lastIndex === b.lastIndex &&
            a.ignoreCase === b.ignoreCase;
    }
    else if (typeof a != 'object' && typeof b != 'object') {
        return a == b;
    }
    else {
        return objEquiv(a, b);
    }
};

function isArguments(object) {
    return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
    if ((a === null || a === undefined) || (b === null || b === undefined)) {
        return false;
    }
    // an identical 'prototype' property.
    if (a.prototype !== b.prototype) return false;
    //~~~I've managed to break Object.keys through screwy arguments passing.
    //   Converting to array solves the problem.
    if (isArguments(a)) {
        if (!isArguments(b)) {
            return false;
        }
        a = pSlice.call(a);
        b = pSlice.call(b);
        return L.eqv(a, b);
    }
    try {
        var ka = Object.keys(a),
            kb = Object.keys(b),
            key, i;
    }
    catch (e) {
        // happens when one is a string literal and the other isn't
        return false;
    }
    // having the same number of owned properties (keys incorporates
    // hasOwnProperty)
    if (ka.length != kb.length) {
        return false;
    }
    // the same set of keys (although not necessarily the same order),
    ka.sort();
    kb.sort();
    //~~~cheap key test
    for (i = ka.length - 1; i >= 0; i--) {
        if (ka[i] != kb[i]) {
            return false;
        }
    }
    // equivalent values for every corresponding key, and
    //~~~possibly expensive deep test
    for (i = ka.length - 1; i >= 0; i--) {
        key = ka[i];
        if (!L.eqv(a[key], b[key])) {
            return false;
        }
    }
    return true;
}

/**
 * ne a -> b -> Boolean
 *
 * Tests for inequality using `!==`
 *
 * Example:
 *
 *     ne(1,1) == false
 *     ne(1,2) == true
 */

L.ne = operator('!==');

/**
 * lt a -> b -> Boolean
 *
 * Tests if a is less than b using `<`
 *
 * Example
 *
 *     lt(2,4) == true
 *     lt(5,1) == false
 *     lt(3,3) == false
 */

L.lt = function (a, b) {
    var ta = L.type(a),
        tb = L.type(b);

    if (ta !== tb) {
        throw new Error('Cannot compare type ' + ta + ' with type ' + tb);
    }
    if (ta === 'string' || ta === 'number') {
        return a < b;
    }
    if (ta === 'array') {
        var len = L.min(a.length, b.length);
        for (var i = 0; i < len; i++) {
            if (L.lt(a[i], b[i])) {
                return true;
            }
            else if (!L.eqv(a[i], b[i])) {
                return false;
            }
        }
        return a.length < b.length;
    }
    throw new Error('Cannot order values of type ' + ta);
};

/**
 * gt a -> b -> Boolean
 *
 * Tests if a is greater than b using `>`
 *
 * Example
 *
 *     gt(2,4) == false
 *     gt(5,1) == true
 *     gt(3,3) == false
 */

L.gt = operator('>');

/**
 * le a -> b -> Boolean
 *
 * Tests if a is less than or equal to b using `<=`
 *
 * Example
 *
 *     lt(2,4) == true
 *     lt(5,1) == false
 *     lt(3,3) == true
 */

L.le = operator('<=');

/**
 * ge a -> b -> Boolean
 *
 * Tests if a is greater than or equal to b using `>=`
 *
 * Example
 *
 *     gt(2,4) == false
 *     gt(5,1) == true
 *     gt(3,3) == true
 */

L.ge = operator('>=');

/**
 * and a -> b -> Boolean
 *
 * Tests if both a and b are truthy using `&&`.
 *
 * Example:
 *
 *     and(true, true) == true
 *     and(false, true) == false
 *     and(false, false) == false
 *
 */

L.and = operator('&&');

/**
 * or a -> b -> Boolean
 *
 * Tests if either a or b are truthy using `||`.
 *
 * Example:
 *
 *     and(true, true) == true
 *     and(false, true) == true
 *     and(false, false) == false
 *
 */

L.or  = operator('||');

/**
 * not a -> Boolean
 *
 * Tests if a is not truthy using `!`.
 *
 * Example:
 *
 *     not(true) == false
 *     not(false) == true
 */

L.not = function (a) { return !a; };

/**
 * add a -> b -> ?
 *
 * Adds a and b using `+`
 *
 * Example:
 *
 *     add(1,2) == 3
 *     add(5,5) == 10
 */

L.add = operator('+');

/**
 *
 */

L.sub = operator('-');
L.mul = operator('*');
L.div = operator('/');
L.rem = operator('%'); // it's not actually modulus in js, but remainder:
                       // -1 % 5 === -1 (should be 4)

// TODO: add eqv for 'equivalent' -- like test.same in nodeunit


/***** Types *****/

L.isArray = Array.isArray || function (obj) {
    return toString.call(obj) === '[object Array]';
};
L.isObject = function (obj) {
    return obj === Object(obj);
    // also check not an array and not function
};
L.isFunction = function (obj) {
    return toString.call(obj) == '[object Function]';
};
L.isString = function (obj) {
    return toString.call(obj) == '[object String]';
};
L.isNumber = function (obj) {
    return toString.call(obj) == '[object Number]';
};
L.isBoolean = function (obj) {
    return obj === true || obj === false ||
        toString.call(obj) == '[object Boolean]';
};
L.isNull = function (obj) {
    return obj === null;
};
L.isUndefined = function (obj) {
    return obj === void 0;
};

L.type = function (obj) {
    return (
        (L.isArray(obj) && 'array') ||
        (L.isFunction(obj) && 'function') ||
        (L.isObject(obj) && 'object') ||
        (L.isString(obj) && 'string') ||
        (L.isNumber(obj) && 'number') ||
        (L.isBoolean(obj) && 'boolean') ||
        (L.isNull(obj) && 'null') ||
        (L.isUndefined(obj) && 'undefined')
    );
};


/***** Numbers *****/

L.max = L.curry(function (x, y) { return x >= y ? x: y; });
L.min = L.curry(function (x, y) { return x <= y ? x: y; });


/***** Lists *****/

L.cons   = L.curry(function (el, arr) { return [el].concat(arr); });
L.append = L.curry(function (el, arr) { return arr.concat([el]); });


/** Basic Functions **/

L.head = function (arr) {
    return L.empty(arr) ? L.error('head of empty array'): arr[0];
};
L.last = function (arr) {
    return L.empty(arr) ? L.error('last of empty array'): arr[arr.length - 1];
};
L.tail = function (arr) {
    return L.empty(arr) ? L.error('tail of empty array'): arr.slice(1);
};
L.init = function (arr) {
    return L.empty(arr) ?
        L.error('init of empty array'):
        arr.slice(0, arr.length - 1);
};

L.empty  = function (arr) { return arr.length === 0; };
L.length = function (arr) { return arr.length; };

L.concat = L.curry(function (a, b) {
    if (L.isArray(a)) {
        return Array.prototype.concat.apply(a, b);
    }
    if (L.isString(a)) {
        return a + b;
    }
    throw new Error(
        'Cannot concat types "' + (typeof a) + '" and "' + (typeof b) + '"'
    );
});


/** Reducing lists (folds) **/

L.foldl = L.curry(function (f, z, xs) { return xs.reduce(f, z); });
L.foldl1 = L.curry(function (f, xs) {
    return L.foldl(f, L.head(xs), L.tail(xs));
});
L.foldr = L.curry(function (f, z, xs) {
    for (var i = xs.length - 1; i >= 0; --i) {
        z = f(xs[i], z);
    }
    return z;
});
L.foldr1 = L.curry(function (f, xs) {
    return L.foldr(f, L.last(xs), L.init(xs));
});


/** List transformations **/

L.map = L.curry(function (f, xs) { return xs.map(f); });
L.reverse = L.foldl(L.flip(L.cons), []);

// intersperse
// intercalate
// transpose
// subsequences
// permutations


/** Special folds **/

L.concatMap = L.curry(function (f, xs) {
    return L.foldl1(L.concat, L.map(f, xs));
});

L.all = L.curry(function (p, xs) {
    return L.foldl(L.and, true, L.map(p, xs));
});

L.any = L.curry(function (p, xs) {
    return L.foldl(L.or, false, L.map(p, xs));
});

L.maximum = L.foldl1(L.max);
L.minimum = L.foldl1(L.min);

// sum
// product
// concatList
// andList
// orList


/*** Building lists ***/

/** Scans **/

// scanl
// scanl1
// scanr
// scanr1


/** Accumulating maps **/

// mapAccumL
// mapAccumR


/** Infinite lists **/

// iterate
// repeat
L.replicate = L.curry(function (n, x) {
    var r = [];
    for (var i = 0; i < n; i++) {
        r[i] = x;
    }
    return r;
});
// cycle

// custom addition to replace [1..10] etc
L.range = function (a, b) {
    var xs = [];
    for (var i = a; i <= b; i++) {
        xs.push(i);
    }
    return xs;
};


/** Unfolding **/

// unfoldr


/*** Sublists ***/

/** Extracting sublists **/

L.take = L.curry(function (i, xs) { return slice.call(xs, 0, i); });
L.drop = L.curry(function (i, xs) { return slice.call(xs, i); });
L.splitAt = L.curry(function (n, xs) {
    return [L.take(n, xs), L.drop(n, xs)];
});

L.takeWhile = L.curry(function (p, xs) {
    var len = xs.length, i = 0;
    while (i < len && p(xs[i])) {
        i++;
    }
    return L.take(i, xs);
});

L.dropWhile = L.curry(function (p, xs) {
    var len = xs.length, i = 0;
    while (i < len && p(xs[i])) {
        i++;
    }
    return L.drop(i, xs);
});
L.span = L.curry(function (p, xs) {
    var left = [];
    var len = xs.length, i = 0;
    while (i < len && p(xs[i])) {
        left.push(xs[i]);
        i++;
    }
    return [left, slice.call(xs, i)];
});
// break

// stripPrefix

// group

// inits
// tails


/** Predicates **/

// isPrefixOf
// isSuffixOf
// isInfixOf


/*** Searching lists ***/

/** Searching by equality **/

L.elem    = L.curry(function (x, xs) { return L.any(L.eq(x), xs); });
L.notElem = L.curry(function (x, xs) { return L.not(L.elem(x, xs)); });
// lookup

/** Searching with a predicate **/

// find
L.filter = L.curry(function (f, xs) { return xs.filter(f); });
// partition


/*** Indexing Lists ***/

// (!!)
// elemIndex
// elemIndicies
// findIndex
// findIndicies


/*** Zipping and unzipping lists ***/

L.zip = L.curry(function (xs, ys) {
    return L.zipWith(function (x, y) { return [x, y]; }, xs, ys);
});
// zip3
// zip4, zip5, zip6, zip7
L.zipWith = L.curry(function (f, xs, ys) {
    var r = [];
    var len = L.min(L.length(xs), L.length(ys));
    for (var i = 0; i < len; i++) {
        r[i] = f(xs[i], ys[i]);
    }
    return r;
});
// zipWith3
// zipWith4, zipWith5, zipWith6, zipWith7
// unzip
// unzip3
// unzip4, unzip5, unzip6, unzip7


/*** Special lists ***/

/** Functions on strings **/

// lines
// words
// unlines
// unwords


/*** "Set" operations ***/

L.nub = L.foldl(function (ys, x) {
    return L.elem(x, ys) ? ys: L.append(x, ys);
}, []);

// nub (uniq)
// delete
// (\\)
// union
// intersect

/*** Ordered lists ***/

L.sort = function (xs) { return slice.call(xs).sort(); };
// insert


/*** Generalized functions ***/

/** User-supplied equality **/

// nubBy
// deleteBy
// deleteFirstBy
// unionBy
// intersectBy
// groupBy


/** User-supplied comparison **/

// sortBy
// insertBy
// maximumBy
// minimumBy






/***** Strings *****/

// strip :: String -> String
// lstrip :: String -> String
// rstrip :: String -> String
// startswith :: Eq a => [a] -> [a] -> Bool // alias for isPrefixOf
// endswith :: Eq a => [a] -> [a] -> Bool   // alias for isSuffixOf
L.join = L.curry(function (sep, xs) {
    return Array.prototype.join.call(xs, sep);
});
// split :: Eq a => [a] -> [a] -> [[a]]
// splitWs :: String -> [String]
// replace :: Eq a => [a] -> [a] -> [a] -> [a]
// escapeRe :: String -> String






/***** Objects *****/

L.shallowClone = function (obj) {
    if (L.isArray(obj)) {
        return slice.call(obj);
    }
    var newobj = {};
    for (var k in obj) {
        newobj[k] = obj[k];
    }
    return newobj;
};

L.deepClone = function (obj) {
    if (L.isArray(obj)) {
        return map(L.deepClone, obj);
    }
    if (L.isObject(obj)) {
        var newobj = {};
        for (var k in obj) {
            newobj[k] = L.deepClone(obj[k]);
        }
        return newobj;
    }
    return obj;
};

L.jsonClone = function (obj) {
    return JSON.parse( JSON.stringify(obj) );
};

L.set = L.curry(function (obj, path, val) {
    if (!L.isArray(path)) {
        path = [path];
    }
    if (path.length === 0) {
        return val;
    }
    var newobj = L.shallowClone(obj),
        p = L.head(path),
        ps = L.tail(path);

    if (L.isObject(obj[p])) {
        newobj[p] = L.set(L.shallowClone(obj[p]), ps, val);
    }
    else {
        newobj[p] = L.set({}, ps, val);
    }
    return newobj;
});

L.get = L.curry(function (obj, path) {
    if (!L.isArray(path)) {
        path = [path];
    }
    if (path.length === 0) {
        return obj;
    }
    var p = L.head(path),
        ps = L.tail(path);

    if (obj.hasOwnProperty(p)) {
        return L.get(obj[p], ps);
    }
    return undefined;
});

L.freeze = Object.freeze;

L.deepFreeze = function (obj) {
    if (typeof obj === 'object') {
        L.freeze(obj);

        //map L.values(obj)

        for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
                L.deepFreeze(obj[k]);
            }
        }
    }
    return obj;
};

L.keys = Object.keys;

L.values = function (obj) {
    return L.map(L.get(obj), L.keys(obj));
};

L.pairs = function (obj) {
    return L.map(function (k) { return [k, obj[k]]; }, L.keys(obj));
};


/***** Utilities *****/

L.id = function (x) {
    return x;
};

L.until = L.curry(function (p, f, x) {
    var r = x;
    while (!p(r)) {
        r = f(r);
    }
    return r;
});

L.error = function (msg) {
    throw new Error(msg);
};

L.install = L.foldl(function (src, prop) {
    return src + 'var ' + prop + '=L.' + prop + '; ';
}, '', L.keys(L));

L.installGlobal = function () {
    var keys = L.keys(L);
    for (var i = 0; i < keys.length; i++) {
        (function (k) {
            root.__defineGetter__(k, function () {
                return L[k];
            });
            root.__defineSetter__(k, function () {
                throw new Error(k + ' is read-only');
            });
        }(keys[i]));
    }
};

return L;

}));
