/**
 * Return a global context upon which to install Highland globals. Takes a
 * default namespace to use if both the node global and browser window
 * namespace cannot be found.
 *
 * @returns {object} Global namespace context
 */

// Use the nodejs global namespace
if (typeof global !== 'undefined') {
    module.exports = global;
}
// Use the browser window namespace
else if (typeof window !== 'undefined') {
    module.exports = window;
}
// If neither the global namespace or browser namespace is avaiable
// Use this module as the default context
else {
    module.exports = this;
}

