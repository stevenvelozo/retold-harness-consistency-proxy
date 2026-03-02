# ConsistencyProxy.stop()

## Signature

```javascript
tmpProxy.stop(fCallback)
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fCallback` | `function` | Yes | Callback invoked as `fCallback()` once the server has stopped |

## Callback

The callback receives no arguments. It is invoked after the HTTP server has been closed or immediately if no server is running.

## Description

Gracefully stops the consistency proxy HTTP server. If the server is currently running, it is closed and the callback is invoked once the close operation completes. If the server was never started (i.e., `_server` is `null`), the callback is invoked immediately.

A log message (`'Consistency proxy stopped.'`) is written via the Fable logger when the server successfully closes.

## Examples

### Basic shutdown

```javascript
tmpProxy.stop(
	() =>
	{
		console.log('Proxy has been stopped');
	});
```

### Graceful shutdown on SIGTERM

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
			process.exit(1);
		}

		console.log('Proxy is running');
	});

process.on('SIGTERM',
	() =>
	{
		tmpProxy.stop(
			() =>
			{
				process.exit(0);
			});
	});

process.on('SIGINT',
	() =>
	{
		tmpProxy.stop(
			() =>
			{
				process.exit(0);
			});
	});
```

### Safe stop when server was never started

```javascript
let tmpProxy = new ConsistencyProxy();

// stop() is safe to call even if start() was never called
tmpProxy.stop(
	() =>
	{
		console.log('Nothing to stop, callback still fires');
	});
```

## Notes

- The callback is always invoked exactly once, regardless of whether the server was running.
- After `stop()` completes, calling `start()` again on the same instance is not supported. Create a new `ConsistencyProxy` instance if you need to restart.
- In-flight requests that are already being processed may complete before the server fully closes, per standard Node.js `http.Server.close()` behavior.
