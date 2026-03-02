# ConsistencyProxy Constructor

## Signature

```javascript
new ConsistencyProxy(pOptions)
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `pOptions` | `object` | No | `{}` | Configuration options for the proxy |
| `pOptions.port` | `number` | No | `9090` | Port the proxy server listens on |
| `pOptions.backends` | `object` | No | `{}` | Map of provider keys to port numbers (e.g., `{ sqlite: 8086, mysql: 8087 }`) |
| `pOptions.discover` | `boolean` | No | `false` | When `true`, auto-discover running backends on default ports at startup |

## Returns

| Type | Description |
|------|-------------|
| `ConsistencyProxy` | A new proxy instance ready to be started |

## Description

Creates a new `ConsistencyProxy` instance. The constructor performs the following initialization:

1. Merges `pOptions` with defaults (`port: 9090`, `backends: {}`, `discover: false`).
2. Creates a Fable instance configured with `Product: 'RetoldHarnessConsistencyProxy'` and console-level logging at `'info'`.
3. Registers the `RequestFanout` service and instantiates a provider.
4. Registers the `ResponseComparator` service and instantiates a provider.
5. Sets the internal `_server` reference to `null`.

The constructor does not start the HTTP server or resolve backends. Call `start()` to begin accepting requests.

## Examples

### Minimal construction with defaults

```javascript
const ConsistencyProxy = require('retold-harness-consistency-proxy');

let tmpProxy = new ConsistencyProxy();
// Proxy configured on port 9090 with no backends and discovery disabled
```

### Explicit backends

```javascript
const ConsistencyProxy = require('retold-harness-consistency-proxy');

let tmpProxy = new ConsistencyProxy(
	{
		port: 9090,
		backends:
		{
			sqlite: 8086,
			mysql: 8087,
			postgresql: 8089
		}
	});
```

### Auto-discovery mode

```javascript
const ConsistencyProxy = require('retold-harness-consistency-proxy');

let tmpProxy = new ConsistencyProxy(
	{
		port: 7070,
		discover: true
	});
```

### Custom port only

```javascript
const ConsistencyProxy = require('retold-harness-consistency-proxy');

let tmpProxy = new ConsistencyProxy(
	{
		port: 3000
	});
```

## Notes

- The `backends` option takes precedence over `discover`. If `backends` contains entries, discovery is skipped during `start()`.
- The Fable instance is accessible internally as `this._fable` and provides logging and service management throughout the proxy lifecycle.
- The `RequestFanout` service is available on the Fable instance as `this._fable.RequestFanout`.
- The `ResponseComparator` service is available as `this._fable.ResponseComparator`.
