var inherits = require('util').inherits;
var Readable = require('stream').Readable;

function ReadableProxy(stream, options, nil) {
    Readable.call(this, options);

    this._source = stream;
    this._is_reading = false;
    this._nil = nil;
}

inherits(ReadableProxy, Readable);

ReadableProxy.prototype._readOnce = function () {
    if (this._is_reading) {
        return;
    }

    var self = this;

    self._is_reading = true;
    self._source.pull(function (err, x) {
        self._is_reading = false;
        if (err) {
            self.emit('error', err);
            self._readOnce();
        }
        else if (x === self._nil) {
            self.push(null);
        }
        else {
            if (self.push(x)) {
                self._readOnce();
            }
        }
    });
};

ReadableProxy.prototype._read = function (ignore) {
    this._readOnce();
};

module.exports = ReadableProxy;
