/**
 * Resolve
 *
 * Return a global context upon which to install Highland globals. Takes a
 * default namespace to use if both the node global and browser window
 * namespace cannot be found.
 *
 * @param {object} defaultNamespace - Default namespace if global not found
 * @returns {object} Global namespace context
 */

function resolveGlobalNS (defaultNamespace) {
    // Use the nodejs global namespace
    if (typeof global !== 'undefined') {
        return global;
    }
    // Use the browser window namespace
    else if (typeof window !== 'undefined') {
        return window;
    }

    // If neither the global namespace or browser namespace is avaiable
    // return this module as the default context.
    return defaultNamespace;
}

module.exports = resolveGlobalNS();
