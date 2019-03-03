/**
 * Observable Subscription
 * An implementation of the TC39 Subscription object
 * https://tc39.github.io/proposal-observable/#subscription-objects
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

ObservableSubscription.create = function create (source) {
    return new ObservableSubscription(source);
};

ObservableSubscription.cleanup = function cleanup (subscription) {
    if (subscription.closed) {
        return;
    }
    subscription.source.destroy();
    subscription.source = null;
    subscription.closed = true;
};

// Instance Methods

ObservableSubscription.prototype.unsubscribe = function unsubscribe () {
    ObservableSubscription.cleanup(this);
};

module.exports = ObservableSubscription;
