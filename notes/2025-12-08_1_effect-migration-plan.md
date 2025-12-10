# Effect-TS Migration Plan

A gradual strategy for adopting Effect-TS in the mod-bot codebase to improve error
handling, async composition, and observability.

## Current State Assessment

### What Exists Today

- **Async patterns**: Promise-based with try/catch blocks, `Promise.all()` for
  parallelism, `.catch(() => undefined)` for silent failures
- **Error handling**: Untyped exceptions, inconsistent recovery strategies,
  `trackPerformance()` for Sentry spans
- **Dependency management**: Global singletons (`client`, `db`), manual wiring
- **Observability**: `log()` helper + `trackPerformance()` wrapper for Sentry

### Key Pain Points

1. **Escalation resolver** (`app/discord/escalationResolver.ts`) - 240 lines of
   nested try/catch with 7+ failure points
2. **modLog** (`app/helpers/modLog.ts`) - 350 lines of complex async orchestration
   (thread creation, Discord API, DB writes)
3. **Stripe service** (`app/models/stripe.server.ts`) - External API with manual
   error logging and Sentry capture
4. **Gateway startup** (`app/discord/gateway.ts`) - `Promise.all()` coordination
   without structured error handling

### What's Already Prepared

- `notes/EFFECT.md` - Service implementation checklist
- `notes/EFFECT_REFERENCE.md` - Effect API decision guide
- Existing `trackPerformance()` can wrap Effect spans

---

## Migration Strategy: Greenfield-First, Then Extract

Rather than rewriting existing code, **introduce Effect for new functionality**
and gradually extract common patterns into Effect services.

### Phase 0: Foundation Setup (Do First)

**Goal**: Install Effect and establish conventions without touching existing code.

1. **Add dependencies**:

   ```bash
   npm install effect @effect/schema
   ```

2. **Create base error types** (`app/effects/errors.ts`):

   ```typescript
   import { Data } from "effect";

   // Tagged error types for discriminated unions
   export class DiscordApiError extends Data.TaggedError("DiscordApiError")<{
     operation: string;
     discordError: unknown;
   }> {}

   export class DatabaseError extends Data.TaggedError("DatabaseError")<{
     operation: string;
     cause: unknown;
   }> {}

   export class StripeApiError extends Data.TaggedError("StripeApiError")<{
     operation: string;
     stripeError: unknown;
   }> {}

   export class NotFoundError extends Data.TaggedError("NotFoundError")<{
     resource: string;
     id: string;
   }> {}

   export class ValidationError extends Data.TaggedError("ValidationError")<{
     field: string;
     message: string;
   }> {}

   export class ConfigError extends Data.TaggedError("ConfigError")<{
     key: string;
     message: string;
   }> {}
   ```

3. **Create Effect runtime** (`app/effects/runtime.ts`):

   ```typescript
   import { Effect, Layer, Runtime } from "effect";

   // Minimal runtime for running effects in the Promise-based codebase
   export const runEffect = <A, E>(
     effect: Effect.Effect<A, E, never>,
   ): Promise<A> => Effect.runPromise(effect);

   export const runEffectExit = <A, E>(effect: Effect.Effect<A, E, never>) =>
     Effect.runPromiseExit(effect);
   ```

4. **Create observability bridge** (`app/effects/observability.ts`):

   ```typescript
   import { Effect } from "effect";

   import {
     log as legacyLog,
     trackPerformance,
   } from "#~/helpers/observability";

   // Bridge Effect logging to existing observability
   export const logEffect = (
     level: "debug" | "info" | "warn" | "error",
     service: string,
     message: string,
     context: Record<string, unknown> = {},
   ) => Effect.sync(() => legacyLog(level, service, message, context));

   // Wrap Effect in Sentry span
   export const withSpan = <A, E, R>(
     name: string,
     effect: Effect.Effect<A, E, R>,
     context: Record<string, unknown> = {},
   ): Effect.Effect<A, E, R> =>
     Effect.suspend(() =>
       trackPerformance(
         name,
         () => Effect.runPromise(effect as Effect.Effect<A, E, never>),
         context,
       ),
     ) as unknown as Effect.Effect<A, E, R>;
   ```

---

### Phase 1: Database Service Layer

**Goal**: Wrap Kysely operations in Effect for typed errors and composability.

**Why start here**: Database operations are foundational, relatively simple, and
used everywhere. Converting them provides immediate value and establishes patterns.

