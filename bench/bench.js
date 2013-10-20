var underscore = require('./underscore');
var highland = require('../highland').Stream;
var lodash = require('./lodash');


function time(name, fn) {
    var start = new Date().getTime();
    fn();
    var end = new Date().getTime();
    var duration = end - start;
    console.log(name + ': ' + duration + 'ms');
}



// example data / functions used in tests

function square(x) {
    return x * x;
}

function isEven(x) {
    return x % 2 === 0;
}

var arr = [];
for (var i = 0; i < 1000000; i++) {
    arr.push(i);
}


console.log('map large array to square');

time('underscore', function () {
    underscore(arr).map(square).forEach(function () {});
});

time('lodash', function () {
    lodash(arr).map(square).forEach(function () {});
});

time('highland', function () {
    highland(arr).map(square).each(function () {});
});


console.log('map large array to square then filter evens');

time('underscore', function () {
    underscore(arr).map(square).filter(isEven).forEach(function () {});
});

time('lodash', function () {
    lodash(arr).map(square).filter(isEven).forEach(function () {});
});

time('highland', function () {
    highland(arr).map(square).filter(isEven).each(function () {});
});
