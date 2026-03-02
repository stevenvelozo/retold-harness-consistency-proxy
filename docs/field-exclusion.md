# Field Exclusion

The `ResponseComparator` automatically excludes certain fields from
comparison because they are expected to differ across independent database
instances. This document explains why fields are excluded, which patterns
are matched, how values are normalized, and how array comparison works.

## Why Fields Are Excluded

Each retold-harness backend runs against its own database. When you create
the same record in SQLite and MySQL, the two databases assign different
auto-increment IDs, generate different GUIDs, and stamp different
timestamps. These values are infrastructure artifacts, not business data.

For example, creating a book in both databases might produce:

| Field | SQLite | MySQL |
|-------|--------|-------|
| IDBook | 1 | 50 |
| GUIDBook | `a1b2c3...` | `x9y8z7...` |
| Title | Dune | Dune |
| Genre | Science Fiction | Science Fiction |
| CreateDate | 2024-08-01T10:00:00Z | 2024-08-01T09:58:30Z |
| CreatingIDUser | 0 | 0 |

The `Title` and `Genre` fields are the business data we want to compare.
The `IDBook`, `GUIDBook`, `CreateDate`, and `CreatingIDUser` fields are
expected to differ and should be ignored. Without exclusion, every single
response would report differences on these infrastructure fields, making
the comparison results useless.

## Excluded Field Patterns

The comparator tests each field name against a list of regex patterns. If
any pattern matches, the field is skipped during comparison.

| Pattern | Matches | Examples |
|---------|---------|----------|
| `/^ID[A-Z]/` | Primary key columns that start with `ID` followed by an uppercase letter | `IDBook`, `IDAuthor`, `IDBookAuthorJoin`, `IDGenre` |
| `/^GUID[A-Z]/` | GUID columns that start with `GUID` followed by an uppercase letter | `GUIDBook`, `GUIDAuthor`, `GUIDSession` |
| `/^CreateDate$/` | Exact match on `CreateDate` | `CreateDate` |
| `/^UpdateDate$/` | Exact match on `UpdateDate` | `UpdateDate` |
| `/^DeleteDate$/` | Exact match on `DeleteDate` | `DeleteDate` |
| `/^CreatingIDUser$/` | Exact match on `CreatingIDUser` | `CreatingIDUser` |
| `/^UpdatingIDUser$/` | Exact match on `UpdatingIDUser` | `UpdatingIDUser` |
| `/^DeletingIDUser$/` | Exact match on `DeletingIDUser` | `DeletingIDUser` |

### What Is Not Excluded

Fields that do not match any of the patterns above are always compared.
Some examples of fields that are compared normally:

| Field | Why it is compared |
|-------|--------------------|
| `Title` | Business data |
| `Genre` | Business data |
| `YearPublished` | Business data |
| `Price` | Business data |
| `ID` | Does not match `/^ID[A-Z]/` (no uppercase letter after `ID`) |
| `Id` | Does not match (lowercase `d`) |
| `Identifier` | Does not match (pattern requires `ID` + uppercase letter) |
| `GUID` | Does not match `/^GUID[A-Z]/` (no uppercase letter after `GUID`) |
| `Description` | Does not match any pattern |

## Type Normalization

Databases handle types differently. SQLite might return a number as a
string (`"1965"`) while MySQL returns it as an actual number (`1965`).
The comparator normalizes values before comparison so that these
type-level differences do not produce false positives.

### Normalization Rules

| Input | Normalized Output | Rule |
|-------|-------------------|------|
| `null` | `null` | Null passes through as null. |
| `undefined` | `null` | Undefined is treated as null. |
| `"1965"` | `1965` | Strings that match `/^\-?\d+(\.\d+)?$/` are parsed to numbers. |
| `"3.14"` | `3.14` | Decimal numeric strings are parsed to floats. |
| `"-42"` | `-42` | Negative numeric strings are parsed to numbers. |
| `"Dune"` | `"Dune"` | Non-numeric strings are left unchanged. |
| `""` | `""` | Empty string is left unchanged (not coerced to null). |
| `0` | `0` | Zero is left unchanged (not coerced to null). |
| `false` | `false` | Booleans are left unchanged. |

### Example

Given these two responses:

**SQLite:**
```json
{
	"IDBook": 1,
	"Title": "Dune",
	"YearPublished": "1965",
	"Price": "9.99"
}
```

