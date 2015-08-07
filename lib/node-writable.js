var Writable = require('stream').Writable,
    inherits = require('util').inherits;

function HighlandNodeWritable(stream) {
    Writable.call(this, {
        objectMode: true,
        decodeStrings: false
    });

    this._stream = stream;
    this.on('finish', stream.end.bind(stream));
}

inherits(HighlandNodeWritable, Writable);

HighlandNodeWritable.prototype._write = function _write(chunk, encoding, cb) {
    this._stream.write(chunk, encoding, cb);
};

module.exports = HighlandNodeWritable;
