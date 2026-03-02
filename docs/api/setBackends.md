# RequestFanout.setBackends()

## Signature

```javascript
tmpFable.RequestFanout.setBackends(pBackends)
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pBackends` | `object` | Yes | Map of provider keys to port numbers (e.g., `{ sqlite: 8086, mysql: 8087 }`) |

## Returns

`undefined` -- This method does not return a value.

## Description

Replaces the internal backend map used by the `RequestFanout` service. Each key in the map is a provider name (such as `'sqlite'`, `'mysql'`, or `'mongodb'`) and each value is the port number where that provider's harness is listening on `127.0.0.1`.

If `pBackends` is `null` or `undefined`, the internal map is reset to an empty object `{}`.

This method is called automatically by `ConsistencyProxy.start()` after backend resolution. It can also be called directly for programmatic reconfiguration.

## Examples

### Setting backends programmatically

```javascript
const libFable = require('fable');
const libRequestFanout = require('./source/Service-RequestFanout.js');

let tmpFable = new libFable({ Product: 'Test' });
tmpFable.serviceManager.addServiceType('RequestFanout', libRequestFanout);
tmpFable.serviceManager.instantiateServiceProvider('RequestFanout');

tmpFable.RequestFanout.setBackends(
	{
		sqlite: 8086,
		mysql: 8087,
		postgresql: 8089
	});
```

### Clearing the backend map

```javascript
tmpFable.RequestFanout.setBackends(null);
// Equivalent to:
tmpFable.RequestFanout.setBackends({});
```

## Notes

- All backends are assumed to be listening on `127.0.0.1` (localhost). Remote hosts are not supported.
- The provider key is an arbitrary string label. By convention it matches the database provider name (e.g., `'sqlite'`, `'mysql'`, `'mssql'`, `'postgresql'`, `'mongodb'`, `'dgraph'`, `'solr'`).
- Calling `setBackends()` while a fan-out request is in progress does not affect the in-flight request. The new map takes effect on the next call to `fanout()`.