**MySQL:**
```json
{
	"IDBook": 50,
	"Title": "Dune",
	"YearPublished": 1965,
	"Price": 9.99
}
```

After exclusion and normalization:

- `IDBook` -- excluded (matches `/^ID[A-Z]/`)
- `Title` -- `"Dune"` vs `"Dune"` -- match
- `YearPublished` -- `"1965"` normalizes to `1965`, `1965` stays `1965`
  -- match
- `Price` -- `"9.99"` normalizes to `9.99`, `9.99` stays `9.99` -- match

Result: **consistent**, zero differences.

## Consistency Example With Different IDs

This example shows how two records with completely different
infrastructure fields but identical business data are reported as
consistent:

**SQLite response:**
```json
{
	"IDBook": 1,
	"GUIDBook": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
	"Title": "Neuromancer",
	"Genre": "Cyberpunk",
	"YearPublished": 1984,
	"CreateDate": "2024-08-01T10:00:00.000Z",
	"UpdateDate": "2024-08-01T10:00:00.000Z",
	"DeleteDate": null,
	"CreatingIDUser": 1,
	"UpdatingIDUser": 1,
	"DeletingIDUser": 0
}
```

**MySQL response:**
```json
{
	"IDBook": 203,
	"GUIDBook": "ffffffff-aaaa-bbbb-cccc-dddddddddddd",
	"Title": "Neuromancer",
	"Genre": "Cyberpunk",
	"YearPublished": 1984,
	"CreateDate": "2024-08-01T09:55:12.000Z",
	"UpdateDate": "2024-08-01T09:55:12.000Z",
	"DeleteDate": null,
	"CreatingIDUser": 1,
	"UpdatingIDUser": 1,
	"DeletingIDUser": 0
}
```

**Comparison result:** `consistent: true`, `differences: []`

Every field that differs (`IDBook`, `GUIDBook`, `CreateDate`, `UpdateDate`)
matches an exclusion pattern. The remaining fields (`Title`, `Genre`,
`YearPublished`, `DeleteDate`, plus the audit user fields which are also
excluded) either match or are excluded.

## Array Comparison

When backends return array responses (list endpoints like `GET /1.0/Books`),
the comparator sorts each array before comparing elements.

### Why Sort?

Different databases return records in different default orders. SQLite
might return records by insertion order while MySQL returns them by
primary key. Without sorting, a record at index 0 in one response might
correspond to index 3 in another, producing meaningless per-element
differences.

### Sort Key Selection

The comparator selects a sort key from the first element of the first
array using this priority:

1. **First non-excluded string field** -- scans the object keys in order
   and picks the first field that does not match an exclusion pattern and
   whose value is a non-empty string. For typical Meadow records, this is
   often `Title` or `Name`.

2. **First non-excluded numeric field** -- if no string field is found,
   falls back to the first non-excluded field whose value is a number.

3. **No sort** -- if neither a string nor numeric candidate is found,
   the array is compared in its original order.

### Sort Behavior

- String fields are sorted with `String.localeCompare()`.
- Numeric fields are sorted numerically.
- A shallow copy of each array is sorted; the original response data is
  not modified.

### Element-by-Element Comparison

After sorting, the comparator walks through both arrays up to the minimum
length. For each element at index `i`, every non-excluded field is
compared across providers. Differences are reported with paths like
`$.body[0].Genre`, `$.body[1].Title`, etc.

If the arrays have different lengths, a `$.body.length` difference is
reported first, and only the overlapping portion is compared
element-by-element.

### Array Comparison Example

**SQLite returns (sorted by Title):**
```json
[
	{ "IDBook": 1, "Title": "Dune", "Genre": "Science Fiction" },
	{ "IDBook": 2, "Title": "Neuromancer", "Genre": "Cyberpunk" }
]
```

**MySQL returns (sorted by Title):**
```json
[
	{ "IDBook": 80, "Title": "Dune", "Genre": "Sci-Fi" },
	{ "IDBook": 81, "Title": "Neuromancer", "Genre": "Cyberpunk" }
]
```

After sorting by `Title` and excluding `IDBook`:

- Index 0: `Title` matches, `Genre` differs (`"Science Fiction"` vs
  `"Sci-Fi"`)
- Index 1: `Title` matches, `Genre` matches

Result:

```json
{
	"consistent": false,
	"differences": [
		{
			"path": "$.body[0].Genre",
			"values": { "sqlite": "Science Fiction", "mysql": "Sci-Fi" }
		}
	]
}
```
