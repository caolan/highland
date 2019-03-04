/**
 * Observable Subscription
 * An implementation of the TC39 Subscription object
 * https://tc39.github.io/proposal-observable/#subscription-objects
 *
 * This class is intended for internal use only.
 *
 * @id ObservableSubscription
 * @name ObservableSubscription
 * @param {stream} source - Highland stream to subscribe to
 * arguments to the callback. Only valid if `source` is a String.
 * @api private
 */
function ObservableSubscription (source) {
    this._source = source;
    this.closed = false;
}

// Instance Methods

/**
 * Cleanup
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
 * Unsubscribe
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
