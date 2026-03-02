# Provider Discovery: DefaultProviderPortMap

## Signature

```javascript
const libProviderDiscovery = require('./source/Provider-Discovery.js');

libProviderDiscovery.DefaultProviderPortMap
```

## Type

`object` -- A frozen constant map of `{ providerKey: port }`.

## Value

| Provider Key | Port | Description |
|-------------|------|-------------|
| `sqlite` | `8086` | SQLite harness default port |
| `mysql` | `8087` | MySQL harness default port |
| `mssql` | `8088` | Microsoft SQL Server harness default port |
| `postgresql` | `8089` | PostgreSQL harness default port |
| `mongodb` | `8090` | MongoDB harness default port |
| `dgraph` | `8091` | Dgraph harness default port |
| `solr` | `8092` | Solr harness default port |

## Description

A constant mapping of database provider names to their default port numbers. The port assignments follow the convention used by the retold-harness management tool: a base port of `8086` incremented by provider index.

This map serves as the reference for `discoverBackends()`, which probes every port in this map to find running harness instances.

## Examples

### Accessing the port map

```javascript
const libProviderDiscovery = require('./source/Provider-Discovery.js');

let tmpPortMap = libProviderDiscovery.DefaultProviderPortMap;

console.log(tmpPortMap.sqlite);      // 8086
console.log(tmpPortMap.mysql);       // 8087
console.log(tmpPortMap.postgresql);  // 8089
```

### Iterating over all default providers

```javascript
const libProviderDiscovery = require('./source/Provider-Discovery.js');

let tmpPortMap = libProviderDiscovery.DefaultProviderPortMap;
let tmpKeys = Object.keys(tmpPortMap);

for (let i = 0; i < tmpKeys.length; i++)
{
	let tmpKey = tmpKeys[i];
	console.log(`${tmpKey} defaults to port ${tmpPortMap[tmpKey]}`);
}
```

### Checking if a provider has a default port

```javascript
const libProviderDiscovery = require('./source/Provider-Discovery.js');

let tmpPortMap = libProviderDiscovery.DefaultProviderPortMap;

if (tmpPortMap.hasOwnProperty('mysql'))
{
	console.log(`MySQL default port: ${tmpPortMap.mysql}`);
}

if (!tmpPortMap.hasOwnProperty('redis'))
{
	console.log('Redis is not a default provider');
}
```

### Using default ports with explicit overrides

```javascript
const libProviderDiscovery = require('./source/Provider-Discovery.js');

let tmpDefaults = libProviderDiscovery.DefaultProviderPortMap;

// Start with defaults, override mysql to a custom port
let tmpBackends = Object.assign({}, tmpDefaults);
tmpBackends.mysql = 3307;

console.log(tmpBackends.mysql);       // 3307
console.log(tmpBackends.sqlite);      // 8086 (unchanged)
```

## Notes

- The port numbering scheme starts at `8086` and increments by one for each provider in the order: sqlite, mysql, mssql, postgresql, mongodb, dgraph, solr.
- This map is defined at module scope and is the same object reference used internally by `discoverBackends()`. Avoid mutating it directly; use `Object.assign()` to create a copy if you need modifications.
- Providers not in this map (e.g., Redis, CouchDB) are not supported by auto-discovery. Use explicit backend configuration via `--backends` or the `backends` constructor option for non-standard providers.
- The seven providers listed here represent the database backends supported by the Meadow data access layer.
