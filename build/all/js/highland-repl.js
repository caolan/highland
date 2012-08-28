Highland.install();

$(function () {
    var jqconsole = $('#console').jqconsole('', '> ', '... ');

    var globalEval = function globalEval(src, orig_error) {
        try {
            if (window.execScript) {
                return window.execScript(src);
            }
            var fn = function() {
                return window.eval.call(window,src);
            };
            return fn();
        }
        catch (e) {
            if (orig_error) {
                throw orig_error;
            }
            return globalEval('(' + src + ')', e);
        }
    };

    var runCommand = function (cmd) {
        if (cmd === 'clear') {
            jqconsole.Reset();
        }
    };

    var resultHandler = function (input) {
        var m = /^\s*:(\w+)\s*$/.exec(input);
        if (m) {
            runCommand(m[1]);
            return startPrompt();
        }
        var val;
        try {
            val = globalEval(input);
        }
        catch (e) {
            jqconsole.Write(e + '\n', 'jqconsole-error');
            // Restart the prompt.
            return startPrompt();
        }
        // Output input with the class jqconsole-output.
        jqconsole.Write(
                hljs.highlight('javascript', NodeInspect(val)).value + '\n',
                'jqconsole-output',
                false
                );
        // Restart the prompt.
        return startPrompt();
    };

    var multilineCheck = function (input) {
        if (/^\s*:(\w+)\s*$/.test(input)) { // is a command
            return false;
        }
        if (/\n$/.test(input)) { // ends with empty line
            return false;
        }
        try {
            globalEval(input);
        }
        catch (e) {
            return 0;
        }
        return false;
    };

    var startPrompt = function () {

        // Start the prompt with history enabled.
        jqconsole.Prompt(true, resultHandler, multilineCheck);
    };

    jqconsole.Write(
        'Type :help for more commands, ENTER to run line\n',
        'jqconsole-message'
    );
    startPrompt();
    jqconsole.SetPromptText('foldr1 (add, [1,2,3,4])');
});
