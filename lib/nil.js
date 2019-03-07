var _global = require('./global');

/*
 * Resolve nil value from global namespace if it exists. This may happen when
 * there are multiple versions of highland (like npm).
 *
 * nil is only equal to itself:
 *
 * nil === {}  => false
 * nil === nil => true
 *
 * This property makes it valuable for determining a lack of input from a
 * falsey value such as nil or undefined. When a highland stream encounters
 * nil it knows for sure the intention is to end the stream.
 */

if (!_global.nil) {
    _global.nil = {};
}

module.exports = _global.nil;
