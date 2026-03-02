# Configuration Reference

This document covers every configurable option for the consistency proxy,
including constructor options, CLI flags, backend format, default ports,
and internal timeouts.

## Constructor Options

When using the proxy programmatically, pass an options object to the
constructor:

```javascript
let tmpProxy = new ConsistencyProxy(
	{
		port: 9090,
		backends: { 'sqlite': 8086, 'mysql': 8087 },
		discover: false
	});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | `number` | `9090` | Port the proxy HTTP server listens on. |
| `backends` | `object` | `{}` | Map of provider keys to port numbers. Each key is a string identifier (e.g. `"sqlite"`) and each value is the port where that backend is listening. |
| `discover` | `boolean` | `false` | When `true`, the proxy probes the default port range at startup to find running backends. Ignored if `backends` contains entries. |

### Backend Resolution Priority

The proxy resolves backends using this logic:

1. If the `backends` object contains one or more entries, those are used
   directly.
2. If `backends` is empty and `discover` is `true`, auto-discovery probes
   the default port range.
3. If both are empty/false, startup fails with "No backends available".

## CLI Flags

When running the proxy from the command line, these flags are available:

| Flag | Short | Argument | Default | Description |
|------|-------|----------|---------|-------------|
| `--backends` | `-b` | `provider:port,...` | _(none)_ | Comma-separated list of `key:port` pairs. See "Backend Format" below. |
| `--discover` | `-d` | _(none)_ | `false` | Enable auto-discovery of running backends on default ports. |
| `--port` | `-p` | `number` | `9090` | Port for the proxy server to listen on. |

Examples:

```bash
# Two explicit backends on a custom proxy port
retold-harness-consistency-proxy --backends sqlite:8086,mysql:8087 --port 3000

# Short flags
retold-harness-consistency-proxy -b sqlite:8086,mysql:8087 -p 3000

# Auto-discover with default proxy port
retold-harness-consistency-proxy --discover

# Auto-discover on a custom port
retold-harness-consistency-proxy -d -p 4000
```

### CLI Fallback Behavior

When run directly (not as a library), if no `--backends` argument is
provided and the parsed backend map is empty, the proxy automatically
enables discovery. This means running with no arguments is equivalent to
`--discover`:

```bash
# These two are equivalent when no backends are configured:
retold-harness-consistency-proxy
retold-harness-consistency-proxy --discover
```

## Backend Format

The `--backends` argument accepts a comma-separated string of `key:port`
pairs:

```
provider_key:port_number,provider_key:port_number,...
```

Rules:

- Keys are lowercased automatically.
- Ports must be valid integers.
- Whitespace around keys, ports, and commas is trimmed.
- Invalid pairs (missing colon, non-numeric port) are silently skipped.

Examples of valid backend strings:

| String | Result |
|--------|--------|
| `sqlite:8086,mysql:8087` | `{ sqlite: 8086, mysql: 8087 }` |
| `sqlite:8086` | `{ sqlite: 8086 }` |
| `PostgreSQL:8089,MongoDB:8090` | `{ postgresql: 8089, mongodb: 8090 }` |
| `sqlite : 8086 , mysql : 8087` | `{ sqlite: 8086, mysql: 8087 }` |

## Default Port Map

When auto-discovery is enabled, the proxy probes these ports on
`127.0.0.1`:

| Provider | Port |
|----------|------|
| SQLite | 8086 |
| MySQL | 8087 |
| MSSQL | 8088 |
| PostgreSQL | 8089 |
| MongoDB | 8090 |
| DGraph | 8091 |
| Solr | 8092 |

These defaults match the retold-harness management tool conventions.
The port assignments start at 8086 and increment by provider index.

Discovery sends `GET /1.0/Books/Count` to each port. If the backend
responds with HTTP 200 within 2 seconds, it is added to the active
backend set.

## RequestFanout Timeout

The `RequestFanout` service has a per-request timeout controlling how
long the proxy waits for each backend to respond:

| Setting | Property | Default | Description |
|---------|----------|---------|-------------|
| Fanout timeout | `_timeoutMs` | `10000` (10 seconds) | Maximum time to wait for a single backend response. If a backend does not respond within this window, the request is aborted and an error result is recorded for that provider. |

The timeout is set on the `RequestFanout` service instance. To change it
programmatically:

```javascript
let tmpProxy = new ConsistencyProxy(
	{
		port: 9090,
		backends: { 'sqlite': 8086, 'mysql': 8087 }
	});

tmpProxy.start(
	(pError) =>
	{
		// Adjust the fanout timeout after start
		tmpProxy._fable.RequestFanout._timeoutMs = 30000;
	});
```

When a timeout occurs, the provider entry in the envelope will have:

```json
{
	"status": 0,
	"timingMs": 10000,
	"body": null,
	"error": "Request timed out after 10000ms"
}
```

## Discovery Probe Timeout

The auto-discovery probe uses a separate, shorter timeout:

| Setting | Value | Description |
|---------|-------|-------------|
| Probe timeout | `2000` (2 seconds) | Maximum time to wait for a response to the discovery health check on each port. Ports that do not respond within this window are considered inactive. |

This timeout is not configurable at runtime. It is hardcoded in
`Provider-Discovery.js` because discovery probes are lightweight
operations that should resolve quickly.

## Fable Configuration

The proxy creates its own internal Fable instance with the following
configuration:

| Setting | Value |
|---------|-------|
| Product | `RetoldHarnessConsistencyProxy` |
| ProductVersion | `1.0.0` |
| Log stream | Console, level `info` |

This is an internal detail. The Fable instance manages the service
registry for `RequestFanout` and `ResponseComparator`. You do not need
to create a Fable instance yourself when using the proxy.

## Stripped Headers

When forwarding requests to backends, the `RequestFanout` service strips
these hop-by-hop and connection-specific headers:

| Header | Reason |
|--------|--------|
| `host` | Replaced by the backend's address |
| `connection` | Hop-by-hop header |
| `transfer-encoding` | Hop-by-hop header |
| `keep-alive` | Hop-by-hop header |

The `content-length` header is recalculated from the actual body size
when a request body is present.
