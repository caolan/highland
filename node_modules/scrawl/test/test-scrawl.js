var fs = require('fs'),
    scrawl = require('../lib/scrawl');


var fix_dir = __dirname + '/fixtures';


function test_basic_js(result, test) {
    test.equal(result.length, 9);
    test.same(result[0], {
            description: 'Single line comment with no tags',
            description_html: '<p>Single line comment with no tags</p>'
    });
    test.same(result[1], {
        description: 'Multi-line comment\nalso with no tags',
        description_html: '<p>Multi-line comment\nalso with no tags</p>'
    });
    test.same(result[2], {
        description: 'Multi-line\nwith some single-line tags',
        description_html: '<p>Multi-line\nwith some single-line ' +
                          'tags</p>',
        'tag_1': 'some value',
        'tag2': 'test',
        'tag-3': true
    });
    test.same(result[3], {
        description: '*Markdown* inside description tags ' +
                     '<div>test</div>\n\nanother paragraph',
        description_html: '<p><em>Markdown</em> inside description '+
                          'tags <div>test</div></p>\n\n<p>another ' +
                          'paragraph</p>',
        'tag_1': 'some value',
        'tag2': 'test',
        'tag-3': true
    });
    test.same(result[4], {
        description: 'Duplicate tags test',
        description_html: '<p>Duplicate tags test</p>',
        tag: ['one', 'two']
    });
    test.same(result[5], {
        description: 'Parameters and return test',
        description_html: '<p>Parameters and return test</p>',
        param: [
            '{String} one',
            '{type with spaces} two (optional)',
            '{String} three - some description'
        ],
        params: [
            {name: 'one', type: 'String', description: ''},
            {name: 'two', type: 'type with spaces', description: '(optional)'},
            {name: 'three', type: 'String', description: 'some description'}
        ],
        returns: 'Array'
    });
    test.same(result[6], {
        description: 'Single param',
        description_html: '<p>Single param</p>',
        param: '{Function} callback',
        params: [{name: 'callback', type: 'Function', description: ''}]
    });
    test.same(result[7], {
        tagname: 'Example test',
        example: '```javascript\nvar e = Example();\n```'
    });
    test.same(result[8], {tagonly: 'Foo'});
};


exports['parse basic.js'] = function (test) {
    fs.readFile(fix_dir + '/basic.js', function (err, content) {
        if (err) {
            return test.done(err);
        }
        var result = scrawl.parse(content.toString());
        test_basic_js(result, test);
        test.done();
    });
};

exports['parse_modules basic.js, basic2.js'] = function (test) {
    scrawl.parseModules(fix_dir, function (err, results) {
        if (err) {
            return test.done(err);
        }

        test_basic_js(results[0].comments, test);
        test.equal(results[0].path, fix_dir + '/basic.js');
        test.equal(results[0].name, 'basic');

        test_basic_js(results[1].comments, test);
        test.equal(results[1].path, fix_dir + '/basic2.js');
        test.equal(results[1].name, 'basic2');

        test.done();
    });
};
