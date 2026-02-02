# Database Migration: db.server.ts -> Database.ts

## What changed

All database access now flows through a single `ManagedRuntime` in `Database.ts`.
The old `db.server.ts` file was deleted.

### Key architectural changes

1. **Database.ts** now exports everything: `runtime`, `db`, `run`, `runTakeFirst`,
   `runTakeFirstOrThrow`, `shutdownDatabase`, `DB` type, `RuntimeContext` type
2. **effects/runtime.ts** `runEffect`/`runEffectExit` now use `runtime.runPromise()`
   instead of `Effect.runPromise()`. This means database services are automatically
   provided to all effects run through `runEffect`.
3. **Handler type** changed from `Effect<void, never, never>` to
   `Effect<void, never, RuntimeContext>` — handlers no longer need to provide
   `DatabaseLayer` themselves.
4. **EscalationServiceLive** no longer has `Layer.provide(DatabaseLayer)` — it gets
   DatabaseService from the runtime when provided via `Effect.provide(EscalationServiceLive)`.

### Important for future code

- **Don't** use `Effect.provide(DatabaseLayer)` in handlers — the runtime handles it
- **Do** use `yield* DatabaseService` to get the db in Effect code
- **Do** use bridge functions (`db`, `run`, `runTakeFirst`, etc.) for legacy async code
- Both paths use the same single SQLite connection via the ManagedRuntime
