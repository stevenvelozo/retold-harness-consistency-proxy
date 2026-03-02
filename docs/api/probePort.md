# Provider Discovery: probePort()

## Signature

```javascript
const libProviderDiscovery = require('./source/Provider-Discovery.js');

libProviderDiscovery.probePort(pPort, fCallback)
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pPort` | `number` | Yes | The port number to probe on `127.0.0.1` |
| `fCallback` | `function` | Yes | Callback invoked as `fCallback(pIsLive)` |

## Callback

| Parameter | Type | Description |
|-----------|------|-------------|
| `pIsLive` | `boolean` | `true` if a harness is listening and responding on the port, `false` otherwise |

## Description

Probes a single port to determine whether a retold-harness backend is running and responsive. The probe sends an HTTP `GET` request to `http://127.0.0.1:<port>/1.0/Books/Count` and evaluates the response.

### Probe Logic

1. An HTTP GET request is sent to `127.0.0.1` on the specified port, targeting the path `/1.0/Books/Count`.
2. The request has a **2-second timeout**.
3. If the response status code is exactly `200`, the callback receives `true`.
4. If the response status code is anything other than `200`, the callback receives `false`.
5. If the request errors (connection refused, network error), the callback receives `false`.
6. If the request times out, the connection is destroyed and the callback receives `false`.

The response body is consumed (via `pResponse.resume()`) but not inspected. Only the status code matters.

## Examples

### Probing a single port

```javascript
const libProviderDiscovery = require('./source/Provider-Discovery.js');

libProviderDiscovery.probePort(8086,
	(pIsLive) =>
	{
		if (pIsLive)
		{
			console.log('SQLite harness is running on port 8086');
		}
		else
		{
			console.log('No harness found on port 8086');
		}
	});
```

### Probing multiple ports sequentially

```javascript
const libProviderDiscovery = require('./source/Provider-Discovery.js');

let tmpPorts = [8086, 8087, 8088];
let tmpIndex = 0;

function probeNext()
{
	if (tmpIndex >= tmpPorts.length)
	{
		console.log('Done probing');
		return;
	}

	let tmpPort = tmpPorts[tmpIndex];
	tmpIndex++;

	libProviderDiscovery.probePort(tmpPort,
		(pIsLive) =>
		{
			console.log(`Port ${tmpPort}: ${pIsLive ? 'live' : 'down'}`);
			probeNext();
		});
}

probeNext();
```

## Notes

- The probe endpoint `/1.0/Books/Count` is the standard Meadow count endpoint for the `Books` entity, which is expected to be available in all retold-harness test configurations.
- The 2-second timeout is hardcoded and not configurable.
- Only `127.0.0.1` (localhost) is probed. Remote hosts are not supported.
- The function is used internally by `discoverBackends()` to check all seven default provider ports in parallel.
- A non-200 status code (e.g., 404, 500) is treated as "not live" even though the server may be running. This ensures only fully operational harness instances are detected.
