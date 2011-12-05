var async = require('async');


// MemcachedTransaction: a wrapper around 3rdEden's node-memcached module to provide transactional behavior.

// currently supported mutations: 'set', 'del', 'touch'

function MemcachedTransaction(client, options) {
	this.queue = {};    // { key: operation }  operation to be executed per key
	this.cache = {};    // guaranteed to be the latest version of a value, if it's in here
	this.client = client;
	this.options = options || {};

	this.debug = null;

	if (this.options.debug) {
		if (this.options.debug === true) {
			this.debug = console.info;
		} else if (typeof this.options.debug === 'function') {
			this.debug = this.options.debug;
		}
	}
}


module.exports = MemcachedTransaction;


MemcachedTransaction.prototype.get = function (key, cb) {
	var cache = this.cache;

	var op = this.queue[key];
	if (op && op.type === 'del') {
		// deleted
		if (cb) {
			cb(null, undefined);	// return undefined
		}
		return;
	}

	var value = cache[key];

	if (value !== undefined) {
		if (cb) {
			cb(null, value);
		}
		return;
	}

	if (this.debug) {
		this.debug('MemcachedTransaction: getting key', key);
	}

	this.client.get(key, function (error, value) {
		if (error) {
			if (cb) {
				cb(error);
			}
		} else {
			cache[key] = value;

			if (cb) {
				cb(null, value);
			}
		}
	});
};


MemcachedTransaction.prototype.getMulti = function (keys, cb) {
	var cache = this.cache;
	var value, result = {};
	var lookup = [];

	for (var key in keys) {
		var op = this.queue[key];
		if (op && op.type === 'del') {
			result[key] = undefined;
		} else {
			value = cache[key];

			if (value === undefined) {
				lookup.push(key);
			} else {
				result[key] = value;
			}
		}
	}

	if (lookup.length === 0) {
		if (cb) {
			cb(null, result);
		}
		return;
	}

	if (this.debug) {
		this.debug('MemcachedTransaction: getting keys', lookup);
	}

	this.client.getMulti(lookup, function (error, values) {
		if (error) {
			return cb(error);
		}

		for (var key in values) {
			var value = values[key];

			result[key] = value;
			cache[key] = value;
		}

		if (cb) {
			cb(null, result);
		}
	});
};


MemcachedTransaction.prototype.set = function (key, value, ttl, cb) {
	this.queue[key] = { type: 'set', key: key, value: value, ttl: ttl };
	this.cache[key] = value;

	if (cb) {
		cb();
	}
};


MemcachedTransaction.prototype.del = function (key, cb) {
	this.queue[key] = { type: 'del', key: key };
	delete this.cache[key];

	if (cb) {
		cb();
	}
};


MemcachedTransaction.prototype.touch = function (key, ttl, cb) {
	var op = this.queue[key];

	if (op) {
		switch (op.type) {
		case 'set':
			op.ttl = ttl;
			break;
		case 'del':
			// noop
			break;
		}
	} else {
		this.queue[key] = { type: 'touch', key: key, ttl: ttl };
	}

	if (cb) {
		cb();
	}
};


MemcachedTransaction.prototype._exec = function (op, cb) {
	if (this.options.simulate) {
		console.info('Executing', op);
		cb();
		return;
	}

	switch (op.type) {
	case 'set':
		if (this.debug) {
			this.debug('MemcachedTransaction: setting key', op.key, 'to value', op.value, 'with TTL', op.ttl || 0);
		}

		this.client.set(op.key, op.value, op.ttl || 0, cb);
		break;
	case 'del':
		if (this.debug) {
			this.debug('MemcachedTransaction: deleting key', op.key);
		}

		this.client.del(op.key, cb);
		break;
	case 'touch':
		if (this.debug) {
			this.debug('MemcachedTransaction: touching key', op.key, 'with TTL', op.ttl || 0);
		}

		this.client.command(function touch(noreply) {
			return {
				command: ['touch', op.key, op.ttl || 0].join(' '),
				key: op.key,
				type: 'touch',
				callback: cb
			};
		});
		break;
	default:
		if (cb) {
			cb('Unknown operation type: ' + op.type);
		}
		break;
	}
};


MemcachedTransaction.prototype.commit = function (cb) {
	var ops = [];
	for (var key in this.queue) {
		ops.push(this.queue[key]);
	}

	var len = ops.length;

	// hot code paths: length 0 and 1

	if (len === 0) {
		return cb ? cb() : null;
	}

	if (len === 1) {
		return this._exec(ops[0], cb);
	}

	// more than 1 operation

	var that = this;

	async.forEach(
		ops,
		function (op, callback) {
			that._exec(op, callback);
		},
		function (error) {
			if (cb) {
				cb(error)
			}
		}
	);
};


MemcachedTransaction.prototype.rollBack = function (cb) {
	this.queue = {};
	this.cache = {};
};
