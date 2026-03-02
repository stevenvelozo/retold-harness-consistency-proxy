# Provider Discovery: discoverBackends()

## Signature

```javascript
const libProviderDiscovery = require('./source/Provider-Discovery.js');

libProviderDiscovery.discoverBackends(fCallback)
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fCallback` | `function` | Yes | Callback invoked as `fCallback(pBackends)` when all probes complete |

## Callback

| Parameter | Type | Description |
|-----------|------|-------------|
| `pBackends` | `object` | Map of `{ providerKey: port }` for every backend that responded successfully |

## Description

Auto-discovers running retold-harness backends by probing all seven default provider ports in parallel. Each port is probed using `probePort()`, which sends a `GET /1.0/Books/Count` request and checks for a `200` response.

### Discovery Process

1. Iterates over all entries in `DefaultProviderPortMap`.
2. Calls `probePort()` for each entry in parallel (all seven probes are dispatched simultaneously).
3. For each probe that returns `true`, the provider key and port are added to the result map.
4. Once all probes have completed (whether successful or not), the callback is invoked with the accumulated map.

### Default Ports Probed

| Provider | Port |
|----------|------|
| sqlite | 8086 |
| mysql | 8087 |
| mssql | 8088 |
| postgresql | 8089 |
| mongodb | 8090 |
| dgraph | 8091 |
| solr | 8092 |

### Timing

Since all probes run in parallel and each has a 2-second timeout, the maximum wall-clock time for discovery is approximately 2 seconds regardless of how many providers are checked.

## Examples

### Basic discovery

```javascript
const libProviderDiscovery = require('./source/Provider-Discovery.js');

libProviderDiscovery.discoverBackends(
	(pBackends) =>
	{
		let tmpKeys = Object.keys(pBackends);

		console.log(`Discovered ${tmpKeys.length} backend(s)`);

		for (let i = 0; i < tmpKeys.length; i++)
		{
			console.log(`  ${tmpKeys[i]} on port ${pBackends[tmpKeys[i]]}`);
		}
	});
```

### Using discovery results with the proxy

```javascript
const ConsistencyProxy = require('retold-harness-consistency-proxy');
const libProviderDiscovery = require('./source/Provider-Discovery.js');

libProviderDiscovery.discoverBackends(
	(pBackends) =>
	{
		let tmpCount = Object.keys(pBackends).length;

		if (tmpCount === 0)
		{
			console.error('No running backends found');
			return;
		}

		let tmpProxy = new ConsistencyProxy(
			{
				port: 9090,
				backends: pBackends
			});

		tmpProxy.start(
			(pError) =>
			{
				if (pError)
				{
					console.error(`Failed to start: ${pError}`);
					return;
				}

				console.log(`Proxy running with ${tmpCount} backend(s)`);
			});
	});
```

### When no backends are running

```javascript
libProviderDiscovery.discoverBackends(
	(pBackends) =>
	{
		if (Object.keys(pBackends).length === 0)
		{
			console.log('No harness instances detected on default ports');
		}
	});
```

## Notes

- Discovery is non-destructive. It only sends read-only GET requests to each port.
- The function always completes; it never returns an error. If no backends are running, the callback receives an empty object `{}`.
- The probe order is not guaranteed due to parallel execution, but the result map is stable (keyed by provider name).
- This function is called internally by `ConsistencyProxy.start()` when the `discover` option is `true` and no explicit backends are provided.
- Custom ports or providers not in `DefaultProviderPortMap` cannot be discovered. Use `parseBackendsArg()` or explicit backend configuration for non-standard setups.
