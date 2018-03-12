var handlebars = require('handlebars'),
    scrawl = require('scrawl'),
    path = require('path'),
    fs = require('fs'),
    showdown = require('showdown');


var src_file = path.resolve(__dirname, '../lib/index.js');
var tmpl_file = path.resolve(__dirname, '../docs/templates/base.html');
var out_file = path.resolve(__dirname, '../docs/index.html');

var sectionsOrder = [ 'Stream Objects',
                      'Transforms',
                      'Higher-order Streams',
                      'Consumption',
                      'Utils',
                      'Objects',
                      'Functions',
                      'Operators'
                    ];

function groupBySectionsInSectionsOrder(c1, c2){
  var idx1 = sectionsOrder.indexOf( c1.section ),
      idx2 = sectionsOrder.indexOf( c2.section );

  // actially this is just for typo checking
  if ( idx1 === -1 ) {
    throw new Error('Invalid Section for entry: ' + c1.id);
  }

  if ( idx2 === -1 ) {
    throw new Error('Invalid Section for entry: ' + c1.id);
  }

  return ( idx1 - idx2 );
}

function renderMarkdown(markdown, stripPTags) {
    var converter = new showdown.Converter();
    var html = converter.makeHtml(markdown);

    if (stripPTags) {
        html = html
            .replace(/^<p>/, '')
            .replace(/<\/p>$/, '');
    }

    return html;
}

function parseThrowsTag(throwsTag) {
    // Looks like @throws {Type} my comment.
    if (!Array.isArray(throwsTag)) {
        throwsTag = [throwsTag];
    }

    var throwsTagRegex = /^\{([^\}]+)\}(.*)/;
    return throwsTag.map(function (tag) {
        var match = throwsTagRegex.exec(tag);
        var description = match[2];
        var descriptionHtml = renderMarkdown(description, true);

        // Strip starting and ending tags.
        return {
            type: match[1],
            description: description,
            description_html: descriptionHtml
        };
    });
}

module.exports = function (grunt) {

    grunt.registerTask('docs',
        'Builds HTML documentation', function () {
            var src = fs.readFileSync(src_file).toString();
            var comments = scrawl.parse(src).filter(function (x) {
                return x.api === 'public';
            });

            comments.sort(groupBySectionsInSectionsOrder);

            var sections = {},
              containsId = function (id) {
                  return function (x) { return x.id === id; };
              },
              contains = function (items, c) {
                  return items.some(containsId(c.id));
              };

            comments.forEach(function (c) {
                if (!sections[c.section]) {
                    sections[c.section] = {
                        name: c.section,
                        items: []
                    };
                }
                var items = sections[c.section].items;

                if (contains(items, c)) {
                    throw new Error('Duplicate id:' + c.id);
                }
                c.tag = grunt.config.get('pkg.version')

                if (c.throws) {
                    c.throws = parseThrowsTag(c.throws);
                }

                if (c.params) {
                    c.params.forEach(function (param) {
                        if (param.description) {
                            param.description_html =
                                renderMarkdown(param.description, true);
                        }
                    });
                }

                items.push(c);
            });

            // sort the items in the sections?
            Object.keys(sections).forEach(function(sec){
              sections[sec].items.sort(function(item1, item2){
                return (item1.id > item2.id ? 1 : -1);
              });
            });

            var tmpl_src = fs.readFileSync(tmpl_file).toString();
            var tmpl = handlebars.compile(tmpl_src);

            var html = tmpl({
                comments: comments,
                sections: sections,
                tag: grunt.config.get('pkg.version')
            });

            fs.writeFileSync(out_file, html);
        }
    );

};
