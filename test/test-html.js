var html = require('../lib/html');


exports['tag'] = function (test) {
    test.equal(html.tag(['li', {}, []]), 'li');
    test.equal(html.tag(['div']), 'div');
    test.done();
};

exports['attrs'] = function (test) {
    test.same(html.attrs(['li', {'class':'product'}, []]), {'class':'product'});
    test.same(html.attrs(['span', {'class':'name'}, []]), {'class':'name'});
    test.done();
};

exports['children'] = function (test) {
    var li = ['li', {'class': 'product'}, [
        ['span', {'class': 'name'}, 'foo'],
        ['span', {'class': 'price'}, '1.00']
    ]];
    test.same(html.children(li), li[2]);
    test.done();
};

exports['stringifyAttrs'] = function (test) {
    var a = {'class': 'product', id: 'someproduct'};
    test.equal(html.stringifyAttrs(a), 'class="product" id="someproduct"');
    var b = {'class': 'product" onclick="foo', id: 'someproduct'};
    test.equal(
        html.stringifyAttrs(b),
        'class="product&quot; onclick=&quot;foo" id="someproduct"'
    );
    test.done();
};

exports['stringify'] = function (test) {
    var li = ['li', {'class': 'product'}, [
        ['span', {'class': 'name'}, 'foo'],
        ['span', {'class': 'price'}, '1.00']
    ]];
    var str = html.stringify([li]);
    test.equal(str,
        '<li class="product">' +
            '<span class="name">foo</span>' +
            '<span class="price">1.00</span>' +
        '</li>');
    var div = ['div', {'class': 'foo'}, ["<script>alert('hi');</script>"]];
    test.equal(
        html.stringify([div]),
        '<div class="foo">' +
            '&lt;script&gt;alert(&#39;hi&#39;);&lt;/script&gt;' +
        '</div>'
    );
    // test single element detection
    test.equal(html.stringify([div]), html.stringify(div));
    test.done();
};

exports['parse'] = function (test) {
    test.same(
        html.parse('<h1>Hello</h1>'),
        [ ['h1', {}, ['Hello']] ]
    );
    test.same(
        html.parse(
            '<li class="product">' +
                '<span class="name">Foo</span>' +
                '<span class="price">$1.00</span>' +
            '</li>'
        ),
        [
            ['li', {'class': 'product'}, [
                ['span', {'class': 'name'}, ['Foo']],
                ['span', {'class': 'price'}, ['$1.00']]
            ]]
        ]
    );
    test.same(
        html.parse(
            '<div id="foo" rel="bar">Some <b>important</b> text</div><br>'
        ),
        [
            ['div', {'id': 'foo', 'rel': 'bar'}, [
                'Some ',
                ['b', {}, ['important']],
                ' text'
            ]],
            ['br', {}, []]
        ]
    );
    test.done();
};
