# JSON Extraction Fix in fetchSettings

## Problem

The `fetchSettings` function was experiencing JSON parse errors: `"[object Object]" is not valid JSON`.

## Root Cause

The function used SQLite's `->` operator for JSON extraction, combined with Kysely's `ParseJSONResultsPlugin`:

- `->` operator returns JSON text (strings include quotes: `"925847644318879754"`)
- `ParseJSONResultsPlugin` only parses values starting with `{` or `[`
- String values weren't parsed by the plugin, so `JSON.parse()` was needed
- Non-string values (objects, arrays) WERE parsed by the plugin, causing double-parsing errors

## Solution

Changed from `->` to `->>` operator:

```typescript
// Before: returns JSON text, requires JSON.parse for strings
eb.ref("settings", "->").key(k).as(k)

// After: returns extracted value directly, no parsing needed
eb.ref("settings", "->>").key(k).as(k)
```

SQLite operators:
- `->` returns the value as JSON text
- `->>` returns the value as SQL text/number (extracted value)

## Files Modified

- `app/models/guilds.server.ts` - Changed `->` to `->>` and removed `JSON.parse()`
