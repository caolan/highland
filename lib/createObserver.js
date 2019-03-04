var isFunction = require('./isFunction');

/**
 * Coerce observer callbacks into observer object or return observer object
 * if already created. Will throw an error if both an object and callback args
 * are provided.
 *
 * @id createObserver
 * @param {function|object} onNext Function to receive new values or observer
 * @param {function} [onError] Optional callback to receive errors.
 * @param {function} [onComplete] Optional callback when stream completes
 * @return {object} Observer object with next, error, and complete methods
 * @private
 *
 * createObserver(
 *     function (x) { console.log(x); },
 *     function (err) { console.error(err); },
 *     function () { console.log('done'); }
 * )
 *
 * createObserver(
 *     null,
 *     null,
 *     function () { console.log('done'); }
 * )
 *
 * createObserver({
 *     next: function (x) { console.log(x); },
 *     error: function (err) { console.error(err); },
 *     complete: function () { console.log('done'); }
 * })
 */
function createObserver (onNext, onError, onComplete) {
    var isObserver = onNext && !isFunction(onNext) && typeof onNext === 'object';

    // ensure if we have an observer that we don't also have callbacks. Users
    // must choose one.
    if (isObserver && (onError || onComplete)) {
        throw new Error('Subscribe requires either an observer object or optional callbacks.');
    }

    // onNext is actually an observer
    if (isObserver) {
        return onNext;
    }

    // Otherwise create an observer object
    return {
        next: onNext,
        error: onError,
        complete: onComplete,
    };
}

module.exports = createObserver;
