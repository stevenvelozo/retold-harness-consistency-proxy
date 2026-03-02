# Provider Discovery

The consistency proxy can automatically discover running retold-harness
backends by probing a set of default ports. This document describes how
discovery works, the default port map, the difference between discovery
and explicit backends, CLI argument parsing, and programmatic usage.

## How Auto-Discovery Works

When discovery is enabled, the proxy sends a lightweight HTTP request to
each port in the default port map on `127.0.0.1`. All probes run in
parallel.

### Probe Details

| Setting | Value |
|---------|-------|
| Probe endpoint | `GET /1.0/Books/Count` |
| Probe host | `127.0.0.1` |
| Probe timeout | 2000ms (2 seconds) |
| Success condition | HTTP 200 response |

The `/1.0/Books/Count` endpoint is a standard Meadow count route that
every retold-harness backend exposes. It is a low-cost operation that
confirms the backend is running and responsive without transferring
significant data.

### Probe Outcomes

For each port in the default map:

- **HTTP 200 within 2 seconds** -- the provider is added to the active
  backend set with its key and port.
- **Non-200 status code** -- the port is skipped (the service is running
  but not a valid harness).
- **Connection refused** -- the port is skipped (nothing is listening).
- **Timeout after 2 seconds** -- the port is skipped (the service is
  unresponsive).

After all probes complete, the proxy logs how many backends were
discovered and starts the HTTP server with those backends configured.

## Default Port Map

Discovery probes these seven ports, matching the retold-harness management
tool conventions:

| Provider | Key | Port |
|----------|-----|------|
| SQLite | `sqlite` | 8086 |
| MySQL | `mysql` | 8087 |
| MSSQL | `mssql` | 8088 |
| PostgreSQL | `postgresql` | 8089 |
| MongoDB | `mongodb` | 8090 |
| DGraph | `dgraph` | 8091 |
| Solr | `solr` | 8092 |

The port range starts at 8086 and increments by one for each provider.
Only ports that respond successfully are included in the backend set.

## Discovery vs Explicit Backends

There are two ways to configure which backends the proxy talks to:

### Explicit Backends

You provide a specific list of `provider:port` pairs. The proxy uses
exactly the backends you specify without probing anything.

```bash
retold-harness-consistency-proxy --backends sqlite:8086,mysql:8087
```

Advantages:

- Deterministic -- you know exactly which backends are used.
- Works with non-default ports.
- Works with custom provider keys.
- No startup delay from probing.

### Auto-Discovery

The proxy probes all default ports and uses whatever responds.

```bash
retold-harness-consistency-proxy --discover
```

Advantages:

- No need to know which backends are running.
- Adapts automatically as you start and stop backends.
- Convenient for development and local testing.

### Priority

When the proxy resolves backends at startup, it follows this priority:

1. If `backends` is provided and non-empty, use those directly. Discovery
   is not performed.
2. If `backends` is empty and `discover` is `true`, run auto-discovery.
3. If both are empty/false, startup fails.

When run from the CLI with no arguments, the proxy falls back to
discovery automatically. This means running with no flags is equivalent
to `--discover`.

## CLI Argument Format

### The --backends Flag

The `--backends` (or `-b`) flag accepts a comma-separated string of
`key:port` pairs:

```
--backends provider:port,provider:port,...
```

Rules for the format:

- Keys are lowercased automatically.
- Ports must be valid integers.
- Whitespace around keys, ports, and commas is trimmed.
- Invalid pairs (missing colon, non-numeric port) are silently skipped.

Examples:

```bash
# Two backends
--backends sqlite:8086,mysql:8087

# Three backends including a non-default port
--backends sqlite:8086,mysql:8087,postgresql:9000

# Single backend
--backends sqlite:8086

# Short flag
-b sqlite:8086,mysql:8087
```

### The --discover Flag

The `--discover` (or `-d`) flag takes no argument. Its presence enables
discovery:

```bash
retold-harness-consistency-proxy --discover
retold-harness-consistency-proxy -d
```

### The --port Flag

The `--port` (or `-p`) flag sets the proxy listening port (not a backend
port):

```bash
retold-harness-consistency-proxy --discover --port 3000
retold-harness-consistency-proxy -d -p 3000
```

### Combining Flags

Explicit backends take priority. If you pass both `--backends` and
`--discover`, the explicit backends are used and discovery is skipped:

```bash
# Discovery is ignored because explicit backends are provided
retold-harness-consistency-proxy --backends sqlite:8086,mysql:8087 --discover
```

## Programmatic Discovery Usage

The `Provider-Discovery` module exports functions that can be used
independently of the `ConsistencyProxy` class.

### discoverBackends

Probes all default ports and returns a backends map:

```javascript
const libDiscovery = require('./source/Provider-Discovery.js');

libDiscovery.discoverBackends(
	(pBackends) =>
	{
		// pBackends is an object like { sqlite: 8086, mysql: 8087 }
		let tmpKeys = Object.keys(pBackends);
		console.log(`Found ${tmpKeys.length} running backend(s)`);

		for (let i = 0; i < tmpKeys.length; i++)
		{
			console.log(`  ${tmpKeys[i]} on port ${pBackends[tmpKeys[i]]}`);
		}
	});
```

### probePort

Probe a single port to check if a harness is listening:

```javascript
const libDiscovery = require('./source/Provider-Discovery.js');

libDiscovery.probePort(8086,
	(pIsLive) =>
	{
		if (pIsLive)
		{
			console.log('SQLite harness is running on port 8086');
		}
		else
		{
			console.log('Nothing responding on port 8086');
		}
	});
```

### parseBackendsArg

Parse a backends string into a map without any network calls:

```javascript
const libDiscovery = require('./source/Provider-Discovery.js');

let tmpBackends = libDiscovery.parseBackendsArg('sqlite:8086,mysql:8087');
// tmpBackends = { sqlite: 8086, mysql: 8087 }
```

### parseArgv

Parse `process.argv` for all discovery-related flags:

```javascript
const libDiscovery = require('./source/Provider-Discovery.js');

let tmpArgs = libDiscovery.parseArgv();
// tmpArgs = { backends: { sqlite: 8086, mysql: 8087 }, discover: false, port: 9090 }
```

### DefaultProviderPortMap

The default port map is exported directly for reference:

```javascript
const libDiscovery = require('./source/Provider-Discovery.js');

console.log(libDiscovery.DefaultProviderPortMap);
// { sqlite: 8086, mysql: 8087, mssql: 8088, postgresql: 8089,
//   mongodb: 8090, dgraph: 8091, solr: 8092 }
```

## Using Discovery With ConsistencyProxy

To use auto-discovery through the main proxy class, set `discover: true`
in the options:

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
			console.error('Start failed:', pError);
			return;
		}
		console.log('Proxy running with discovered backends');
	});
```

The proxy logs which backends were discovered at startup:

```
info: Auto-discovering backends on default ports...
info: Discovered 2 running backend(s).
info: Backends configured: sqlite:8086, mysql:8087
info: Consistency proxy listening on port 9090
info: Forwarding to 2 backend(s): sqlite, mysql
```
