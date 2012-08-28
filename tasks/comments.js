var scrawl = require('scrawl'),
    path = require('path'),
    fs = require('fs');


module.exports = function (tea, context, config, callback) {
    var t = context.handlebars;
    var filename = path.resolve(tea.source, 'highland.js');
    exports.parseComments(filename, function (err, comments) {
        if (err) {
            return callback(err);
        }
        var module_description = null;
        var sections = [];
        var curr = null;

        for (var i = 0; i < comments.length; i++) {
            var c = comments[i];
            if (c.module) {
                module_description = c.description_html;
            }
            else if (c.section) {
                var s = {name: c.section, functions: []};
                curr = s.functions;
                sections.push(s);
            }
            else if (c.name && curr) {
                c.short_name = c.name.split(' ')[0];
                curr.push(c);
            }
        }

        var html = t['website/index.html']({
            sections: sections,
            module_description: module_description
        });
        tea.emit('index.html', html);
        callback();
    });
};

exports.parseComments = function (filename, callback) {
    fs.readFile(filename, function (err, content) {
        if (err) {
            return callback(err);
        }
        var comments = scrawl.parse(content.toString());
        callback(null, comments);
    });
};
