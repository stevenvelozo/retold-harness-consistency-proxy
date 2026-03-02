# Retold Harness Consistency Proxy

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Splitter HTTP proxy that fans out every incoming request to multiple retold-harness backends in parallel, compares their responses, and returns a JSON envelope showing agreement or differences.

## Features

- **Parallel Fan-out** -- sends identical requests to all configured backends simultaneously
- **Automatic Field Exclusion** -- ignores auto-generated fields (IDs, GUIDs, timestamps) during comparison
- **Type Normalization** -- handles type coercions between databases (numeric strings vs numbers)
- **Array Comparison** -- sorts and compares list responses element-by-element on business fields
- **Auto-Discovery** -- probes default ports to find running retold-harness instances
- **Per-Provider Timing** -- measures response time for each backend independently
- **JSON Envelope** -- returns complete comparison report with per-provider results and diff paths
- **Graceful Error Handling** -- continues operating when individual backends fail
- **CLI and Programmatic** -- run as a standalone server or embed in your own Node.js application
- **Fable Service Architecture** -- built on fable-serviceproviderbase for service injection

## Installation

```bash
npm install retold-harness-consistency-proxy
```

## Quick Start

### CLI Usage

```bash
# Explicit backends
retold-harness-consistency-proxy --backends sqlite:8086,mysql:8087 --port 9090

# Auto-discover running backends on default ports
retold-harness-consistency-proxy --discover --port 9090
```

### Programmatic Usage

```javascript
const ConsistencyProxy = require('retold-harness-consistency-proxy');

let tmpProxy = new ConsistencyProxy(
	{
		port: 9090,
		backends: { 'sqlite': 8086, 'mysql': 8087 }
	});

tmpProxy.start(
	function (pError)
	{
		if (pError)
		{
			console.error('Failed to start:', pError);
			return;
		}
		console.log('Proxy listening on port 9090');
	});
```

Then send requests to the proxy on port 9090. Every request is forwarded to all backends and a comparison envelope is returned:

```bash
curl http://localhost:9090/1.0/Book/1
```

## Response Envelope

Every response from the proxy follows this structure:

```json
{
	"request": {
		"method": "GET",
		"path": "/1.0/Book/1",
		"timestamp": "2024-08-01T00:00:00.000Z"
	},
	"consistent": true,
	"providerCount": 2,
	"providers": {
		"sqlite": {
			"status": 200,
			"timingMs": 12,
			"body": { "IDBook": 1, "Title": "Dune", "Genre": "Science Fiction" },
			"error": null
		},
		"mysql": {
			"status": 200,
			"timingMs": 18,
			"body": { "IDBook": 50, "Title": "Dune", "Genre": "Science Fiction" },
			"error": null
		}
	},
	"differences": [],
	"summary": "All 2 providers agree"
}
```

## CLI Options

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--backends` | `-b` | Comma-separated `key:port` pairs | _(none)_ |
| `--discover` | `-d` | Auto-discover running backends on default ports | `false` |
| `--port` | `-p` | Port for the proxy server to listen on | `9090` |

## Default Port Map

When using `--discover`, the proxy probes these default ports:

| Provider | Port |
|----------|------|
| SQLite | 8086 |
| MySQL | 8087 |
| MSSQL | 8088 |
| PostgreSQL | 8089 |
| MongoDB | 8090 |
| DGraph | 8091 |
| Solr | 8092 |

## Excluded Fields

The comparator automatically excludes these fields from value comparison, since they differ across independent database instances:

| Pattern | Examples |
|---------|----------|
| `/^ID[A-Z]/` | IDBook, IDAuthor, IDBookAuthorJoin |
| `/^GUID[A-Z]/` | GUIDBook, GUIDAuthor |
| `CreateDate` | Timestamp auto-set on create |
| `UpdateDate` | Timestamp auto-set on update |
| `DeleteDate` | Timestamp auto-set on soft delete |
| `CreatingIDUser` | User ID for create audit |
| `UpdatingIDUser` | User ID for update audit |
| `DeletingIDUser` | User ID for delete audit |

## Architecture

The proxy is composed of three internal components:

| Component | Description |
|-----------|-------------|
| **ConsistencyProxy** | HTTP server that receives requests and orchestrates the flow |
| **RequestFanout** | Fable service that sends identical requests to all backends in parallel |
| **ResponseComparator** | Fable service that normalizes and diffs responses across providers |
| **Provider Discovery** | Utility module for CLI parsing and port probing |

## Testing

```bash
npm test
```

Tests use mock HTTP servers to simulate multiple retold-harness backends with different IDs and timestamps for the same business data.

## Documentation

Full documentation is available in the [docs](./docs/) directory.

## Related Packages

- [retold-harness](https://github.com/stevenvelozo/retold-harness) -- Test harness backends this proxy compares
- [meadow](https://github.com/stevenvelozo/meadow) -- Data access layer that powers the harness endpoints
- [fable](https://github.com/stevenvelozo/fable) -- Application framework and service container
- [fable-serviceproviderbase](https://github.com/stevenvelozo/fable-serviceproviderbase) -- Base class for Fable services

## License

MIT
