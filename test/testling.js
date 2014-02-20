var nodeunit = require('nodeunit-tape');

var tests = {
    'highland': require('./test.js')
};

nodeunit.run(tests);
