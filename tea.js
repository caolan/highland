exports.tasks = {
    'comments': './tasks/comments'
};

exports.builds = {
    docs: {
        'handlebars-load': {path: ['website/index.html']},
        'comments': null
    },
    website: ['@docs', {
        'include': {paths: {
            'js': 'website/js',
            'img': 'website/img',
            'css': 'website/css',
            'js/highland.js': 'highland.js'
        }}
    }],
    all: ['website']
};
