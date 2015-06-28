function Queue() {
    this._in = [];
    this._out = [];
    this.length = 0;
}

/*
 * Enqueue all elements of a list in order. Equivalent to
 *   list.forEach(queue.enqueue.bind(queue));
 */
Queue.prototype.enqueueAll = function enqueueList(list) {
    this._in = this._in.concat(list);
    this.length += list.length;
};

Queue.prototype.enqueue = function enqueue(item) {
    this._in.push(item);
    this.length++;
};

Queue.prototype.dequeue = function dequeue() {
    if (this._out.length) {
        this.length--;
        return this._out.pop();
    }
    else if (this._in.length) {
        this._out = this._in.reverse();
        this._in = [];
        this.length--;
        return this._out.pop();
    }
    else {
        return undefined;
    }
};

Queue.prototype.clear = function clear() {
    this._out = [];
    this._in = [];
    this.length = 0;
};

Queue.prototype.toArray = function toArray() {
    var res = [];
    res = res.concat(this._out);
    res.reverse();
    res = res.concat(this._in);
    return res;
};

Queue.prototype.toString = function toString() {
    return this.toArray().toString();
};

module.exports = Queue;
