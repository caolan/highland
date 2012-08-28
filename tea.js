exports.tasks = {
    'comments': './tasks/comments'
};

exports.builds = {
    docs: {
        'handlebars-load': {paths: ['website/index.html']},
        'comments': null
    },
    website: ['@docs', {
        'include': {paths: {
            'website/js': 'js',
            'website/img': 'img',
            'website/css': 'css',
            'highland.js': 'js/highland.js'
        }}
    }],
    all: ['website']
};
