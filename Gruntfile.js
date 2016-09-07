module.exports = function (grunt) {

    // Project configuration.
    grunt.initConfig({

        pkg: grunt.file.readJSON('package.json'),

        eslint: {
            options: {
                config: '.eslintrc'
            },
            all: [
                'Gruntfile.js',
                'lib/**/*.js',
                'test/test.js'
            ]
        },

        browserify: {
            main: {
                files: {
                    'dist/highland.js': ['lib/index.js']
                },
                options: {
                    browserifyOptions: {
                        standalone: 'highland'
                    }
                }
            },
            'test-browser': {
                files: {
                    'test/bundle.js': ['test/browser.js']
                },
                options: {
                    exclude: 'lib/**'
                }
            }
        },

        uglify: {
            main: {
                files: {
                    'dist/highland.min.js': ['dist/highland.js']
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
                files: ['package.json'],
                updateConfigs: ['pkg'],
                push: false,
                pushTo: 'origin',
                commit: true,
                commitMessage: 'Release %VERSION%',
                commitFiles: ['package.json', 'dist/highland.js', 'dist/highland.min.js', 'docs/index.html'],
                prereleaseName: 'beta',
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
                abortIfDirty: true
            }
        }

    });

    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-eslint');
    grunt.loadNpmTasks('grunt-contrib-nodeunit');
    grunt.loadNpmTasks('grunt-browserify');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-gh-pages');
    grunt.loadNpmTasks('grunt-bump');
    grunt.loadNpmTasks('grunt-npm');

    // custom tasks
    grunt.loadTasks('./tasks');

    grunt.registerTask('pre-release:patch', [
        'test',
        'bump-only:patch',
        'build',
        'bump-commit'
    ]);

    grunt.registerTask('pre-release:minor', [
        'test',
        'bump-only:minor',
        'build',
        'bump-commit'
    ]);

    grunt.registerTask('pre-release:major', [
        'test',
        'bump-only:major',
        'build',
        'bump-commit'
    ]);

    grunt.registerTask('release:patch', [
        'pre-release:patch',
        'npm-publish',
        'gh-pages'
    ]);

    grunt.registerTask('release:minor', [
        'pre-release:minor',
        'npm-publish',
        'gh-pages'
    ]);

    grunt.registerTask('release:major', [
        'pre-release:major',
        'npm-publish',
        'gh-pages'
    ]);

    grunt.registerTask('build-browser-tests', ['build', 'browserify:test-browser']);
    grunt.registerTask('test', ['eslint:all', 'nodeunit:all']);
    grunt.registerTask('build', ['browserify:main', 'uglify:main', 'docs']);
    grunt.registerTask('default', ['build']);

};
