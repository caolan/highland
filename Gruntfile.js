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
        },
        'npm-publish': {
            options: {
                // list of tasks that are required before publishing
                requires: [],
                // if the workspace is dirty, abort publishing
                // (to avoid publishing local changes)
                abortIfDirty: true,
            }
        }

    });

    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-nodeunit');
    grunt.loadNpmTasks('grunt-browserify');
    grunt.loadNpmTasks('grunt-gh-pages');
    grunt.loadNpmTasks('grunt-bump');
    grunt.loadNpmTasks('grunt-npm');

    // custom tasks
    grunt.loadTasks('./tasks');

    grunt.registerTask('release:patch', [
        'test',
        'build',
        'bump:patch',
        'npm-publish',
        'gh-pages'
    ]);
    grunt.registerTask('release:minor', [
        'test',
        'build',
        'bump:minor',
        'npm-publish',
        'gh-pages'
    ]);
    grunt.registerTask('release:major', [
        'test',
        'build',
        'bump:major',
        'npm-publish',
        'gh-pages'
    ]);

    grunt.registerTask('test', ['jshint:all', 'nodeunit:all']);
    grunt.registerTask('build', ['browserify:main', 'docs']);
    grunt.registerTask('default', ['build']);

};
