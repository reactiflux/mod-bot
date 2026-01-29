# Effect in This Codebase

This document gets you reading and writing Effect code in this codebase. It
covers the patterns we actually use, with references to real files. For a quick
lookup reference, see [EFFECT_REFERENCE.md](./EFFECT_REFERENCE.md).

## Reading Effect Code

### The Mental Model

Effect is like async/await but with:

- **Explicit error types** — errors are part of the type signature, not just
  `throw`
- **Dependency injection built-in** — services are declared as type parameters
  and provided at composition time
- **Composable operations** — everything chains with `.pipe()` and composes with
  `yield*`

The type `Effect.Effect<Success, Error, Requirements>` describes a lazy
computation that:

- Produces a `Success` value
- May fail with an `Error`
- Requires `Requirements` (services) to run

### The Core Pattern

Every Effect operation in this codebase looks like:

```typescript
export const myHandler = (input: Input) =>
  Effect.gen(function* () {
    // 1. Get dependencies
    const service = yield* MyService;

    // 2. Do work (yield* unwraps Effects)
    const result = yield* service.doSomething(input);

    // 3. Return value
    return result;
  }).pipe(
    Effect.provide(DatabaseLayer), // Inject dependencies
    Effect.catchAll((e) => ...), // Handle errors
    Effect.withSpan("myHandler"), // Add tracing
  );
```

### What `yield*` Does

`yield*` is like `await` — it unwraps an Effect and gives you the value:

- `const user = yield* fetchUser(id)` — user is `User`, not `Effect<User>`
- `const db = yield* DatabaseService` — db is the service implementation
- If the Effect fails, execution stops and the error propagates

### The `.pipe()` Pattern

`.pipe()` chains operations left-to-right. Read it top to bottom:

```typescript
someEffect.pipe(
  Effect.map((x) => x + 1), // Transform success value
  Effect.catchAll((e) => ...), // Handle errors
  Effect.withSpan("name"), // Add tracing
);
```

### How to Trace Through Existing Code

When reading a function like `processEscalationEffect` in
`app/commands/escalate/escalationResolver.ts`:

1. Find the `Effect.gen(function* () { ... })` — this is the body
2. Each `yield*` is an async step that can fail
3. Look at the `.pipe(...)` at the end for error handling and tracing
4. Follow `yield* SomeService` to find what services are used
5. Check the calling code for `Effect.provide(...)` to see where dependencies
   come from

## Patterns We Use

### Error Handling

We use tagged errors for type-safe error handling. Each error has a `_tag` field
that TypeScript uses for discrimination:

```typescript
// Define errors (see app/effects/errors.ts)
export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  resource: string;
  id: string;
}> {}
```

Catch specific errors by tag:

```typescript
effect.pipe(
  Effect.catchTag("NotFoundError", (e) =>
    Effect.succeed(defaultValue),
  ),
);
```

Catch all errors uniformly:

```typescript
effect.pipe(
  Effect.catchAll((error) =>
    logEffect("error", "Handler", "Operation failed", {
      error: String(error),
    }),
  ),
);
```

**See:** `app/effects/errors.ts` for all error types

### Parallel Operations

Use `Effect.all` with `withConcurrency("unbounded")` for independent operations:

```typescript
const [settings, reportedUser, guild, channel] = yield* Effect.all([
  fetchSettingsEffect(escalation.guild_id, [SETTINGS.modLog]),
  fetchUserOrNull(client, escalation.reported_user_id),
  fetchGuild(client, escalation.guild_id),
  fetchChannelFromClient<ThreadChannel>(client, escalation.thread_id),
]).pipe(Effect.withConcurrency("unbounded"));
```

**See:** `app/commands/escalate/escalationResolver.ts:94-102`

### Sequential Operations (Rate-Limited)

Use `Effect.forEach` when items must be processed one at a time (e.g., Discord
rate limits):

```typescript
const results = yield* Effect.forEach(due, (escalation) =>
  processEscalationEffect(client, escalation).pipe(
    Effect.catchAll((error) =>
      logEffect("error", "EscalationResolver", "Error processing escalation", {
        escalationId: escalation.id,
        error: String(error),
      }),
    ),
  ),
);
```

**See:** `app/commands/escalate/escalationResolver.ts:186-197`

### Services & Dependency Injection

Services have three parts: an interface, a tag, and a live implementation.

**1. Define the interface:**

```typescript
export interface IEscalationService {
  readonly getEscalation: (
    id: string,
  ) => Effect.Effect<Escalation, NotFoundError | SqlError>;
  // ...
}
```

**2. Create the tag (using class pattern):**

```typescript
export class EscalationService extends Context.Tag("EscalationService")<
  EscalationService,
  IEscalationService
>() {}
```

**3. Implement with Layer.effect:**

```typescript
export const EscalationServiceLive = Layer.effect(
  EscalationService,
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    return {
      getEscalation: (id) =>
        Effect.gen(function* () {
          // implementation using db
        }),
    };
  }),
).pipe(Layer.provide(DatabaseLayer));
```

**4. Use in handlers:**

```typescript
const escalationService = yield* EscalationService;
const votes = yield* escalationService.getVotesForEscalation(escalation.id);
```

**See:** `app/commands/escalate/service.ts` (full service),
`app/Database.ts` (simpler service)

### Observability

**Tracing with `withSpan`:**

```typescript
Effect.withSpan("operationName", {
  attributes: {
    escalationId: escalation.id,
    resolution,
  },
});
```

