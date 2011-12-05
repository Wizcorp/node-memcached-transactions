# Memcached Transactions

Memcached Transactions is a wrapper around
[node-memcached](https://github.com/3rd-Eden/node-memcached). It provides a
transactional environment for all-or-nothing writes, and smart caching of
previously received, written and deleted data.

## API

The API tries to follow node-memcached to the letter. The only differences
are:

### new MemcachedTransaction(memcachedClient, [options])

Where options is an optional object containing:

#### simulate (boolean)

If true does not write anything to the memcached server on commit, but instead
outputs all scheduled operations to console. This way operation bundling and
discarding can be inspected for correctness.

#### debug (boolean)

If true outputs every memcached operation to console.

### myTransaction.commit([cb])

Executes all scheduled write operations. On completion, the optional
callback `cb` is called.

### myTransaction.rollBack([cb])

Discards all scheduled write operations and calls the optional callback
`cb` on completion. This function is however not asynchronous, so the callback
may safely be omitted. It is simply provided as a convenient exit point that
is similar to the callback in the commit function.

## API: transactional node-memcached wrappers

The following wrapper functions are available. General rule is that write
functions are queued and merged for commit, and read functions only read
that what has not yet been retrieved or overwritten within this transaction.

### myTransaction.get(key, [cb])
### myTransaction.getMulti(keys, [cb])
### myTransaction.set(key, value, [ttl, cb])

Since writes are queued, the callback `cb` is provided only for compatibility.

### myTransaction.del(key, [cb])

Since writes are queued, the callback `cb` is provided only for compatibility.

### myTransaction.touch(key, [ttl, cb])

node-memcached currently does not yet implement a touch API, but Memcached
Transactions does. The touch function updates the TTL of a given key. If a
touch operation followed a set() operation, the two will be merged, and the key
that was being set, will receive the TTL that was given by the touch command.


## Example

``` javascript
var Memcached = require('memcached');
var MemcachedTransaction = require('memcached-transactions');

var client = new Memcached(['localhost:11211']);
var tr = new MemcachedTransaction(client);

tr.set('foo', 5);
tr.set('bar', 6);
tr.get('foo', function (error, value) {
	// value now contains 5, even though nothing has been written yet

	value++;
	tr.set('foo', value);

	tr.commit(function (error) {
		console.log('All done');

		tr.del('foo');
		tr.del('bar');
		tr.commit();
	});
});
```

## License

Memcached Transactions uses the MIT License.
