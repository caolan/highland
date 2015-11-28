var hasOwn = Object.prototype.hasOwnProperty;

/**
 * A very simple polyfill for Map with limited functionality
 * that only works for integer keys.
 */
function IntMap() {
    this.map = {};
    this.size = 0;
}

IntMap.prototype.set = function set(key, value) {
    if (this.has(key)) {
        this.map[key] = value;
    }
    else {
        this.map[key] = value;
        this.size++;
    }
    return this;
};

IntMap.prototype.get = function get(key) {
    return this.map[key];
};

IntMap.prototype.delete = function intMapDelete(key) {
    var deleted = this.has(key);
    if (deleted) {
        delete this.map[key];
        this.size--;
    }
    return deleted;
};

IntMap.prototype.has = function has(key) {
    return hasOwn.call(this.map, key);
};

IntMap.prototype.forEach = function forEach(f, thisArg) {
    for (var key in this.map) {
        f.call(thisArg, this.map[key], key, this);
    }
};

if (global.Map === void 0) {
    module.exports = IntMap;
}
else {
    module.exports = global.Map;
}
