# ConsistencyProxy.start()

## Signature

```javascript
tmpProxy.start(fCallback)
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fCallback` | `function` | Yes | Callback invoked as `fCallback(pError)` when the server is listening or an error occurs |

## Callback

| Parameter | Type | Description |
|-----------|------|-------------|
| `pError` | `string\|null` | Error message if startup failed, or `null` on success |

## Description

Starts the consistency proxy server. The method performs the following steps in order:

1. **Resolve backends** -- If `options.backends` was provided with entries, those are used directly. If `options.discover` is `true` (and no explicit backends exist), the proxy probes the default port range to find running harness instances.
2. **Validate backends** -- If no backends are available after resolution, the callback receives `'No backends available'` and the server does not start.
3. **Configure fan-out** -- Passes the resolved backend map to the `RequestFanout` service via `setBackends()`.
4. **Create HTTP server** -- Creates a Node.js `http.createServer` instance. Every incoming request is routed to the internal `_handleRequest` method.
5. **Listen** -- Binds to `options.port`. Once the server is listening, the callback is invoked with `null`.
6. **Register error handler** -- Server-level errors are logged via the Fable logger.

### Request Handling Flow

Once started, every incoming HTTP request is processed as follows:

1. The request body is collected from the stream.
2. `RequestFanout.fanout()` sends the request to all backends in parallel.
3. `ResponseComparator.compare()` analyzes the collected responses.
4. A JSON envelope is built containing the request metadata, consistency status, per-provider results, differences, and summary.
5. The envelope is written to the response with status `200` and `Content-Type: application/json`.
6. If the fan-out itself returns an error, a `502` response is sent with the error details.

## Examples

### Basic startup

```javascript
const ConsistencyProxy = require('retold-harness-consistency-proxy');

let tmpProxy = new ConsistencyProxy(
	{
		port: 9090,
		backends: { sqlite: 8086, mysql: 8087 }
	});

tmpProxy.start(
	(pError) =>
	{
		if (pError)
		{
			console.error(`Startup failed: ${pError}`);
			return;
		}

		console.log('Proxy is listening on port 9090');
	});
```

### Startup with discovery

```javascript
const ConsistencyProxy = require('retold-harness-consistency-proxy');

let tmpProxy = new ConsistencyProxy(
	{
		port: 9090,
		discover: true
	});

tmpProxy.start(
	(pError) =>
	{
		if (pError)
		{
			console.error(`Startup failed: ${pError}`);
			return;
		}

		console.log('Proxy is listening with discovered backends');
	});
```

### Handling the no-backends error

```javascript
let tmpProxy = new ConsistencyProxy(
	{
		port: 9090,
		backends: {}
	});

tmpProxy.start(
	(pError) =>
	{
		if (pError)
		{
			// pError === 'No backends available'
			console.error(`Cannot start without backends: ${pError}`);
		}
	});
```

## Notes

- The callback is invoked exactly once: either with an error string or with `null` on success.
- The HTTP server is stored internally as `this._server` for later use by `stop()`.
- The response envelope is formatted with tab indentation via `JSON.stringify(tmpEnvelope, null, '\t')`.
- When fan-out fails (e.g., no backends configured), the proxy responds with HTTP `502` and a JSON body containing the error and original request details.
- Server-level errors (e.g., `EADDRINUSE`) are logged but do not invoke the callback a second time.
