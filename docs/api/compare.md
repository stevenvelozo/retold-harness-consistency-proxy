# ResponseComparator.compare()

## Signature

```javascript
tmpFable.ResponseComparator.compare(pResults)
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pResults` | `object` | Yes | Map of `{ providerKey: { status, headers, body, timingMs, error } }` as produced by `RequestFanout.fanout()` |

## Returns

| Type | Description |
|------|-------------|
| `object` | A comparison report object |

### Comparison Report

| Field | Type | Description |
|-------|------|-------------|
| `consistent` | `boolean` | `true` if all providers agree on status and body content, `false` otherwise |
| `providerCount` | `number` | Total number of providers in the results |
| `differences` | `Array` | Array of difference objects (empty when consistent) |
| `summary` | `string` | Human-readable summary of the comparison outcome |

### Difference Object

Each entry in the `differences` array has the following shape:

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | JSONPath-style location of the difference (e.g., `'$.body.Title'`, `'$.body[0].Author'`, `'$.status'`, `'$.error'`) |
| `values` | `object` | Map of `{ providerKey: value }` showing each provider's value at that path |

## Description

Compares responses from multiple providers and produces a consistency report. This is the core analysis engine of the consistency proxy, designed to identify meaningful differences while ignoring auto-generated fields that naturally vary between database providers.

### Comparison Algorithm

The comparison proceeds through several stages:

#### 1. Edge Cases

- **Zero providers:** Returns `{ consistent: true, providerCount: 0, summary: 'No providers to compare' }`.
- **One provider:** Returns `{ consistent: true, providerCount: 1, summary: 'Only 1 provider (<name>), nothing to compare' }`.

#### 2. Error Detection

Providers that returned an `error` value (non-null) are separated from live providers. If any provider errored, a difference is recorded at `'$.error'` with values showing the error message for failing providers and `'OK'` for successful ones.

#### 3. Status Code Comparison

Among live (non-error) providers, HTTP status codes are compared. If any status codes differ, a difference is recorded at `'$.status'`.

#### 4. Response Body Comparison

The body comparison strategy depends on the detected response type of the first live provider:

| Response Type | Detection Logic | Comparison Strategy |
|---------------|-----------------|---------------------|
| **Array** | `Array.isArray(body)` is `true` | Array length comparison, then element-by-element field comparison after sorting |
| **Count Object** | `body` is an object with a `Count` property | Direct comparison of the `Count` value |
| **Object** | `body` is a non-array object without `Count` | Field-by-field comparison across all providers |
| **Scalar** | Everything else (strings, numbers, booleans, null) | Direct value comparison |

### Excluded Fields

The following fields are excluded from comparison because they contain auto-generated values that naturally differ between database providers:

| Pattern | Example Matches |
|---------|-----------------|
| `/^ID[A-Z]/` | `IDBook`, `IDAuthor`, `IDBookAuthorJoin` |
| `/^GUID[A-Z]/` | `GUIDBook`, `GUIDAuthor` |
| `/^CreateDate$/` | `CreateDate` |
| `/^UpdateDate$/` | `UpdateDate` |
| `/^DeleteDate$/` | `DeleteDate` |
| `/^CreatingIDUser$/` | `CreatingIDUser` |
| `/^UpdatingIDUser$/` | `UpdatingIDUser` |
| `/^DeletingIDUser$/` | `DeletingIDUser` |

These patterns match the standard Meadow entity metadata columns. Fields like `ID` (exact match, no uppercase letter following) are **not** excluded.

### Value Normalization

Before comparison, values are normalized to handle type coercion differences between database drivers:

| Input | Normalized To |
|-------|---------------|
| `null` | `null` |
| `undefined` | `null` |
| `"19.99"` (numeric string) | `19.99` (number) |
| `"-7"` (negative numeric string) | `-7` (number) |
| `"hello"` (non-numeric string) | `"hello"` (unchanged) |
| `42` (number) | `42` (unchanged) |

This normalization ensures that `"19.99"` from one database and `19.99` from another are treated as equal.

### Array Comparison Details

When the response body is an array (e.g., a list of records from a Reads endpoint):

1. **Length comparison** -- If arrays differ in length, a difference is recorded at `'$.body.length'`.
2. **Sorting** -- Each provider's array is sorted by the first non-excluded string field found in the first element. If no string field is found, the first non-excluded numeric field is used. This produces a stable ordering for element-by-element comparison regardless of database-specific ordering.
3. **Element comparison** -- The minimum array length across all providers is used. For each index up to that minimum, every non-excluded field is compared across providers using normalized values. Differences are recorded as `'$.body[<index>].<fieldName>'`.

