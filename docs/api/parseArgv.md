# Provider Discovery: parseArgv()

## Signature

```javascript
const libProviderDiscovery = require('./source/Provider-Discovery.js');

libProviderDiscovery.parseArgv()
```

## Parameters

None. This function reads directly from `process.argv`.

## Returns

| Type | Description |
|------|-------------|
| `object` | Parsed command-line arguments |

### Return Object

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `backends` | `object\|null` | `null` | Parsed backend map from `--backends` flag, or `null` if not provided |
| `discover` | `boolean` | `false` | `true` if `--discover` flag is present |
| `port` | `number` | `9090` | Proxy listening port from `--port` flag |

## Description

Parses `process.argv` for the three command-line flags used by the consistency proxy:

| Flag | Short | Argument | Description |
|------|-------|----------|-------------|
| `--backends` | `-b` | `key:port,key:port,...` | Backend specification string passed to `parseBackendsArg()` |
| `--discover` | `-d` | _(none)_ | Enable auto-discovery mode |
| `--port` | `-p` | `<number>` | Port for the proxy server to listen on |

### Parsing Rules

- Arguments are read starting from index 2 of `process.argv` (skipping the Node.js executable and script path).
- `--backends` and `-b` consume the next argument as the backends specification string.
- `--discover` and `-d` are boolean flags that require no additional argument.
- `--port` and `-p` consume the next argument as a port number. If parsing fails, the default `9090` is used.
- Unrecognized flags are silently ignored.

## Examples

### Parsing explicit backends

```bash
node source/Retold-Harness-Consistency-Proxy.js --backends sqlite:8086,mysql:8087 --port 9090
```

```javascript
const libProviderDiscovery = require('./source/Provider-Discovery.js');

let tmpArgs = libProviderDiscovery.parseArgv();

console.log(tmpArgs.backends);  // { sqlite: 8086, mysql: 8087 }
console.log(tmpArgs.discover);  // false
console.log(tmpArgs.port);      // 9090
```

### Parsing discovery mode

```bash
node source/Retold-Harness-Consistency-Proxy.js --discover --port 7070
```

```javascript
let tmpArgs = libProviderDiscovery.parseArgv();

console.log(tmpArgs.backends);  // null
console.log(tmpArgs.discover);  // true
console.log(tmpArgs.port);      // 7070
```

### Short flags

```bash
node source/Retold-Harness-Consistency-Proxy.js -b sqlite:8086 -d -p 3000
```

```javascript
let tmpArgs = libProviderDiscovery.parseArgv();

console.log(tmpArgs.backends);  // { sqlite: 8086 }
console.log(tmpArgs.discover);  // true
console.log(tmpArgs.port);      // 3000
```

### Using parsed args to construct the proxy

```javascript
const ConsistencyProxy = require('retold-harness-consistency-proxy');
const libProviderDiscovery = require('./source/Provider-Discovery.js');

let tmpArgs = libProviderDiscovery.parseArgv();

let tmpProxy = new ConsistencyProxy(
	{
		port: tmpArgs.port,
		backends: tmpArgs.backends,
		discover: tmpArgs.discover || (!tmpArgs.backends || Object.keys(tmpArgs.backends).length === 0)
	});
```

## Notes

- This function is called by the module's `require.main === module` block when the proxy is run directly from the command line.
- The `backends` field is `null` (not an empty object) when the `--backends` flag is not provided. This allows the caller to distinguish between "no flag given" and "flag given with no valid entries".
- The `--port` flag falls back to `9090` if the provided value is not a valid integer (i.e., `parseInt()` returns `NaN`).
- This function does not validate that the provided port numbers or backend specifications are reasonable. Validation happens downstream when the proxy starts.
