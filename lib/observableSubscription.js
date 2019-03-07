var nil = require('./nil');

/**
 * An implementation of the TC39 Subscription object
 * https://tc39.github.io/proposal-observable/#subscription-objects
 *
 * This class is intended for internal use only.
 *
 * Constructor takes a source highland stream, and an observer object with
 * an optional next, error, and complete methods.
 *
 * Returns a subscription object with a closed boolean and unsubscribe
 * method.
 *
 * @id ObservableSubscription
 * @name ObservableSubscription
 * @param {stream} stream - Highland stream to subscribe to
 * @param {object} observer - Observer to publish from stream subscription
 * @api private
 */
function ObservableSubscription (stream, observer) {
    var self = this;

    // Set attributes
    this._source = stream.fork();
    this.closed = false;

    // Don't let users subscribe to an already completed stream
    if (stream.ended) {
        if (observer.error) {
            observer.error(new Error('Subscribe called on an already completed stream.'));
        }

        this._cleanup();

        return;
    }

    // Consume the stream and emit data to the observer
    this._source = this._source.consume(function (err, x, push, next) {
        if (err) {
            push(null, nil);
            if (observer.error) {
                observer.error(err);
            }
            self._cleanup();
        }
        else if (x === nil) {
            if (observer.complete) {
                observer.complete();
            }
            self._cleanup();
        }
        else {
            if (observer.next) {
                observer.next(x);
            }
            next();
        }
    });

    this._source.resume();
}

// Instance Methods

/**
 * Perform cleanup routine on a subscription. This can only be called once per
 * subscription. Once its closed the subscription cannot be cleaned up again.
 *
 * Note: This relies heavily upon side-effects and mutates itself.
 *
 * @id ObservableSubscription.prototype._cleanup(subscription)
 * @name ObservableSubscription.prototype._cleanup
 * @returns {undefined} Side-effectful function cleans up subscription
 * @api private
 */

ObservableSubscription.prototype._cleanup = function cleanup () {
    // Don't want to destroy\cleanup an already closed stream
    if (this.closed) {
        return;
    }
    this._source = null;
    this.closed = true;
};

/**
 * Destroy the stream resources and cleanup the subscription.
 * @id ObservableSubscription.prototype.unsubscribe()
 * @name ObservableSubscription.prototype.unsubscribe()
 * @returns {undefined} Side-effectful. Destroys stream and cleans up subscription.
 * @api private
 */

ObservableSubscription.prototype.unsubscribe = function unsubscribe () {
    // Don't want to destroy\cleanup an already closed stream
    if (this.closed) {
        return;
    }

    this._source.destroy();
    this._cleanup();
};

module.exports = ObservableSubscription;
