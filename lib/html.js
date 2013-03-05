(function (root, factory) {

    if (typeof exports === 'object') {
        module.exports = factory(module.exports); // Node
    }
    else if (typeof define === 'function' && define.amd) {
        define(factory); // AMD
    }
    else {
        root.HTML = factory(); // Browser globals
    }

}(this, function () {

    var HTMLParser = (function () {

        function makeMap(str){
            var obj = {}, items = str.split(",");
            for ( var i = 0; i < items.length; i++ )
                obj[ items[i] ] = true;
            return obj;
        }

        // Regular Expressions for parsing tags and attributes
        var startTag = /^<([-A-Za-z0-9_]+)((?:\s+\w+(?:\s*=\s*(?:(?:"[^"]*")|(?:'[^']*')|[^>\s]+))?)*)\s*(\/?)>/,
            endTag = /^<\/([-A-Za-z0-9_]+)[^>]*>/,
            attr = /([-A-Za-z0-9_]+)(?:\s*=\s*(?:(?:"((?:\\.|[^"])*)")|(?:'((?:\\.|[^'])*)')|([^>\s]+)))?/g;

        // Empty Elements - HTML 4.01
        var empty = makeMap(
            "area,base,basefont,br,col,frame,hr,img,input,isindex,link," +
            "meta,param,embed"
        );

        // Block Elements - HTML 4.01
        var block = makeMap(
            "address,applet,blockquote,button,center,dd,del,dir,div,dl,dt," +
            "fieldset,form,frameset,hr,iframe,ins,isindex,li,map,menu," +
            "noframes,noscript,object,ol,p,pre,script,table,tbody,td,tfoot," +
            "th,thead,tr,ul"
        );

        // Inline Elements - HTML 4.01
        var inline = makeMap(
            "a,abbr,acronym,applet,b,basefont,bdo,big,br,button,cite,code," +
            "del,dfn,em,font,i,iframe,img,input,ins,kbd,label,map,object,q," +
            "s,samp,script,select,small,span,strike,strong,sub,sup," +
            "textarea,tt,u,var"
        );

        // Elements that you can, intentionally, leave open
        // (and which close themselves)
        var closeSelf = makeMap(
            "colgroup,dd,dt,li,options,p,td,tfoot,th,thead,tr"
        );

        // Attributes that have their values filled in disabled="disabled"
        var fillAttrs = makeMap(
            "checked,compact,declare,defer,disabled,ismap,multiple,nohref," +
            "noresize,noshade,nowrap,readonly,selected"
        );

        // Special Elements (can contain anything)
        var special = makeMap("script,style");

        var HTMLParser = function( html, handler ) {
            var index, chars, match, stack = [], last = html;
            stack.last = function(){
                return this[ this.length - 1 ];
            };

            while ( html ) {
                chars = true;

                // Make sure we're not in a script or style element
                if ( !stack.last() || !special[ stack.last() ] ) {

                    // Comment
                    if ( html.indexOf("<!--") == 0 ) {
                        index = html.indexOf("-->");

                        if ( index >= 0 ) {
                            if ( handler.comment )
                                handler.comment( html.substring( 4, index ) );
                            html = html.substring( index + 3 );
                            chars = false;
                        }

                    // end tag
                    } else if ( html.indexOf("</") == 0 ) {
                        match = html.match( endTag );

                        if ( match ) {
                            html = html.substring( match[0].length );
                            match[0].replace( endTag, parseEndTag );
                            chars = false;
                        }

                    // start tag
                    } else if ( html.indexOf("<") == 0 ) {
                        match = html.match( startTag );

                        if ( match ) {
                            html = html.substring( match[0].length );
                            match[0].replace( startTag, parseStartTag );
                            chars = false;
                        }
                    }

                    if ( chars ) {
                        index = html.indexOf("<");

                        var text = index < 0 ? html : html.substring(0, index);
                        html = index < 0 ? "" : html.substring(index);

                        if ( handler.chars )
                            handler.chars( text );
                    }

                } else {
                    html = html.replace(
                        new RegExp("(.*)<\/" + stack.last() + "[^>]*>"),
                        function(all, text){
                            text = text.replace(/<!--(.*?)-->/g, "$1")
                                .replace(/<!\[CDATA\[(.*?)]]>/g, "$1");

                            if ( handler.chars )
                                handler.chars( text );

                            return "";
                        }
                    );

                    parseEndTag( "", stack.last() );
                }

                if ( html == last )
                    throw "Parse Error: " + html;
                last = html;
            }

            // Clean up any remaining tags
            parseEndTag();

            function parseStartTag( tag, tagName, rest, unary ) {
                tagName = tagName.toLowerCase();

                if ( block[ tagName ] ) {
                    while ( stack.last() && inline[ stack.last() ] ) {
                        parseEndTag( "", stack.last() );
                    }
                }

                if ( closeSelf[ tagName ] && stack.last() == tagName ) {
                    parseEndTag( "", tagName );
                }

                unary = empty[ tagName ] || !!unary;

                if ( !unary )
                    stack.push( tagName );

                if ( handler.start ) {
                    var attrs = [];

                    rest.replace(attr, function(match, name) {
                        var value = arguments[2] ? arguments[2] :
                            arguments[3] ? arguments[3] :
                            arguments[4] ? arguments[4] :
                            fillAttrs[name] ? name : "";

                        attrs.push({
                            name: name,
                            value: value,
                            escaped: value.replace(/(^|[^\\])"/g, '$1\\\"') //"
                        });
                    });

                    if ( handler.start )
                        handler.start( tagName, attrs, unary );
                }
            }

            function parseEndTag( tag, tagName ) {
                // If no tag name is provided, clean shop
                if ( !tagName )
                    var pos = 0;

                // Find the closest opened tag of the same type
                else
                    for ( var pos = stack.length - 1; pos >= 0; pos-- )
                        if ( stack[ pos ] == tagName )
                            break;

                if ( pos >= 0 ) {
                    // Close all the open elements, up the stack
                    for ( var i = stack.length - 1; i >= pos; i-- )
                        if ( handler.end )
                            handler.end( stack[ i ] );

                    // Remove the open elements from the stack
                    stack.length = pos;
                }
            }
        };

        return HTMLParser;
    })();


    var html = {};


    html.tag        = function (el) { return el[0]; };
    html.attrs      = function (el) { return el[1]; };
    html.children   = function (el) { return el[2]; };

    function isString(x) {
        return toString.call(x) == '[object String]';
    }

    function isObject(x) {
        return x === Object(x);
    }

    var isArray = Array.isArray || function (x) {
        return toString.call(x) === '[object Array]';
    };

    html.attrPairs = function (obj) {
        var r = [];
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) {
                r.push([k, obj[k]]);
            }
        }
        return r;
    };

    html.stringifyAttr = function (k, v) {
        return html.escape(k) + '="' + html.escape(v) + '"';
    };

    html.stringifyAttrs = function (attrs) {
        var pairs = html.attrPairs(attrs);
        var r = [];
        for (var i = 0, len = pairs.length; i < len; i++) {
            r.push(html.stringifyAttr(pairs[i][0], pairs[i][1]));
        }
        return r.join(' ');
    };

    html.stringifyElement = function (el) {
        if (isString(el)) {
            return html.escape(el);
        }
        var tag = html.escape(el[0]),
            attrs = html.stringifyAttrs(el[1]),
            children = isArray(el[2]) ? el[2]: (el[2] && [el[2]] || []);

        var inner = '';
        for (var i = 0, len = children.length; i < len; i++) {
            inner += html.stringifyElement(children[i]);
        }
        return '<' + tag + ' ' + attrs + '>' + inner + '</' + tag + '>';
    };

    html.stringify = function (els) {
        if (els.length === 3 && isString(els[0]) && isObject(els[1])) {
            // single element, not an array
            return html.stringifyElement(els);
        }
        var str = '';
        for (var i = 0, len = els.length; i < len; i++) {
            str += html.stringifyElement(els[i]);
        }
        return str;
    };

    html.escape = function (s) {
        s = ('' + s); /* Coerce to string */
        s = s.replace(/&/g, '&amp;');
        s = s.replace(/</g, '&lt;');
        s = s.replace(/>/g, '&gt;');
        s = s.replace(/"/g, '&quot;');
        s = s.replace(/'/g, '&#39;');
        return s;
    };

    html.parse = function (str) {
        var results = [];
        var stack = [results];

        HTMLParser(str, {
            start: function( tag, attrs, unary ) {
                var a = {};
                for (var i = 0, len = attrs.length; i < len; i++) {
                    var attr = attrs[i];
                    a[attr.name] = attr.value;
                }
                var t = [tag, a, []];
                var curr = stack[0];
                curr.push(t);
                if (!unary) {
                    stack.unshift(t[2]);
                }
            },
            end: function( tag ) {
                stack.shift();
            },
            chars: function( text ) {
                var curr = stack[0];
                curr.push(text);
            },
            comment: function( text ) {
                //ignore comments
            }
        });
        return results;
    };

    return html;

}));