1. **Create Database Service** (`app/effects/services/Database.ts`):

   ```typescript
   import { Context, Effect, Layer } from "effect";

   import db from "#~/db.server";

   import { DatabaseError } from "../errors";

   export interface IDatabaseService {
     readonly query: <T>(
       fn: () => Promise<T>,
       operation: string,
     ) => Effect.Effect<T, DatabaseError, never>;
   }

   export class DatabaseService extends Context.Tag("DatabaseService")<
     DatabaseService,
     IDatabaseService
   >() {}

   export const DatabaseServiceLive = Layer.succeed(DatabaseService, {
     query: <T>(fn: () => Promise<T>, operation: string) =>
       Effect.tryPromise({
         try: fn,
         catch: (error) => new DatabaseError({ operation, cause: error }),
       }),
   });
   ```

2. **Convert one model at a time**, starting with simpler ones:
   - `app/models/userThreads.server.ts` (smallest, ~50 lines)
   - `app/models/escalationVotes.server.ts` (used by escalation resolver)
   - `app/models/reportedMessages.server.ts` (has constraint error handling)
   - `app/models/guilds.server.ts` (settings access)

3. **Pattern for converted model**:

   ```typescript
   // Before: app/models/userThreads.server.ts
   export const getUserThread = async (userId: string, guildId: string) => {
     return db.selectFrom("user_threads").where(...).executeTakeFirst();
   };

   // After: app/effects/models/userThreads.ts
   export const getUserThread = (userId: string, guildId: string) =>
     Effect.gen(function* () {
       const db = yield* DatabaseService;
       return yield* db.query(
         () => kysely.selectFrom("user_threads").where(...).executeTakeFirst(),
         "getUserThread",
       );
     });
   ```

4. **Keep legacy exports** for gradual adoption:
   ```typescript
   // Legacy wrapper for existing callers
   export const getUserThreadLegacy = (userId: string, guildId: string) =>
     runEffect(getUserThread(userId, guildId));
   ```

---

### Phase 2: Discord API Service

**Goal**: Wrap Discord.js operations with retry logic and typed errors.

1. **Create Discord Service** (`app/effects/services/Discord.ts`):

   ```typescript
   import type {
     Guild,
     GuildMember,
     TextChannel,
     ThreadChannel,
   } from "discord.js";
   import { Context, Effect, Layer, Schedule } from "effect";

   import { DiscordApiError, NotFoundError } from "../errors";

   export interface IDiscordService {
     readonly fetchGuild: (
       guildId: string,
     ) => Effect.Effect<Guild, DiscordApiError | NotFoundError, never>;

     readonly fetchMember: (
       guild: Guild,
       userId: string,
     ) => Effect.Effect<GuildMember | null, DiscordApiError, never>;

     readonly fetchChannel: <T extends TextChannel | ThreadChannel>(
       channelId: string,
     ) => Effect.Effect<T, DiscordApiError | NotFoundError, never>;

     readonly sendMessage: (
       channel: TextChannel | ThreadChannel,
       content: string,
     ) => Effect.Effect<Message, DiscordApiError, never>;

     // Mod actions with retry
     readonly kick: (
       member: GuildMember,
       reason?: string,
     ) => Effect.Effect<void, DiscordApiError, never>;

     readonly ban: (
       member: GuildMember,
       reason?: string,
     ) => Effect.Effect<void, DiscordApiError, never>;

     readonly timeout: (
       member: GuildMember,
       duration: number,
     ) => Effect.Effect<void, DiscordApiError, never>;
   }

   export class DiscordService extends Context.Tag("DiscordService")<
     DiscordService,
     IDiscordService
   >() {}

   // Retry policy for transient Discord failures
   const discordRetry = Schedule.exponential("100 millis").pipe(
     Schedule.jittered,
     Schedule.compose(Schedule.recurs(3)),
   );

   export const makeDiscordServiceLive = (client: Client) =>
     Layer.succeed(DiscordService, {
       fetchGuild: (guildId) =>
         Effect.tryPromise({
           try: () => client.guilds.fetch(guildId),
           catch: (e) =>
             new DiscordApiError({ operation: "fetchGuild", discordError: e }),
         }),

       fetchMember: (guild, userId) =>
         Effect.tryPromise({
           try: () => guild.members.fetch(userId).catch(() => null),
           catch: (e) =>
             new DiscordApiError({ operation: "fetchMember", discordError: e }),
         }),

       kick: (member, reason) =>
         Effect.tryPromise({
           try: () => member.kick(reason),
           catch: (e) =>
             new DiscordApiError({ operation: "kick", discordError: e }),
         }).pipe(Effect.retry(discordRetry)),

       // ... other methods
     });
   ```

