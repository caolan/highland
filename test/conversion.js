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
        return buf.toString().toUpperCase();
    }
    s.map(upper).walk(function (err, x) {
        if (err) {
            return test.done(err);
        }
        else if (x !== Nil) {
            calls.push(x);
        }
        else {
            test.equal(calls.join(''), "HELLO, WORLD!\n");
            test.done();
        }
    });
};

exports['return same obj if Stream() called on existing stream'] = function (test) {
    function mul2(x) {
        return x * 2;
    }
    var s1 = Stream(function (push, next) {
        push(1);
        push(2);
        push(3);
        push(Nil);
    });
    var s2 = Stream([1,2,3]);
    var s3 = s2.map(mul2);
    test.equal(s1, Stream(s1));
    test.equal(s2, Stream(s2));
    test.equal(s3, Stream(s3));
    test.done();
};

/*

// TODO:
exports['node stream backpressure']
exports['node stream paused in initial state']
exports['node stream consumers share iterator']
exports['pipe to stream']

*/
