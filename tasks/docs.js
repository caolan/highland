var handlebars = require('handlebars'),
    scrawl = require('scrawl'),
    path = require('path'),
    fs = require('fs');


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
                items.push(c);
            });

            // sort the items in the sections?
            Object.keys(sections).forEach(function(sec){
              console.log(sections[sec].items)
              sections[sec].items.sort(function(item1, item2){
                return (item1.id > item2.id ? 1 : -1);
              });
              console.log(sections[sec].items)
            });

            var tmpl_src = fs.readFileSync(tmpl_file).toString();
            var tmpl = handlebars.compile(tmpl_src);

            var html = tmpl({
                comments: comments,
                sections: sections
            });

            fs.writeFileSync(out_file, html);
        }
    );

};
