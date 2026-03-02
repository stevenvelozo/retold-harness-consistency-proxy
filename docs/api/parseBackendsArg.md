# Provider Discovery: parseBackendsArg()

## Signature

```javascript
const libProviderDiscovery = require('./source/Provider-Discovery.js');

libProviderDiscovery.parseBackendsArg(pBackendsArg)
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pBackendsArg` | `string` | Yes | Comma-separated `key:port` pairs (e.g., `"sqlite:8086,mysql:8087,postgresql:8089"`) |

## Returns

| Type | Description |
|------|-------------|
| `object` | Map of `{ providerKey: port }` parsed from the input string |

## Description

Parses a backend specification string into a provider-to-port map. The input format is a comma-separated list of `key:port` pairs where each key is a provider name and each port is an integer.

### Parsing Rules

1. The input is split on commas.
2. Each segment is trimmed of whitespace and split on the colon character.
3. The key portion is trimmed and lowercased.
4. The port portion is trimmed and parsed as a base-10 integer.
5. If both the key and port are valid (non-empty key, numeric port), the pair is added to the result map.
6. Malformed segments (missing colon, non-numeric port, empty key) are silently skipped.

### Edge Cases

- If `pBackendsArg` is `null`, `undefined`, or not a string, an empty object is returned.
- Empty segments (e.g., from a trailing comma) are skipped.
- Duplicate keys are resolved by last-write-wins.

## Examples

### Standard usage

```javascript
const libProviderDiscovery = require('./source/Provider-Discovery.js');

let tmpBackends = libProviderDiscovery.parseBackendsArg('sqlite:8086,mysql:8087,postgresql:8089');

console.log(tmpBackends);
// { sqlite: 8086, mysql: 8087, postgresql: 8089 }
```

### Single backend

```javascript
let tmpBackends = libProviderDiscovery.parseBackendsArg('mysql:8087');

console.log(tmpBackends);
// { mysql: 8087 }
```

### With whitespace

```javascript
let tmpBackends = libProviderDiscovery.parseBackendsArg('sqlite : 8086 , mysql : 8087');

console.log(tmpBackends);
// { sqlite: 8086, mysql: 8087 }
```

### Mixed case keys are lowercased

```javascript
let tmpBackends = libProviderDiscovery.parseBackendsArg('MySQL:8087,PostgreSQL:8089');

console.log(tmpBackends);
// { mysql: 8087, postgresql: 8089 }
```

### Invalid input

```javascript
let tmpBackends = libProviderDiscovery.parseBackendsArg(null);
console.log(tmpBackends);
// {}

tmpBackends = libProviderDiscovery.parseBackendsArg('invalid-format');
console.log(tmpBackends);
// {}

tmpBackends = libProviderDiscovery.parseBackendsArg('sqlite:notaport');
console.log(tmpBackends);
// {}
```

## Notes

- This function is used internally by `parseArgv()` to process the `--backends` CLI argument.
- Provider keys are always lowercased regardless of input casing.
- The function does not validate that ports are within valid range (1-65535). Any integer parsed by `parseInt()` is accepted.
- The colon character (`:`) is the only supported delimiter between key and port within a pair. The comma character (`,`) is the only supported delimiter between pairs.
