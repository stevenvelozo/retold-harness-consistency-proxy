# RequestFanout.getBackends()

## Signature

```javascript
tmpFable.RequestFanout.getBackends()
```

## Parameters

None.

## Returns

| Type | Description |
|------|-------------|
| `object` | The current backend map as `{ providerKey: port, ... }` |

## Description

Returns a reference to the internal backend map. Each key is a provider name and each value is the port number where that provider's harness is listening.

If no backends have been configured, an empty object `{}` is returned.

## Examples

### Inspecting configured backends

```javascript
let tmpBackends = tmpFable.RequestFanout.getBackends();

console.log(tmpBackends);
// { sqlite: 8086, mysql: 8087, postgresql: 8089 }
```

### Checking the number of backends

```javascript
let tmpBackends = tmpFable.RequestFanout.getBackends();
let tmpCount = Object.keys(tmpBackends).length;

console.log(`${tmpCount} backend(s) configured`);
```

### Iterating over backends

```javascript
let tmpBackends = tmpFable.RequestFanout.getBackends();
let tmpKeys = Object.keys(tmpBackends);

for (let i = 0; i < tmpKeys.length; i++)
{
	let tmpKey = tmpKeys[i];
	console.log(`${tmpKey} is on port ${tmpBackends[tmpKey]}`);
}
```

## Notes

- This method returns a direct reference to the internal map, not a copy. Mutating the returned object will affect the service state. Use `setBackends()` if you need to replace the map entirely.
- The proxy's `_handleRequest` method calls `getBackends()` on each incoming request to log the current backend count.
