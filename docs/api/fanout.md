# RequestFanout.fanout()

## Signature

```javascript
tmpFable.RequestFanout.fanout(pMethod, pPath, pHeaders, pBody, fCallback)
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pMethod` | `string` | Yes | HTTP method (e.g., `'GET'`, `'POST'`, `'PUT'`, `'DELETE'`) |
| `pPath` | `string` | Yes | Request path including query string (e.g., `'/1.0/Book/1'`) |
| `pHeaders` | `object` | Yes | Request headers to forward to backends |
| `pBody` | `string\|null` | Yes | Request body as a UTF-8 string (for `POST`/`PUT`) or `null` |
| `fCallback` | `function` | Yes | Callback invoked as `fCallback(pError, pResults)` |

## Callback

| Parameter | Type | Description |
|-----------|------|-------------|
| `pError` | `string\|null` | Error message if fan-out could not proceed, or `null` on success |
| `pResults` | `object` | Map of `{ providerKey: resultObject }` for each backend |

### Result Object

Each entry in `pResults` contains:

| Field | Type | Description |
|-------|------|-------------|
| `status` | `number` | HTTP status code from the backend, or `0` on connection error/timeout |
| `headers` | `object` | Response headers from the backend, or `{}` on error |
| `body` | `*` | Parsed JSON body if the response is valid JSON, otherwise the raw string. `null` on error. |
| `timingMs` | `number` | Elapsed time in milliseconds from request start to response completion |
| `error` | `string\|null` | `null` on success, or an error message string on failure |

## Description

Sends an identical HTTP request to every configured backend in parallel and collects all responses. This is the core mechanism of the consistency proxy: each backend receives the same method, path, headers, and body, allowing their responses to be compared for consistency.

### Request Flow

1. **Validate backends** -- If no backends are configured, the callback receives `'No backends configured'` immediately.
2. **Parallel dispatch** -- For each entry in the backend map, a separate HTTP request is created targeting `127.0.0.1` on the backend's port.
3. **Header forwarding** -- Request headers are forwarded with the following hop-by-hop headers stripped:
   - `host`
   - `connection`
   - `transfer-encoding`
   - `keep-alive`
4. **Content-Length update** -- If a body is present, the `content-length` header is recalculated to match the byte length of the forwarded body.
5. **Body forwarding** -- For `POST` and `PUT` requests, the body string is written to the outgoing request.
6. **Response collection** -- Each backend's response is fully buffered, then JSON-parsed. If parsing fails, the raw string is kept as the body value.
7. **Timing** -- Each result includes `timingMs` measured from the moment the request was dispatched to when the full response was received.
8. **Completion** -- Once all backends have responded (or errored/timed out), the callback fires with the full results map.

### Timeout Behavior

Each individual backend request has a timeout of **10,000 milliseconds** (10 seconds). If a backend does not respond within this window:

- The request is destroyed.
- The result for that backend has `status: 0`, `body: null`, and `error: 'Request timed out after 10000ms'`.

### Error Handling

If a backend is unreachable (connection refused, DNS failure, etc.):

- The result for that backend has `status: 0`, `headers: {}`, `body: null`, and `error: 'Connection error: <message>'`.
- Other backends are not affected. The fan-out always waits for all backends to complete before invoking the callback.

### JSON Auto-Parse

Response bodies are automatically parsed with `JSON.parse()`. If parsing throws, the raw UTF-8 string is used as the `body` value. This means `body` can be any JSON-compatible type (object, array, number, string, boolean, null) or a raw string if the response is not valid JSON.

## Examples

### Basic fan-out for a GET request

```javascript
tmpFable.RequestFanout.setBackends(
	{
		sqlite: 8086,
		mysql: 8087,
		postgresql: 8089
	});

tmpFable.RequestFanout.fanout('GET', '/1.0/Books', {}, null,
	(pError, pResults) =>
	{
		if (pError)
		{
			console.error(`Fan-out error: ${pError}`);
			return;
		}

		let tmpKeys = Object.keys(pResults);

		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpKey = tmpKeys[i];
			let tmpResult = pResults[tmpKey];
			console.log(`${tmpKey}: status=${tmpResult.status}, time=${tmpResult.timingMs}ms`);
		}
	});
```

### Fan-out with a POST body

```javascript
let tmpBody = JSON.stringify(
	{
		Title: 'The Great Gatsby',
		Author: 'F. Scott Fitzgerald',
		Year: 1925
	});

let tmpHeaders =
{
	'content-type': 'application/json'
};

tmpFable.RequestFanout.fanout('POST', '/1.0/Book', tmpHeaders, tmpBody,
	(pError, pResults) =>
	{
		if (pError)
		{
			console.error(`Fan-out error: ${pError}`);
			return;
		}

		let tmpKeys = Object.keys(pResults);

		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpKey = tmpKeys[i];
			let tmpResult = pResults[tmpKey];

			if (tmpResult.error)
			{
				console.error(`${tmpKey} failed: ${tmpResult.error}`);
			}
			else
			{
				console.log(`${tmpKey} created record:`, tmpResult.body);
			}
		}
	});
```

### Handling mixed success and failure

```javascript
tmpFable.RequestFanout.fanout('GET', '/1.0/Books/Count', {}, null,
	(pError, pResults) =>
	{
		if (pError)
		{
			console.error(`Fan-out error: ${pError}`);
			return;
		}

		let tmpKeys = Object.keys(pResults);

		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpKey = tmpKeys[i];
			let tmpResult = pResults[tmpKey];

			if (tmpResult.error)
			{
				// Backend was unreachable or timed out
				console.error(`${tmpKey}: ${tmpResult.error} (${tmpResult.timingMs}ms)`);
			}
			else
			{
				console.log(`${tmpKey}: HTTP ${tmpResult.status}, body:`, tmpResult.body);
			}
		}
	});
```

## Notes

- All backends are assumed to listen on `127.0.0.1`. The hostname is not configurable per backend.
- The fan-out always waits for every backend to complete before invoking the callback. A single slow or unresponsive backend delays the overall response up to the timeout duration.
- The per-request timeout (`_timeoutMs`) is set to `10000` in the constructor and is not currently configurable via options.
- Header keys are lowercased during the forwarding process.
- The `host` header is stripped so that each backend receives the request without the proxy's host information.
- The `pError` parameter of the callback is only set when no fan-out could be attempted at all (i.e., no backends configured). Individual backend errors are reported per-result, not through `pError`.