**Structured logging with `logEffect`:**

```typescript
yield* logEffect("info", "ServiceName", "What happened", {
  key: "contextual data",
});
```

**Annotating the current span:**

```typescript
yield* Effect.annotateCurrentSpan({ processed: due.length });
```

**See:** `app/effects/observability.ts` for `logEffect` and `tapLog`

### Promise Integration

Use `Effect.tryPromise` to wrap external Promise-based APIs:

```typescript
export const fetchGuild = (client: Client, guildId: string) =>
  Effect.tryPromise({
    try: () => client.guilds.fetch(guildId),
    catch: (error) =>
      new DiscordApiError({ operation: "fetchGuild", cause: error }),
  });
```

For cases where failure is acceptable (returns null):

```typescript
export const fetchMemberOrNull = (guild: Guild, userId: string) =>
  Effect.tryPromise({
    try: () => guild.members.fetch(userId),
    catch: () => null,
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));
```

**See:** `app/effects/discordSdk.ts` for all Discord SDK wrappers

## Writing New Code

### Checklist

1. **Define errors** — add to `app/effects/errors.ts` using `Data.TaggedError`
2. **Define service interface** — see `app/commands/escalate/service.ts` for the
   pattern
3. **Implement with `Effect.gen`** — see `escalationResolver.ts` for complex
   examples
4. **Create a Layer** — see `app/Database.ts` for Layer composition
5. **Add observability** — use `Effect.withSpan()` on every public function, use
   `logEffect()` for important events

### Template: New Handler

```typescript
import { Effect } from "effect";
import { DatabaseLayer } from "#~/Database";
import { logEffect } from "#~/effects/observability";

export const handleMyCommand = (input: Input) =>
  Effect.gen(function* () {
    // Get services
    const db = yield* DatabaseService;

    // Do work
    const result = yield* db.selectFrom("table").selectAll().where(...);

    yield* logEffect("info", "MyCommand", "Handled command", {
      inputId: input.id,
    });

    return result;
  }).pipe(
    Effect.catchAll((error) =>
      logEffect("error", "MyCommand", "Command failed", {
        error: String(error),
      }),
    ),
    Effect.withSpan("handleMyCommand"),
    Effect.provide(DatabaseLayer),
  );
```

### Template: New Service

```typescript
import { Context, Effect, Layer } from "effect";
import { DatabaseLayer, DatabaseService } from "#~/Database";

// 1. Interface
export interface IMyService {
  readonly doThing: (id: string) => Effect.Effect<Result, MyError>;
}

// 2. Tag
export class MyService extends Context.Tag("MyService")<
  MyService,
  IMyService
>() {}

// 3. Implementation
export const MyServiceLive = Layer.effect(
  MyService,
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    return {
      doThing: (id) =>
        Effect.gen(function* () {
          // Use db here
        }).pipe(
          Effect.withSpan("doThing", { attributes: { id } }),
        ),
    };
  }),
).pipe(Layer.provide(DatabaseLayer));
```

## Anti-Patterns

### Don't nest `Effect.runPromise`

```typescript
// WRONG — breaks the Effect chain, loses error types
const bad = Effect.gen(function* () {
  const result = yield* Effect.tryPromise(async () => {
    const data = await Effect.runPromise(someEffect);
    return processData(data);
  });
});

// RIGHT — keep everything in the Effect chain
const good = Effect.gen(function* () {
  const data = yield* someEffect;
  return processData(data);
});
```

### Don't create services in business logic

```typescript
// WRONG — bypasses dependency injection
const bad = Effect.gen(function* () {
  const db = new DatabaseService();
  return yield* db.getUser("123");
});

// RIGHT — use yield* to get injected services
const good = Effect.gen(function* () {
  const db = yield* DatabaseService;
  return yield* db.getUser("123");
});
```

### Don't ignore error types

```typescript
// WRONG — swallows all error information
const bad = effect.pipe(
  Effect.catchAll(() => Effect.succeed(null)),
);

// RIGHT — handle errors specifically
const good = effect.pipe(
  Effect.catchTag("NotFoundError", () => Effect.succeed(defaultValue)),
);
```

### Don't wrap pure functions in Effect

```typescript
// WRONG — unnecessary Effect wrapper
const add = (a: number, b: number): Effect.Effect<number> =>
  Effect.succeed(a + b);

// RIGHT — keep pure functions pure
const add = (a: number, b: number): number => a + b;
```

## Model Files

These are the best files to study when learning how Effect is used here:

- **`app/commands/escalate/escalationResolver.ts`** — parallel operations,
  sequential processing, error recovery, span annotations
- **`app/effects/discordSdk.ts`** — Promise wrapping, error mapping,
  null-safe variants
- **`app/commands/escalate/service.ts`** — full service pattern with interface,
  tag, Layer, and dependency injection
- **`app/Database.ts`** — Layer composition, merging independent layers
- **`app/effects/observability.ts`** — `logEffect` and `tapLog` utilities
- **`app/effects/errors.ts`** — `Data.TaggedError` definitions

## Further Reading

Much of the Effect-TS docs are
[online in a compacted form](https://effect.website/llms-small.txt). The
unabridged versions of the documentation are
[indexed here](https://effect.website/llms.txt); you can retrieve a URL with
more detailed information from there.

For patterns not used in this codebase (Streams, Schedules, etc.), see
[EFFECT_ADVANCED.md](./EFFECT_ADVANCED.md).
