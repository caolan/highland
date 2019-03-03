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

// Instance Methods

ObservableSubscription.prototype.unsubscribe = function unsubscribe () {
    if (this.closed) {
        return;
    }
    this.closed = true;
    this.source.destroy();
    this.source = null;
};

module.exports = ObservableSubscription;
