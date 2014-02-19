// Browser reporter expects global nodeunit
global.nodeunit = require('nodeunit');
var run = require('nodeunit/lib/reporters/browser').run;

var tests = {
    'highland': require('./test.js')
};

run(tests);
