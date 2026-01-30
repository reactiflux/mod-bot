# Effect Quick Reference

Quick lookup for patterns used in this codebase. For onboarding and
explanations, see [EFFECT.md](./EFFECT.md). For patterns not used here
(Streams, Schedules, etc.), see [EFFECT_ADVANCED.md](./EFFECT_ADVANCED.md).

## Error Handling

### Defining Errors

All errors use `Data.TaggedError` for type-safe discrimination:

```typescript
import { Data } from "effect";

export class MyError extends Data.TaggedError("MyError")<{
  field: string;
  message: string;
}> {}
```

**File:** `app/effects/errors.ts`

### Our Error Types

| Error                      | Tag                        | Used For                           |
| -------------------------- | -------------------------- | ---------------------------------- |
| `NotFoundError`            | `"NotFoundError"`          | Missing DB records                 |
| `NotAuthorizedError`       | `"NotAuthorizedError"`     | Permission failures                |
| `DiscordApiError`          | `"DiscordApiError"`        | Discord SDK call failures          |
| `StripeApiError`           | `"StripeApiError"`         | Stripe SDK call failures           |
| `ValidationError`          | `"ValidationError"`        | Input validation failures          |
| `ConfigError`              | `"ConfigError"`            | Missing/invalid configuration      |
| `DatabaseCorruptionError`  | `"DatabaseCorruptionError"`| Integrity check failures           |
| `AlreadyResolvedError`     | `"AlreadyResolvedError"`   | Double-resolution attempts         |
| `NoLeaderError`            | `"NoLeaderError"`          | Vote tallying with no clear winner |
| `ResolutionExecutionError` | `"ResolutionExecutionError"`| Mod action execution failures     |
| `SqlError`                 | `"SqlError"`               | Database query failures            |

### catchAll vs catchTag

```typescript
// catchAll — handle any error uniformly
effect.pipe(
  Effect.catchAll((error) => Effect.succeed(fallback)),
);

// catchTag — handle specific error types differently
effect.pipe(
  Effect.catchTag("NotFoundError", (e) =>
    Effect.succeed(defaultValue),
  ),
  Effect.catchTag("SqlError", (e) =>
    logEffect("error", "Handler", "DB error", { error: e.message }),
  ),
);
```

### Error Recovery in Pipelines

```typescript
// Catch and recover inside Effect.forEach or Effect.all
yield* Effect.forEach(items, (item) =>
  processItem(item).pipe(
    Effect.catchAll((error) =>
      logEffect("error", "Handler", "Item failed", {
        itemId: item.id,
        error: String(error),
      }),
    ),
  ),
);
```

## Concurrency

### Parallel: Effect.all + withConcurrency

Use for independent operations that don't depend on each other:

```typescript
const [a, b, c] = yield* Effect.all([
  fetchA(),
  fetchB(),
  fetchC(),
]).pipe(Effect.withConcurrency("unbounded"));
```

### Sequential: Effect.forEach

Default behavior — processes items one at a time. Use when rate limits apply:

```typescript
const results = yield* Effect.forEach(items, (item) =>
  processItem(item),
);
```

### When to Use Which

| Scenario                    | Use                                        |
| --------------------------- | ------------------------------------------ |
| Independent API calls       | `Effect.all` + `withConcurrency`           |
| Discord API calls in a loop | `Effect.forEach` (sequential, rate limits) |
| Operations with deps        | Sequential `yield*` in `Effect.gen`        |

## Services

### Context.Tag Class Pattern

This is the current pattern — use this, not `Context.GenericTag`:

```typescript
export class MyService extends Context.Tag("MyService")<
  MyService,
  IMyService
>() {}
```

### Layer.effect Implementation

```typescript
export const MyServiceLive = Layer.effect(
  MyService,
  Effect.gen(function* () {
    const dep = yield* SomeDependency;
    return {
      method: (arg) =>
        Effect.gen(function* () {
          // use dep
        }).pipe(Effect.withSpan("method")),
    };
  }),
).pipe(Layer.provide(DependencyLayer));
```

### Layer Composition

```typescript
// Merge independent layers
const AppLayer = Layer.mergeAll(LayerA, LayerB, LayerC);

// Chain dependent layers
const ServiceLayer = Layer.effect(MyService, impl).pipe(
  Layer.provide(DependencyLayer),
);
```

**Files:** `app/Database.ts:33-38` (mergeAll), `app/commands/escalate/service.ts:429` (provide)

## Observability

### withSpan

