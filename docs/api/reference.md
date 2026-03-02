# API Reference

`retold-harness-consistency-proxy` provides a splitter HTTP proxy that forwards every incoming request to multiple retold-harness backends in parallel, compares their responses, and returns a JSON envelope showing agreement or differences.

## ConsistencyProxy

The main proxy class. Creates a Fable instance, registers the `RequestFanout` and `ResponseComparator` services, and manages the HTTP server lifecycle.

**Source:** `source/Retold-Harness-Consistency-Proxy.js`

| Method | Signature | Description |
|--------|-----------|-------------|
| [constructor](constructor.md) | `new ConsistencyProxy(pOptions)` | Create a proxy instance with port, backend map, and discovery settings |
| [start](start.md) | `start(fCallback)` | Resolve backends, create the HTTP server, and begin listening |
| [stop](stop.md) | `stop(fCallback)` | Close the HTTP server and stop accepting requests |

## RequestFanout

Fable service that sends an identical HTTP request to multiple harness backends in parallel and collects all responses with timing data.

**Source:** `source/Service-RequestFanout.js`
**Extends:** `fable-serviceproviderbase`
**Service Type:** `'RequestFanout'`

| Method | Signature | Description |
|--------|-----------|-------------|
| [setBackends](setBackends.md) | `setBackends(pBackends)` | Configure the backend provider-to-port map |
| [getBackends](getBackends.md) | `getBackends()` | Retrieve the current backend map |
| [fanout](fanout.md) | `fanout(pMethod, pPath, pHeaders, pBody, fCallback)` | Fan out one HTTP request to all backends and collect results |

## ResponseComparator

Fable service that normalizes and diffs responses from multiple harness backends. Strips auto-generated fields (IDs, GUIDs, timestamps) before comparison so that only business-relevant data is evaluated.

**Source:** `source/Service-ResponseComparator.js`
**Extends:** `fable-serviceproviderbase`
**Service Type:** `'ResponseComparator'`

| Method | Signature | Description |
|--------|-----------|-------------|
| [compare](compare.md) | `compare(pResults)` | Compare responses from multiple providers and produce a consistency report |

## Provider Discovery

Standalone functions for discovering running retold-harness backends, either from explicit CLI arguments or by auto-probing a port range.

**Source:** `source/Provider-Discovery.js`

| Export | Signature | Description |
|--------|-----------|-------------|
| [parseBackendsArg](parseBackendsArg.md) | `parseBackendsArg(pBackendsArg)` | Parse a `"key:port,key:port"` string into a backends map |
| [probePort](probePort.md) | `probePort(pPort, fCallback)` | Check whether a harness is listening on a given port |
| [discoverBackends](discoverBackends.md) | `discoverBackends(fCallback)` | Auto-discover all running backends on default ports |
| [parseArgv](parseArgv.md) | `parseArgv()` | Parse `process.argv` for `--backends`, `--discover`, and `--port` flags |
| [DefaultProviderPortMap](DefaultProviderPortMap.md) | `DefaultProviderPortMap` | Constant map of provider names to their default port numbers |

## Quick Start

```javascript
const ConsistencyProxy = require('retold-harness-consistency-proxy');

// Explicit backends
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

tmpProxy.start(
	(pError) =>
	{
		if (pError)
		{
			console.error(`Failed to start: ${pError}`);
			return;
		}

		console.log('Consistency proxy is running on port 9090');
	});
```

```javascript
// Auto-discover running backends
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
			console.error(`Failed to start: ${pError}`);
			return;
		}

		console.log('Consistency proxy is running');
	});
```

### CLI Usage

```bash
# Explicit backends
node source/Retold-Harness-Consistency-Proxy.js --backends sqlite:8086,mysql:8087 --port 9090

# Auto-discover running backends on default ports
node source/Retold-Harness-Consistency-Proxy.js --discover --port 9090
```

### Response Envelope

Every proxied request returns a JSON envelope:

```json
{
	"request": {
		"method": "GET",
		"path": "/1.0/Books",
		"timestamp": "2026-03-01T12:00:00.000Z"
	},
	"consistent": false,
	"providerCount": 3,
	"providers": {
		"sqlite": {
			"status": 200,
			"timingMs": 12,
			"body": { "Count": 5 },
			"error": null
		},
		"mysql": {
			"status": 200,
			"timingMs": 18,
			"body": { "Count": 5 },
			"error": null
		},
		"mongodb": {
			"status": 200,
			"timingMs": 25,
			"body": { "Count": 4 },
			"error": null
		}
	},
	"differences": [
		{
			"path": "$.body.Count",
			"values": {
				"sqlite": 5,
				"mysql": 5,
				"mongodb": 4
			}
		}
	],
	"summary": "2 of 3 providers agree. mongodb differ(s) on: body.Count"
}
```
