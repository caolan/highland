var underscore = require('./underscore');
var highland = require('../lib/index');
var lodash = require('./lodash');


function makeBar(len) {
    if (len <= 0) {
        return '';
    }
    else {
        return '#' + makeBar(len - 1);
    }
}

function pad(str, len) {
    if (str.length < len) {
        return pad(str, len - 1) + ' ';
    }
    else {
        return str;
    }
}

function benchmark(name, obj) {
    var max = 0;
    var results = Object.keys(obj).map(function (k) {
        var start = new Date().getTime();
        obj[k]();
        var end = new Date().getTime();
        var duration = end - start;
        if (duration > max) {
            max = duration;
        }
        return {
            name: k,
            duration: duration
        };
    });
    console.log('\n' + name + '\n');
    results.forEach(function (r) {
        console.log(
            pad(r.name, 12) +
            makeBar(r.duration / max * 60) + ' ' +
            r.duration + 'ms'
        );
    });
    console.log('');
    console.log(touch);
}



// example data / functions used in tests
var touch = 0;
function square(x) {
    touch+=x;
    return x * x;
}

function isEven(x) {
    return x % 2 === 0;
}

var arr10K = [];
for (var i = 0; i < 10000; i++) {
    arr10K.push(i);
}

var arr100K = [];
for (var i = 0; i < 100000; i++) {
    arr100K.push(i);
}

var arr1M = [];
for (var i = 0; i < 1000000; i++) {
    arr1M.push(i);
}

var uniqArr10K = [];
for (var i = 0; i < 10000; i++) {
    var n = (Math.random() * 100) >>> 0;
    if (n < 20) {
        // integer
        uniqArr10K.push(n);
    } else if (n < 40) {
        // boolean
        uniqArr10K.push(n);
    } else if (n < 60) {
        // string
        uniqArr10K.push(n.toString());
    } else if (n < 80) {
        // array
        uniqArr10K.push([n % 3, n % 7, n]);
    } else {
        // object
        uniqArr10K.push({
            a: 'foo',
            n: n
        });
    }
}

var uniqArr10KNum = [];
for (var i = 0; i < 10000; i++) {
    uniqArr10KNum.push(Math.random() * 100 >>> 0);
}

var allUniq10k = [];
for (var i = 0; i < 10000; i++) {
    allUniq10k.push([true]);
}

benchmark('.map(square) x 10,000', {
    'underscore': function () { underscore(arr10K).chain().map(square).value(); },
    'lodash': function () { lodash(arr10K).map(square).value(); },
    'highland': function () { highland(arr10K).map(square).resume(); }
});

benchmark('.map(square) x 100,000', {
    'underscore': function () { underscore(arr100K).chain().map(square).value(); },
    'lodash': function () { lodash(arr100K).map(square).value(); },
    'highland': function () { highland(arr100K).map(square).resume(); }
});

benchmark('.map(square) x 1,000,000', {
    'underscore': function () { underscore(arr1M).chain().map(square).value(); },
    'lodash': function () { lodash(arr1M).map(square).value(); },
    'highland': function () { highland(arr1M).map(square).resume(); }
});

benchmark('.map(square).filter(isEven).take(100) x 1,000,000', {
    'underscore': function () { underscore(arr1M).chain().map(square).filter(isEven).take(100).value(); },
    'lodash': function () { lodash(arr1M).map(square).filter(isEven).take(100).value(); },
    'highland': function () { highland(arr1M).map(square).filter(isEven).take(100).resume(); }
});

benchmark('.uniq x 10,000 (heterogenous)', {
    'underscore': function () { underscore(uniqArr10K).chain().uniq().value(); },
    'lodash': function () { lodash(uniqArr10K).uniq().value(); },
    'highland': function () { highland(uniqArr10K).uniq().resume(); }
});

benchmark('.uniq x 10,000 (numbers)', {
    'underscore': function () { underscore(uniqArr10KNum).chain().uniq().value(); },
    'lodash': function () { lodash(uniqArr10KNum).uniq().value(); },
    'highland': function () { highland(uniqArr10KNum).uniq().resume(); }
});

benchmark('.uniq x 10,000 (all unique)', {
    'underscore': function () { underscore(allUniq10k).chain().uniq().value(); },
    'lodash': function () { lodash(allUniq10k).uniq().value(); },
    'highland': function () { highland(allUniq10k).uniq().resume(); }
});
