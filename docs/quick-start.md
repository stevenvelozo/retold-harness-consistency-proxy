# Quick Start

This guide walks through installing the consistency proxy, starting it against
two or more retold-harness backends, making a request, and reading the
response envelope.

## Installation

```bash
npm install retold-harness-consistency-proxy
```

If you plan to run the proxy from the command line, install it globally:

```bash
npm install -g retold-harness-consistency-proxy
```

## Prerequisites

You need at least two retold-harness backends running on different ports.
Each backend should be backed by a different database provider (for example
SQLite on port 8086 and MySQL on port 8087). The proxy fans out every
incoming request to all backends and compares what comes back.

## CLI Usage

### Explicit Backends

Pass a comma-separated list of `provider:port` pairs with `--backends`:

```bash
retold-harness-consistency-proxy --backends sqlite:8086,mysql:8087 --port 9090
```

Short flags work too:

```bash
retold-harness-consistency-proxy -b sqlite:8086,mysql:8087 -p 9090
```

### Auto-Discovery

If your backends run on the default port map (8086-8092), let the proxy
discover them automatically:

```bash
retold-harness-consistency-proxy --discover
```

The proxy sends `GET /1.0/Books/Count` to each default port with a 2-second
timeout. Any port that responds with HTTP 200 is added to the backend set.

### Running Directly with Node

You can also run the main source file directly without installing the CLI
binary:

```bash
node source/Retold-Harness-Consistency-Proxy.js --backends sqlite:8086,mysql:8087
```

## Programmatic Usage

Require the `ConsistencyProxy` class and pass an options object:

```javascript
const ConsistencyProxy = require('retold-harness-consistency-proxy');

let tmpProxy = new ConsistencyProxy(
	{
		port: 9090,
		backends:
		{
			'sqlite': 8086,
			'mysql': 8087
		}
	});

tmpProxy.start(
	(pError) =>
	{
		if (pError)
		{
			console.error('Failed to start:', pError);
			return;
		}
		console.log('Consistency proxy listening on port 9090');
	});
```

To stop the proxy gracefully:

```javascript
tmpProxy.stop(
	() =>
	{
		console.log('Proxy stopped.');
	});
```

### Using Auto-Discovery Programmatically

Set `discover: true` and omit the `backends` map:

```javascript
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
			console.error('Failed to start:', pError);
			return;
		}
		console.log('Proxy running with discovered backends');
	});
```

## Making a Request

Once the proxy is running, send any HTTP request to it. The proxy forwards
the request to every configured backend in parallel, collects the responses,
compares them, and returns a JSON envelope.

```bash
curl http://localhost:9090/1.0/Book/1
```

This fans out `GET /1.0/Book/1` to both the SQLite backend (port 8086)
and the MySQL backend (port 8087) simultaneously.

POST and PUT requests work the same way -- the body is forwarded to all
backends:

```bash
curl -X POST http://localhost:9090/1.0/Books \
	-H "Content-Type: application/json" \
	-d '{"Title": "Dune", "Genre": "Science Fiction"}'
```

## Reading the Response Envelope

Every response from the proxy is a JSON envelope containing the comparison
report. Here is an example of a consistent response:

```json
{
	"request": {
		"method": "GET",
		"path": "/1.0/Book/1",
		"timestamp": "2024-08-01T12:00:00.000Z"
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

Key fields to check:

- **`consistent`** -- `true` when all providers returned equivalent
  business data; `false` when differences were found.
- **`differences`** -- an array of difference objects. Each one has a
  `path` (a JSONPath-like string such as `$.body.Title`) and a `values`
  map showing what each provider returned.
- **`summary`** -- a human-readable string describing the outcome.
- **`providers`** -- per-provider results with HTTP status code, response
  body, timing in milliseconds, and any connection error.

Notice that `IDBook` differs between providers (1 vs 50) but the response
is still marked consistent. The comparator automatically excludes
auto-generated fields like IDs, GUIDs, and timestamps. See the
[Field Exclusion](./field-exclusion.md) documentation for details.

## Walkthrough: Detecting a Difference

Suppose the MySQL backend stores a title differently than SQLite:

```bash
curl http://localhost:9090/1.0/Book/42
```

If SQLite returns `"Title": "Dune"` and MySQL returns `"Title": "DUNE"`,
the envelope reports the inconsistency:

```json
{
	"request": {
		"method": "GET",
		"path": "/1.0/Book/42",
		"timestamp": "2024-08-01T12:01:00.000Z"
	},
	"consistent": false,
	"providerCount": 2,
	"providers": {
		"sqlite": {
			"status": 200,
			"timingMs": 10,
			"body": { "IDBook": 42, "Title": "Dune", "Genre": "Science Fiction" },
			"error": null
		},
		"mysql": {
			"status": 200,
			"timingMs": 15,
			"body": { "IDBook": 99, "Title": "DUNE", "Genre": "Science Fiction" },
			"error": null
		}
	},
	"differences": [
		{
			"path": "$.body.Title",
			"values": { "sqlite": "Dune", "mysql": "DUNE" }
		}
	],
	"summary": "1 of 2 providers agree. mysql differ(s) on: body.Title"
}
```

The `differences` array pinpoints exactly which field diverged and what each
provider returned. The `summary` uses majority-vote analysis to identify
which providers are in the minority.

## Next Steps

- [Configuration Reference](./configuration.md) -- all options, flags, and
  default values
- [Response Envelope](./envelope.md) -- full envelope format specification
- [Field Exclusion](./field-exclusion.md) -- how and why fields are excluded
  from comparison
- [Architecture](./architecture.md) -- internal components and request flow
- [Provider Discovery](./provider-discovery.md) -- auto-discovery details