2. **Convert `app/models/discord.server.ts`** actions to use DiscordService

3. **Update escalation controls** to use Effect-based mod actions

---

### Phase 3: Stripe Service (Effect-Native)

**Goal**: Replace existing Stripe service with fully Effect-based implementation.

The current `StripeService` is well-structured but has manual error handling.
Convert to Effect for:

- Typed `StripeApiError` instead of generic throws
- Composable retry policies for rate limits
- Automatic Sentry integration via Effect spans

```typescript
// app/effects/services/Stripe.ts
import { Context, Effect, Layer, Schedule } from "effect";
import Stripe from "stripe";

import { ConfigError, NotFoundError, StripeApiError } from "../errors";

export interface IStripeService {
  readonly createCheckoutSession: (params: {
    variant: string;
    coupon: string;
    guildId: string;
    baseUrl: string;
    customerEmail?: string;
  }) => Effect.Effect<
    string,
    StripeApiError | NotFoundError | ConfigError,
    never
  >;

  readonly verifyCheckoutSession: (
    sessionId: string,
  ) => Effect.Effect<CheckoutResult | null, StripeApiError, never>;

  readonly cancelSubscription: (
    subscriptionId: string,
  ) => Effect.Effect<boolean, StripeApiError, never>;

  readonly constructWebhookEvent: (
    payload: string | Buffer,
    signature: string,
  ) => Effect.Effect<Stripe.Event, StripeApiError | ConfigError, never>;
}

// Rate limit retry policy
const stripeRetry = Schedule.exponential("500 millis").pipe(
  Schedule.jittered,
  Schedule.compose(Schedule.recurs(3)),
  Schedule.whileInput(
    (error: StripeApiError) =>
      // Only retry rate limit errors
      error.stripeError instanceof Stripe.errors.StripeRateLimitError,
  ),
);
```

---

### Phase 4: Escalation Resolver (Full Effect Rewrite)

**Goal**: Demonstrate full Effect power on the most complex async flow.

This is the highest-value target: 240 lines of nested async with 7+ error points.

```typescript
// app/effects/escalationResolver.ts
import { Effect, Schedule } from "effect";

import { DatabaseError, DiscordApiError } from "./errors";
import { DatabaseService } from "./services/Database";
import { DiscordService } from "./services/Discord";

// Domain errors specific to escalation
export class EscalationNotFoundError extends Data.TaggedError(
  "EscalationNotFoundError",
)<{
  escalationId: number;
}> {}

export class MemberNotFoundError extends Data.TaggedError(
  "MemberNotFoundError",
)<{
  userId: string;
  guildId: string;
}> {}

// Pure business logic - no effects
const determineResolution = (
  tally: VoteTally,
  flags: EscalationFlags,
): Resolution => {
  if (tally.totalVotes === 0) return resolutions.track;
  if (tally.isTied) return resolutions.track;
  if (tally.leader) return tally.leader;
  return resolutions.track;
};

// Composed Effect workflow
export const executeScheduledResolution = (
  escalation: Escalation,
  resolution: Resolution,
) =>
  Effect.gen(function* () {
    const discord = yield* DiscordService;
    const db = yield* DatabaseService;

    // Parallel fetch of guild and channel
    const [guild, channel] = yield* Effect.all(
      [
        discord.fetchGuild(escalation.guild_id),
        discord.fetchChannel<ThreadChannel>(escalation.thread_id),
      ],
      { concurrency: "unbounded" },
    );

    // Member fetch (nullable)
    const member = yield* discord.fetchMember(
      guild,
      escalation.reported_user_id,
    );
    if (!member) {
      yield* logEffect("debug", "EscalationResolver", "Member not found");
      return;
    }

    // Execute the resolution action
    yield* executeResolutionAction(member, resolution);

    // Mark resolved in database
    yield* db.query(
      () => resolveEscalationDb(escalation.id, resolution),
      "resolveEscalation",
    );

    // Post reply (non-critical, catch and log)
    yield* postResolutionReply(channel, escalation, resolution, member).pipe(
      Effect.catchTag("DiscordApiError", (e) =>
        logEffect("warn", "EscalationResolver", "Failed to post reply", {
          error: e,
        }),
      ),
    );
  });

// Scheduled checker
export const checkPendingEscalations = Effect.gen(function* () {
  const db = yield* DatabaseService;

  const pending = yield* db.query(
    () => getPendingEscalationsDb(),
    "getPendingEscalations",
  );

  yield* Effect.forEach(
    pending,
    (escalation) =>
      processEscalation(escalation).pipe(
        Effect.catchAll((error) =>
          logEffect("error", "EscalationResolver", "Failed to process", {
            escalationId: escalation.id,
            error,
          }),
        ),
      ),
    { concurrency: 1 }, // Process sequentially
  );
});
```

