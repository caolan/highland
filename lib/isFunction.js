/**
 * Predicate function takes a value and returns true if it is a function.
 *
 * @id isFunction
 * @name isFunction(x)
 * @param {any} x - Any value to test against
 * @returns {bool} True if x is a function
 */

function isFunction (x) {
    return typeof x === 'function';
}

module.exports = isFunction;
