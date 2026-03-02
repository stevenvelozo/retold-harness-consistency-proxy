# Retold Harness Consistency Proxy

Retold Harness Consistency Proxy is a splitter HTTP proxy that fans out every incoming request to multiple retold-harness backends in parallel, compares their responses, and returns a structured JSON envelope showing whether the backends agree or differ. It is designed for verifying data-layer consistency across different database providers in the Retold Meadow ecosystem.

The library is part of the Retold Meadow module group and integrates with the Pict/Fable service provider ecosystem.

## What It Does

When you run the same retold-harness API against multiple database backends (MySQL, MSSQL, SQLite), subtle differences can creep in -- type coercions, auto-generated IDs, timestamp precision. The consistency proxy catches these by sending every request to all backends at once and diffing the results field by field.

Each response envelope includes:

- A **consistent** boolean indicating whether all backends agreed
- Per-provider **response bodies** with individual timing data
- A **differences** array listing every field where backends disagree
- **Excluded fields** that were intentionally ignored during comparison

## Key Concepts

- **Parallel Fan-out** -- sends identical requests to all configured backends simultaneously
- **Smart Field Exclusion** -- ignores auto-generated values like IDs, GUIDs, and timestamps during comparison
- **Auto-Discovery** -- probes default ports to find running retold-harness backends automatically
- **Type Normalization** -- handles cross-database type coercions so that equivalent values are not flagged as differences
- **JSON Envelope** -- structured consistency report with per-provider timing and detailed diffs
- **CLI and Programmatic** -- run as a standalone server from the command line or embed in a Node.js application

## Install

```bash
npm install retold-harness-consistency-proxy
```

## Quick Example

```javascript
const libFable = require('fable');
const libConsistencyProxy = require('retold-harness-consistency-proxy');

let _Fable = new libFable(
	{
		ConsistencyProxy:
			{
				Port: 9090,
				Backends:
					[
						'http://localhost:8080',
						'http://localhost:8081',
						'http://localhost:8082'
					]
			}
	});

_Fable.addServiceTypeIfNotExists('ConsistencyProxy', libConsistencyProxy);
_Fable.instantiateServiceProvider('ConsistencyProxy', {});

_Fable.ConsistencyProxy.start(
	function (pError)
	{
		if (pError) return console.error(pError);
		console.log('Consistency proxy listening on port 9090');
	});
```

Then query the proxy and get a consistency envelope:

```bash
curl http://localhost:9090/1.0/Author/1
```

```json
{
  "consistent": true,
  "backends": 3,
  "responses": {
    "http://localhost:8080": { "status": 200, "ms": 12, "body": { "IDAuthor": 1, "Name": "Tolkien" } },
    "http://localhost:8081": { "status": 200, "ms": 18, "body": { "IDAuthor": 1, "Name": "Tolkien" } },
    "http://localhost:8082": { "status": 200, "ms": 9,  "body": { "IDAuthor": 1, "Name": "Tolkien" } }
  },
  "differences": [],
  "excluded": ["IDAuthor", "GUIDAuthor", "CreateDate", "UpdateDate"]
}
```

## Learn More

- [Quick Start](quick-start.md) -- Setup and first consistency check
- [Architecture](architecture.md) -- How the proxy is structured
- [Response Envelope](envelope.md) -- Anatomy of a consistency report
- [Configuration](configuration.md) -- Settings reference
- [API Reference](api/reference.md) -- Full method documentation
- [GitHub](https://github.com/stevenvelozo/retold-harness)
