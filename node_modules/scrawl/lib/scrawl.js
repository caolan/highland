var Showdown = require('../deps/showdown'),
    async = require('../deps/async'),
    path = require('path'),
    fs = require('fs');


exports.stripLine = function (line) {
    return line.replace(/^\s*\*?\s?/, '').replace(/\s+$/, '');
};

exports.parseTags = function (comment) {
    if (comment.description) {
        // strip trailing whitespace from description
        comment.description = comment.description.replace(/\s+$/, '');

        // convert markdown @description to HTML
        var converter = new Showdown.converter();
        comment.description_html = converter.makeHtml(comment.description);
    }
    if (comment.example) {
        // strip trailing whitespace from examples
        comment.example = comment.example.replace(/\s+$/, '');
    }

    // parse @param tags
    if (comment.param) {
        var params = comment.param;
        if (!Array.isArray(params)) {
            params = params ? [params]: [];
        }
        comment.params = params.map(function (str) {
            var match = /(?:^\{([^\}]+)\}\s+)?(?:([\S]+)\s*)?([\s\S]*)?/.exec(str);
            return {
                type: match[1],
                name: match[2],
                description: (match[3] || '').replace(/^\s*-\s*/, '')
            };
        });
    }

    // parse @returns tags
    if (comment.returns) {
        var match = /^\{([^\}]+)\}/.exec(comment.returns);
        if (match) {
            comment.returns = match[1];
        }
    }

    return comment;
};

exports.parseComment = function (str) {
    var after_tags = false;
    var lines = str.split('\n');
    var after_line_break = false;
    var last_tag;

    var comment = lines.reduce(function (c, str) {
        var line = exports.stripLine(str);
        if (line) {
            var match = /^@([\S]+)\s*(.*)/.exec(line);
            if (match) {
                after_tags = true;
                var tagname = match[1];
                var tagvalue = match[2].replace(/^\s+/, '');
                last_tag = tagname;
                if (c.hasOwnProperty(tagname)) {
                    // tag already exists
                    if (!Array.isArray(c[tagname])) {
                        c[tagname] = [c[tagname]];
                    }
                    c[tagname].push(tagvalue);
                }
                else {
                    // new tag
                    c[tagname] = tagvalue || true;
                }
            }
            else if (last_tag && !after_line_break) {
                var val = line.replace(/^\s+/, '');
                if (Array.isArray(c[last_tag])) {
                    c[last_tag][c[last_tag].length - 1] += ' ' + val;
                }
                else {
                    c[last_tag] += ' ' + val;
                }
            }
            else {
                last_tag = null;
                var val = line.replace(/(?:^|[^\\])_/g, '\\_');
                if (!after_tags) {
                    if (c.description) {
                        c.description += '\n' + val;
                    }
                    else {
                        c.description = val;
                    }
                }
                else {
                    if (c.example) {
                        c.example += '\n' + val;
                    }
                    else {
                        c.example = val;
                    }
                }
            }
            after_line_break = false;
        }
        else {
            after_line_break = true;
            var val = line.replace(/(?:^|[^\\])_/g, '\\_');
            if (!after_tags) {
                if (c.description) {
                    c.description += '\n' + val;
                }
            }
            else {
                if (c.example) {
                    c.example += '\n' + val;
                }
            }
        }
        return c;
    }, {});

    return exports.parseTags(comment);
};