Add to every public function for tracing:

```typescript
myEffect.pipe(
  Effect.withSpan("operationName", {
    attributes: { key: "value" },
  }),
);
```

### logEffect

Structured logging at different levels:

```typescript
yield* logEffect("info", "ServiceName", "What happened", {
  contextKey: "value",
});
// Levels: "debug" | "info" | "warn" | "error"
```

### tapLog

Log without affecting the pipeline value:

```typescript
import { tapLog } from "#~/effects/observability";

const pipeline = fetchUser(id).pipe(
  tapLog("info", "UserService", "User fetched", (user) => ({
    userId: user.id,
  })),
);
```

### annotateCurrentSpan

Add data to the current tracing span:

```typescript
yield* Effect.annotateCurrentSpan({ processed: items.length });
```

**File:** `app/effects/observability.ts`

## Discord SDK Helpers

Wrappers for Discord.js operations that provide consistent error handling.

### Available Functions

| Function                | Returns                            | Error         |
| ----------------------- | ---------------------------------- | ------------- |
| `fetchGuild`            | `Guild`                            | `DiscordApiError` |
| `fetchChannel`          | `Channel \| null`                  | `DiscordApiError` |
| `fetchChannelFromClient`| `T` (generic)                      | `DiscordApiError` |
| `fetchMember`           | `GuildMember`                      | `DiscordApiError` |
| `fetchMemberOrNull`     | `GuildMember \| null`              | never         |
| `fetchUser`             | `User`                             | `DiscordApiError` |
| `fetchUserOrNull`       | `User \| null`                     | never         |
| `fetchMessage`          | `Message`                          | `DiscordApiError` |
| `sendMessage`           | `Message`                          | `DiscordApiError` |
| `editMessage`           | `Message`                          | `DiscordApiError` |
| `forwardMessageSafe`    | `void`                             | never (logs)  |
| `replyAndForwardSafe`   | `Message \| null`                  | never (logs)  |
| `resolveMessagePartial` | `Message`                          | `DiscordApiError` |

### Pattern: Adding a New Helper

Follow the existing pattern — wrap with `tryPromise`, map error to `DiscordApiError`:

```typescript
export const myNewHelper = (guild: Guild, arg: string) =>
  Effect.tryPromise({
    try: () => guild.someMethod(arg),
    catch: (error) =>
      new DiscordApiError({ operation: "myNewHelper", cause: error }),
  });
```

For null-safe variants, catch and return null:

```typescript
export const myNewHelperOrNull = (guild: Guild, arg: string) =>
  Effect.tryPromise({
    try: () => guild.someMethod(arg),
    catch: () => null,
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));
```

**File:** `app/effects/discordSdk.ts`

## Database Patterns

### DatabaseService

The database is an effectified Kysely instance provided as a service:

```typescript
export class DatabaseService extends Context.Tag("DatabaseService")<
  DatabaseService,
  EffectKysely
>() {}
```

### Querying

```typescript
const db = yield* DatabaseService;

// Select
const rows = yield* db
  .selectFrom("table")
  .selectAll()
  .where("column", "=", value);

// Insert
yield* db.insertInto("table").values({ ... });

// Update
yield* db
  .updateTable("table")
  .set({ column: newValue })
  .where("id", "=", id);

// Delete
yield* db
  .deleteFrom("table")
  .where("id", "=", id);
```

### Layer Setup

```typescript
// Base SQLite client
const SqliteLive = SqliteClient.layer({ filename: databaseUrl });

// Kysely service on top of SQLite
const KyselyLive = Layer.effect(DatabaseService, Sqlite.make<DB>()).pipe(
  Layer.provide(SqliteLive),
);

// Combined layer provides both
export const DatabaseLayer = Layer.mergeAll(SqliteLive, KyselyLive);
```

**File:** `app/Database.ts`

## Effect Constructors Quick Reference

| Need              | Use                 | Example                               |
| ----------------- | ------------------- | ------------------------------------- |
| Pure value        | `Effect.succeed`    | `Effect.succeed(42)`                  |
| Pure error        | `Effect.fail`       | `Effect.fail(new MyError(...))`       |
| Sync side effect  | `Effect.sync`       | `Effect.sync(() => Date.now())`       |
| Async side effect | `Effect.tryPromise` | `Effect.tryPromise({ try, catch })`   |
| Generator body    | `Effect.gen`        | `Effect.gen(function* () { ... })`    |
| Do nothing        | `Effect.void`       | `Effect.void`                         |