---

### Phase 5: modLog Refactor

**Goal**: Convert the complex report flow to Effect composition.

The `reportUser` function in `helpers/modLog.ts` orchestrates:

1. Check existing reports
2. Get/create user thread
3. Construct log message
4. Send to Discord
5. Record in database
6. Forward to mod log channel

Effect benefits:

- Clear sequential vs parallel operations
- Typed errors at each step
- Retry logic for Discord API calls
- Resource cleanup (thread creation)

---

### Phase 6: Gateway & Lifecycle

**Goal**: Use Effect for service initialization and graceful shutdown.

```typescript
// app/effects/gateway.ts
import { Effect, Layer, Runtime } from "effect";

const startupSequence = Effect.gen(function* () {
  yield* logEffect("info", "Gateway", "Starting services");

  // Parallel initialization of independent services
  yield* Effect.all(
    [initAutomod, initActivityTracker, initReactjiChanneler, deployCommands],
    { concurrency: "unbounded" },
  );

  // Sequential start of dependent services
  yield* startEscalationResolver;

  yield* logEffect("info", "Gateway", "All services started");
});

// Graceful shutdown
const shutdownSequence = Effect.gen(function* () {
  yield* stopEscalationResolver;
  yield* stopActivityTracker;
  yield* logEffect("info", "Gateway", "Shutdown complete");
});
```

---

## File Structure After Migration

```
app/
├── effects/
│   ├── errors.ts              # Tagged error types
│   ├── runtime.ts             # Effect runtime helpers
│   ├── observability.ts       # Bridge to existing logging/Sentry
│   ├── services/
│   │   ├── Database.ts        # Kysely wrapper
│   │   ├── Discord.ts         # Discord.js wrapper
│   │   ├── Stripe.ts          # Stripe API wrapper
│   │   └── Config.ts          # Environment config
│   ├── models/                # Effect-based data access
│   │   ├── userThreads.ts
│   │   ├── escalationVotes.ts
│   │   ├── reportedMessages.ts
│   │   └── guilds.ts
│   └── workflows/             # Complex business flows
│       ├── escalationResolver.ts
│       ├── modLog.ts
│       └── gateway.ts
├── models/                    # Legacy models (gradually deprecated)
├── helpers/                   # Legacy helpers
└── ...
```

---

## Migration Checklist Per Module

For each module migrated:

- [ ] Define domain-specific error types with `_tag` discriminators
- [ ] Create service interface with Effect return types
- [ ] Implement service with `Effect.tryPromise` for async operations
- [ ] Add retry policies where appropriate (external APIs)
- [ ] Keep legacy wrapper for backward compatibility
- [ ] Update one caller at a time
- [ ] Remove legacy wrapper once all callers migrated
- [ ] Add tests for error scenarios

---

## Success Metrics

After migration, measure:

1. **Error observability**: All errors have typed `_tag` for Sentry grouping
2. **Retry coverage**: External API calls have appropriate retry policies
3. **Code reduction**: Complex async flows simplified via Effect composition
4. **Test coverage**: Error paths testable via `Effect.runPromiseExit`

---

## Timeline Recommendation

| Phase | Scope      | Notes                             |
| ----- | ---------- | --------------------------------- |
| 0     | Foundation | Do immediately, no risk           |
| 1     | Database   | Low risk, high reuse              |
| 2     | Discord    | Medium complexity                 |
| 3     | Stripe     | Isolated, easy to test            |
| 4     | Escalation | Highest value, validates approach |
| 5     | modLog     | Second complex workflow           |
| 6     | Gateway    | Final integration                 |

Start with Phase 0-1 to validate the approach, then proceed based on comfort level.