exports.parse = function (str) {
    var match, comments = [];
    while (match = (/\/\*\*([\s\S]*?)\*\//g).exec(str)) {
        str = str.substr(match.index + match[1].length);
        comments.push(exports.parseComment(match[1]));
    };
    return comments;
};

exports.parseModules = function (paths, include_hidden, callback) {
    if (!callback) {
        callback = include_hidden;
        include_hidden = false;
    }
    if (!Array.isArray(paths)) {
        paths = paths ? [paths]: [];
    }
    async.concat(paths, function (p, cb) {
        return exports.findModules(p, include_hidden, cb);
    },
    function (err, modules) {
        if (err) {
            return callback(err);
        }
        async.map(modules, function (m, cb) {
            fs.readFile(m, function (err, content) {
                if (err) {
                    return cb(err);
                }
                cb(null, {
                    comments: exports.parse(content.toString()),
                    name: path.basename(m).replace(/\.js$/, ''),
                    path: m
                });
            });
        },
        function (err, results) {
            if (err) {
                return callback(err);
            }
            return callback(null, results.sort(function (a, b) {
                if (a.path < b.path) {
                    return -1;
                }
                else if (a.path > b.path) {
                    return 1;
                }
                return 0;
            }));
        });
    });
};

exports.findModules = function (p, include_hidden, callback) {
    exports.descendants(p, function (err, files) {
        if (err) {
            return callback(err);
        }
        if (!Array.isArray(files)) {
            files = files ? [files]: [];
        }
        var matches = files.filter(function (f) {
            var relpath = exports.relpath(f, p);
            if (!include_hidden) {
                // should not start with a '.'
                if (/^\./.test(relpath)) {
                    return false;
                }
                // should not contain a file or folder starting with a '.'
                if (/\/\./.test(relpath)) {
                    return false;
                }
            }
            // should have a .js extension
            if (!/\.js$/.test(f)) {
                return false;
            }
            return true;
        });
        callback(null, matches);
    });
};

/**
 * List all files below a given path, recursing through subdirectories.
 *
 * @param {String} p
 * @param {Function} callback
 * @api public
 */

exports.descendants = function (p, callback) {
    fs.stat(p, function (err, stats) {
        if (err) {
            return callback(err);
        }
        if (stats.isDirectory()) {
            fs.readdir(p, function (err, files) {
                if (err) {
                    return callback(err);
                }
                var paths = files.map(function (f) {
                    return path.join(p, f);
                });
                async.concat(paths, exports.descendants, function (err, files) {
                    if (err) {
                        callback(err);
                    }
                    else {
                        callback(err, files);
                    }
                });
            });
        }
        else if (stats.isFile()) {
            callback(null, p);
        }
    });
};

/**
 * Returns the absolute path 'p1' relative to the absolute path 'p2'. If 'p1'
 * is already relative it is returned unchanged, unless both are relative.
 *
 * @param {String} p1
 * @param {String} p2
 * @return {String}
 * @api public
 */

exports.relpath = function (p1, p2) {
    // if both p1 and p2 are relative, change both to absolute
    if (p1[0] !== '/' && p2[0] !== '/') {
        p1 = exports.abspath(p1);
        p2 = exports.abspath(p2);
    }
    // if p1 is not absolute or p2 is not absolute, return p1 unchanged
    if (p1[0] !== '/' || p2[0] !== '/') {
        return p1;
    }

    // remove trailing slashes
    p1 = exports.rmTrailingSlash(p1);
    p2 = exports.rmTrailingSlash(p2);

    var p1n = path.normalize(p1).split('/'),
        p2n = path.normalize(p2).split('/');


    while (p1n.length && p2n.length && p1n[0] === p2n[0]) {
        p1n.shift();
        p2n.shift();
    }

    // if p1 is not a sub-path of p2, then we need to add some ..
    for (var i = 0; i < p2n.length; i++) {
        p1n.unshift('..');
    }

    return path.join.apply(null, p1n);
};

/**
 * Returns absolute version of a path. Relative paths are interpreted
 * relative to process.cwd() or the cwd parameter. Paths that are already
 * absolute are returned unaltered.
 *
 * @param {String} p
 * @param {String} cwd
 * @return {String}
 * @api public
 */

exports.abspath = function (p, /*optional*/cwd) {
    if (p[0] === '/') {
        return p;
    }
    cwd = cwd || process.cwd();
    return path.normalize(path.join(cwd, p));
};

/**
 * Removes trailing slashes from paths.
 *
 * @param {String} p
 * @return {String}
 * @api public
 */

exports.rmTrailingSlash = function (p) {
    if (p.length > 1 && p[p.length - 1] === '/') {
        return p.substr(0, p.length - 1);
    }
    return p;
};
