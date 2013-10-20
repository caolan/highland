var highland = require('../highland'),
    Stream = highland.Stream,
    Nil = highland.Nil,
    fs = require('fs');


exports['wrap node callback function'] = function (test) {
    var readFile = highland.wrapCallback(fs.readFile);
    var p = __dirname + '/data.txt';
    var data = Stream([p, p, p]).map(readFile).parallel();
    var toString = function (buf) {
        return buf.toString();
    };
    data.map(toString).toArray(function (arr) {
        test.same(arr, [
            'Hello, world!\n',
            'Hello, world!\n',
            'Hello, world!\n'
        ]);
        test.done();
    });
};

exports['wrap node stream'] = function (test) {
    var ns = fs.createReadStream(__dirname + '/data.txt');
    var s = Stream(ns);
    var calls = [];
    function upper(buf) {
        console.log(['upper', buf]);
        return buf.toString().toUpperCase();
    }
    s.map(upper).walk(function (err, x) {
        console.log(['walk', err, x]);
        if (err) {
            console.log('got error');
            return test.done(err);
        }
        else if (x !== Nil) {
            console.log('got value');
            calls.push(x);
        }
        else {
            console.log('got null');
            test.equal(calls.join(''), "HELLO, WORLD!\n");
            test.done();
        }
    });
};

/*

// TODO:
exports['node stream backpressure']
exports['node stream paused in initial state']
exports['node stream consumers share iterator']
exports['pipe to stream']

*/
