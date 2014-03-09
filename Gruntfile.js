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
                'lib/**/*.js'
            ]
        },

        browserify: {
            main: {
                files: {
                    'dist/highland.js': ['lib/index.js']
                },
                options: {
                    standalone: 'highland'
                }
            },
            'test-browser': {
                files: {
                    'test/bundle.js': ['test/browser.js']
                }
            }
        },

        nodeunit: {
            all: ['test/test.js']
        },

        watch: {
            all: {
                files: ['lib/index.js'],
                tasks: ['test']
            }
        },

        'gh-pages': {
            options: {
                base: 'docs'
            },
            src: ['**']
        },

        bump: {
            versions: {
                options: {
                    files: ['package.json', 'bower.json'],
                    updateConfigs: ['pkg'],
                    pushTo: 'origin',
                    commit: true,
                    commitMessage: 'Release %VERSION%',
                    commitFiles: ['package.json', 'bower.json'],
                    createTag: true,
                    tagName: '%VERSION%',
                    tagMessage: 'Version %VERSION%'
                }
            }
        }

    });

    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-nodeunit');
    grunt.loadNpmTasks('grunt-browserify');
    grunt.loadNpmTasks('grunt-gh-pages');
    grunt.loadNpmTasks('grunt-bump');

    // custom tasks
    grunt.loadTasks('./tasks');

    grunt.registerTask('test', ['jshint:all', 'nodeunit:all']);
    grunt.registerTask('default', ['browserify:main', 'docs']);

};
