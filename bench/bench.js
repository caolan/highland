var underscore = require('./underscore');
var highland = require('../highland');
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
}



// example data / functions used in tests

function square(x) {
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

benchmark('.map(square) x 10,000', {
    'underscore': function () { underscore(arr10K).map(square); },
    'lodash': function () { lodash(arr10K).map(square); },
    'highland': function () { highland(arr10K).map(square).resume(); }
});

benchmark('.map(square) x 100,000', {
    'underscore': function () { underscore(arr100K).map(square); },
    'lodash': function () { lodash(arr100K).map(square); },
    'highland': function () { highland(arr100K).map(square).resume(); }
});


benchmark('.map(square) x 1,000,000', {
    'underscore': function () { underscore(arr1M).map(square); },
    'lodash': function () { lodash(arr1M).map(square); },
    'highland': function () { highland(arr1M).map(square).resume(); }
});


/*
benchmark('.map(square).filter(isEven) x 1,000,000', {
    'underscore': function () { underscore(arr1M).map(square).filter(isEven); },
    'lodash': function () { lodash(arr1M).map(square).filter(isEven); },
    'highland': function () { highland(arr1M).map(square).filter(isEven).resume(); }
});
*/
