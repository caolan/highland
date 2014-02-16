module.exports = function (grunt) {

    // Project configuration.
    grunt.initConfig({

        pkg: grunt.file.readJSON('package.json'),

        jshint: {
            options: {
                jshintrc: '.jshintrc'
            },
            all: [
                'Gruntfile.js',
                'highland.js'
            ]
        },

        browserify: {
            all: {
                files: {
                    'dist/highland.js': ['lib/index.js']
                },
                options: {
                    standalone: 'highland'
                }
            }
        },

        nodeunit: {
            all: ['test.js']
        },

        watch: {
            all: {
                files: ['highland.js'],
                tasks: ['test', 'docs']
            }
        },

        'gh-pages': {
            options: {
                base: 'docs'
            },
            src: ['**']
        }

    });

    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-nodeunit');
    grunt.loadNpmTasks('grunt-browserify');
    grunt.loadNpmTasks('grunt-gh-pages');

    // custom tasks
    grunt.loadTasks('./tasks');

    grunt.registerTask('test', ['jshint:all', 'nodeunit:all']);
    grunt.registerTask('default', ['docs']);

};