### Summary Generation

The summary string uses a majority/minority voting system:

- If no differences exist: `"All <N> providers agree"`
- If all providers errored: `"All <N> providers returned errors"`
- If differences exist: The method identifies which providers hold minority values for each difference. The summary reports the count of agreeing providers and lists the differing providers along with up to 5 difference paths. If there are more than 5 differences, `"(+N more)"` is appended.

Example summaries:
- `"All 3 providers agree"`
- `"2 of 3 providers agree. mongodb differ(s) on: body.Count"`
- `"2 of 3 providers agree. mssql differ(s) on: body.Title, body.Price (+3 more)"`

## Examples

### Consistent results

```javascript
let tmpResults =
{
	sqlite:
	{
		status: 200,
		headers: {},
		body: { Count: 5 },
		timingMs: 12,
		error: null
	},
	mysql:
	{
		status: 200,
		headers: {},
		body: { Count: 5 },
		timingMs: 18,
		error: null
	}
};

let tmpReport = tmpFable.ResponseComparator.compare(tmpResults);

console.log(tmpReport.consistent);  // true
console.log(tmpReport.summary);     // "All 2 providers agree"
console.log(tmpReport.differences); // []
```

### Inconsistent count

```javascript
let tmpResults =
{
	sqlite:
	{
		status: 200,
		headers: {},
		body: { Count: 5 },
		timingMs: 12,
		error: null
	},
	mysql:
	{
		status: 200,
		headers: {},
		body: { Count: 5 },
		timingMs: 18,
		error: null
	},
	mongodb:
	{
		status: 200,
		headers: {},
		body: { Count: 4 },
		timingMs: 25,
		error: null
	}
};

let tmpReport = tmpFable.ResponseComparator.compare(tmpResults);

console.log(tmpReport.consistent);  // false
console.log(tmpReport.summary);     // "2 of 3 providers agree. mongodb differ(s) on: body.Count"
console.log(tmpReport.differences);
// [
//   {
//     path: '$.body.Count',
//     values: { sqlite: 5, mysql: 5, mongodb: 4 }
//   }
// ]
```

### Mixed errors and successes

```javascript
let tmpResults =
{
	sqlite:
	{
		status: 200,
		headers: {},
		body: { Count: 5 },
		timingMs: 12,
		error: null
	},
	mongodb:
	{
		status: 0,
		headers: {},
		body: null,
		timingMs: 10001,
		error: 'Request timed out after 10000ms'
	}
};

let tmpReport = tmpFable.ResponseComparator.compare(tmpResults);

console.log(tmpReport.consistent);  // false
console.log(tmpReport.differences);
// [
//   {
//     path: '$.error',
//     values: { sqlite: 'OK', mongodb: 'Request timed out after 10000ms' }
//   }
// ]
```

### Object field comparison with excluded fields

```javascript
let tmpResults =
{
	sqlite:
	{
		status: 200,
		headers: {},
		body:
		{
			IDBook: 1,
			GUIDBook: 'abc-123',
			Title: 'Dune',
			Price: '19.99',
			CreateDate: '2026-01-01',
			UpdatingIDUser: 0
		},
		timingMs: 10,
		error: null
	},
	mysql:
	{
		status: 200,
		headers: {},
		body:
		{
			IDBook: 42,
			GUIDBook: 'xyz-789',
			Title: 'Dune',
			Price: 19.99,
			CreateDate: '2026-01-02',
			UpdatingIDUser: 0
		},
		timingMs: 15,
		error: null
	}
};

let tmpReport = tmpFable.ResponseComparator.compare(tmpResults);

// IDBook, GUIDBook, CreateDate, and UpdatingIDUser are excluded from comparison.
// Price "19.99" (string) normalizes to 19.99 (number), matching mysql.
console.log(tmpReport.consistent);  // true
console.log(tmpReport.summary);     // "All 2 providers agree"
```

## Notes

- The `pResults` parameter should be the same object produced by `RequestFanout.fanout()`. The comparator reads `status`, `body`, and `error` from each provider result.
- The `headers` and `timingMs` fields in each result are not compared. Only `status`, `body`, and `error` participate in the consistency check.
- Excluded field patterns use regex matching. The pattern `/^ID[A-Z]/` requires an uppercase letter after `ID`, so a field named `ID` (alone) or `Id` would not be excluded.
- Normalization is applied before comparison but the original values are preserved in the `differences` output. This means difference reports show the raw values from each provider, not the normalized forms.
- Array sorting uses `String.localeCompare()` for string fields and numeric subtraction for numeric fields, ensuring stable cross-provider ordering.
- The `consistent` field is `true` if and only if the `differences` array is empty.
