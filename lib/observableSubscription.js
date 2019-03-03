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
    this.source = source;
    this.closed = false;
}

// Static Methods

/**
 * Create
 * Return an instance of an ObservableSubscription class
 *
 * @id ObservableSubscription.create(source)
 * @name ObservableSubscription.create
 * @param {stream} [source] - Optional highland stream source
 * @returns {ObservableSubscription} A subscription that can be unsubscribed
 * @api private
 */

ObservableSubscription.create = function create (source) {
    return new ObservableSubscription(source);
};

/**
 * Cleanup
 * Perform cleanup routine on a subscription. This can only be called once per
 * subscription. Once its closed the subscription cannot be cleaned up again.
 *
 * Note: This relies heavily upon side-effects and mutates the subscription.
 *
 * @id ObservableSubscription.cleanup(subscription)
 * @name ObservableSubscription.cleanup
 * @param {ObservableSubscription} subscription - Subscription to cleanup
 * @returns {undefined} Side-effectful function cleans up subscription
 * @api private
 */

ObservableSubscription.cleanup = function cleanup (subscription) {
    if (subscription.closed) {
        return;
    }
    subscription.source = null;
    subscription.closed = true;
};

// Instance Methods

/**
 * Unsubscribe
 * Destroy the stream resources and cleanup the subscription.
 * @id ObservableSubscription.prototype.unsubscribe()
 * @name ObservableSubscription.prototype.unsubscribe()
 * @returns {undefined} Side-effectful. Destroys stream and cleans up subscription.
 * @api private
 */

ObservableSubscription.prototype.unsubscribe = function unsubscribe () {
    this.source.destroy();
    ObservableSubscription.cleanup(this);
};

module.exports = ObservableSubscription;
