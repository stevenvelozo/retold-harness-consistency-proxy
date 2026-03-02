# Response Envelope Format

Every response from the consistency proxy is a JSON envelope that wraps
the results from all backends along with a comparison report. This
document describes every field in the envelope.

## Full Envelope Structure

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
			"body": {
				"IDBook": 1,
				"Title": "Dune",
				"Genre": "Science Fiction",
				"YearPublished": 1965,
				"CreateDate": "2024-07-01T10:00:00.000Z",
				"UpdateDate": "2024-07-01T10:00:00.000Z"
			},
			"error": null
		},
		"mysql": {
			"status": 200,
			"timingMs": 18,
			"body": {
				"IDBook": 50,
				"Title": "Dune",
				"Genre": "Science Fiction",
				"YearPublished": 1965,
				"CreateDate": "2024-07-01T09:58:30.000Z",
				"UpdateDate": "2024-07-01T09:58:30.000Z"
			},
			"error": null
		}
	},
	"differences": [],
	"summary": "All 2 providers agree"
}
```

## Request Metadata

The `request` object captures what the client sent to the proxy:

| Field | Type | Description |
|-------|------|-------------|
| `method` | `string` | HTTP method: `GET`, `POST`, `PUT`, `DELETE`, etc. |
| `path` | `string` | Request path as received by the proxy (e.g. `/1.0/Book/1`). |
| `timestamp` | `string` | ISO 8601 timestamp of when the proxy received the request. |

## Consistency Report

These top-level fields describe the comparison outcome:

| Field | Type | Description |
|-------|------|-------------|
| `consistent` | `boolean` | `true` if all providers returned equivalent business data with no differences. `false` if any differences were detected. |
| `providerCount` | `number` | Total number of backends that were consulted. |
| `differences` | `array` | Array of difference objects (see below). Empty when `consistent` is `true`. |
| `summary` | `string` | Human-readable summary of the comparison result. |

## Provider Results

The `providers` object contains one entry per backend. Each key is the
provider identifier (e.g. `"sqlite"`, `"mysql"`) and each value is a
result object:

| Field | Type | Description |
|-------|------|-------------|
| `status` | `number` | HTTP status code returned by this backend. `0` if the request failed or timed out. |
| `timingMs` | `number` | Response time in milliseconds from when the request was sent to when the response was fully received. |
| `body` | `any` | Parsed response body. JSON responses are parsed into objects/arrays. Non-JSON responses are returned as raw strings. `null` if the request failed. |
| `error` | `string\|null` | `null` on success. Contains an error message string on failure (e.g. `"Connection error: ECONNREFUSED"` or `"Request timed out after 10000ms"`). |

### Error Result Example

When a backend is unreachable:

```json
{
	"status": 0,
	"timingMs": 45,
	"body": null,
	"error": "Connection error: connect ECONNREFUSED 127.0.0.1:8088"
}
```

### Timeout Result Example

When a backend does not respond within the timeout window:

```json
{
	"status": 0,
	"timingMs": 10000,
	"body": null,
	"error": "Request timed out after 10000ms"
}
```

## Difference Objects

Each entry in the `differences` array describes a single point of
divergence between providers:

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | JSONPath-like string identifying which part of the response differs. |
| `values` | `object` | Map of provider key to the value that provider returned for this path. |

### Difference Format

```json
{
	"path": "$.body.Title",
	"values": {
		"sqlite": "Dune",
		"mysql": "DUNE"
	}
}
```

### Path Examples

The `path` field uses a JSONPath-like notation. Here are the possible
path patterns:

| Path | Meaning | When it appears |
|------|---------|-----------------|
| `$.body.Title` | A field on a single-object response body | Read/Create/Update responses where a specific field differs. |
| `$.body[0].Genre` | A field on the first element of an array response | Reads (list) responses where an element's field differs. Array index is zero-based. |
| `$.body.Count` | The Count field on a count response | Count endpoint responses (`/Count`) where providers return different totals. |
| `$.body.length` | The length of an array response | Reads (list) responses where providers return different numbers of records. |
| `$.body` | The entire scalar response body | Scalar or string responses that differ between providers. |
| `$.status` | The HTTP status code | Providers returned different HTTP status codes for the same request. |
| `$.error` | Connection or timeout error | One or more providers returned errors while others succeeded. Values are the error message or `"OK"`. |

### Array Element Paths

For array responses, the index in the path refers to the position after
sorting. The comparator sorts arrays by the first non-excluded string
field before comparison, so indices correspond to the sorted order, not
the original order returned by each provider.

```json
{
	"path": "$.body[2].Genre",
	"values": {
		"sqlite": "Science Fiction",
		"mysql": "Sci-Fi"
	}
}
```

### Error Path Example

When one provider fails and another succeeds:

```json
{
	"path": "$.error",
	"values": {
		"sqlite": "OK",
		"mysql": "Connection error: connect ECONNREFUSED 127.0.0.1:8087"
	}
}
```

### Status Path Example

When providers return different HTTP status codes:

```json
{
	"path": "$.status",
	"values": {
		"sqlite": 200,
		"mysql": 404
	}
}
```

## Summary Strings

The `summary` field is a human-readable string. These are the patterns
it follows:

| Scenario | Example |
|----------|---------|
| No providers configured | `"No providers to compare"` |
| Only one provider | `"Only 1 provider (sqlite), nothing to compare"` |
| All providers agree | `"All 2 providers agree"` |
| All providers returned errors | `"All 3 providers returned errors"` |
| Differences with identifiable minority | `"1 of 2 providers agree. mysql differ(s) on: body.Title"` |
| Multiple differences | `"2 of 3 providers agree. mssql differ(s) on: body.Title, body.Genre"` |
| Many differences (truncated) | `"2 of 3 providers agree. mssql differ(s) on: body.Title, body.Genre, body.Year, body.Publisher, body.ISBN (+2 more)"` |
| Differences without clear minority | `"2 providers with 1 difference(s)"` |

The summary uses majority-vote analysis. When three or more providers are
compared, the providers whose values match the majority are considered
"agreeing" and the rest are identified as differing. The differing
field paths are listed after the provider name(s), limited to the first
five paths with a count of additional paths if there are more.

## Proxy Error Response

If the fan-out itself fails before any backends are contacted (for example,
no backends are configured), the proxy returns a 502 status with a
simplified error envelope:

```json
{
	"error": "No backends configured",
	"request": {
		"method": "GET",
		"path": "/1.0/Book/1"
	}
}
```

This is a distinct format from the normal envelope and indicates a proxy
infrastructure problem rather than a backend comparison result.

## Complete Inconsistent Response Example

Here is a full envelope from a three-provider comparison where one
provider differs on a field and another returned an error:

```json
{
	"request": {
		"method": "GET",
		"path": "/1.0/Books",
		"timestamp": "2024-08-01T14:30:00.000Z"
	},
	"consistent": false,
	"providerCount": 3,
	"providers": {
		"sqlite": {
			"status": 200,
			"timingMs": 15,
			"body": [
				{ "IDBook": 1, "Title": "Dune", "Genre": "Science Fiction" },
				{ "IDBook": 2, "Title": "Neuromancer", "Genre": "Cyberpunk" }
			],
			"error": null
		},
		"mysql": {
			"status": 200,
			"timingMs": 22,
			"body": [
				{ "IDBook": 80, "Title": "Dune", "Genre": "Sci-Fi" },
				{ "IDBook": 81, "Title": "Neuromancer", "Genre": "Cyberpunk" }
			],
			"error": null
		},
		"mssql": {
			"status": 0,
			"timingMs": 45,
			"body": null,
			"error": "Connection error: connect ECONNREFUSED 127.0.0.1:8088"
		}
	},
	"differences": [
		{
			"path": "$.error",
			"values": {
				"sqlite": "OK",
				"mysql": "OK",
				"mssql": "Connection error: connect ECONNREFUSED 127.0.0.1:8088"
			}
		},
		{
			"path": "$.body[0].Genre",
			"values": {
				"sqlite": "Science Fiction",
				"mysql": "Sci-Fi"
			}
		}
	],
	"summary": "1 of 3 providers agree. mysql, mssql differ(s) on: error, body[0].Genre"
}
```
