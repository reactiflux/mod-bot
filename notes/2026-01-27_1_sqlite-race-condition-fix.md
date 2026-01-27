# SQLite Corruption and Race Condition Fix

## Problem

1. **Race condition in `getOrCreateUserThread`**: Multiple concurrent requests for the same user both passed the existence check and both tried to create threads/insert rows.

2. **Hidden error details**: The Gateway error handler only captured `error.message`, missing the underlying `error.cause` which contained the actual SQLite error.

3. **Invalid datetime defaults**: Several migrations used `.defaultTo("CURRENT_TIMESTAMP")` which created a string literal default instead of the SQL function.

## Evidence from Logs

```
08:21:18.592 - THREAD_CREATE "arkakhass logs" (threadId: ...510373)
08:21:18.775 - THREAD_CREATE "arkakhass logs" (threadId: ...174569)
```
Two threads created 183ms apart for the same user = race condition.

## Solution

### 1. Singleflight Pattern (`app/models/userThreads.ts`)

Added an in-flight request tracker using Effect's `Deferred` and `Ref` primitives:

- Module-level `Ref` tracks in-progress requests by `{guildId}:{userId}` key
- First caller registers a `Deferred`, subsequent callers wait on it
- On completion, all waiters receive the same result
- Cleanup via `Effect.ensuring` removes the key after completion

Key Effect patterns:
- `Deferred.make<ThreadChannel, unknown>()` - resolvable promise
- `Ref.modify()` - atomic check-and-set
- `Deferred.await()` / `Deferred.succeed()` / `Deferred.fail()` - coordination

### 2. Error Logging (`app/discord/gateway.ts`)

Added cause chain extraction for nested errors (Effect SqlError has `cause.cause`):

```typescript
const cause = (error as { cause?: unknown })?.cause;
const rootCause = (cause as { cause?: unknown })?.cause ?? cause;
```

### 3. Migration (`migrations/20260127132155_fix_datetime_defaults.ts`)

Fixed datetime defaults by recreating tables (SQLite doesn't support ALTER COLUMN):

- **user_threads**: Dropped `created_at` column (not useful)
- **reported_messages**: Fixed `created_at` to use `sql\`CURRENT_TIMESTAMP\``
- **guild_subscriptions**: Fixed both `created_at` and `updated_at`

## Verification

Verified schemas after migration:
- `user_threads` no longer has `created_at`
- Other tables show `default CURRENT_TIMESTAMP` (unquoted = SQL function)
