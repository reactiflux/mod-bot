import { Effect, Layer, ManagedRuntime } from "effect";

import { DatabaseLayer, DatabaseService, type EffectKysely } from "#~/Database";
import { NotFoundError } from "#~/effects/errors";

// App layer: database + PostHog + feature flags
// FeatureFlagServiceLive depends on both DatabaseService and PostHogService
const AppLayer = Layer.mergeAll(DatabaseLayer);

// ManagedRuntime keeps the AppLayer scope alive for the process lifetime.
// Unlike Effect.runSync which closes the scope (and thus the SQLite connection)
// after execution, ManagedRuntime holds the scope open until explicit disposal.
export const runtime = ManagedRuntime.make(AppLayer);

// The context type provided by the ManagedRuntime. Use this for typing functions
// that accept effects which need database access.
export type RuntimeContext = ManagedRuntime.ManagedRuntime.Context<
  typeof runtime
>;

// Extract the PostHog client for use by metrics.ts (null when no API key configured).
export const db: EffectKysely = await runtime.runPromise(DatabaseService);

// --- Bridge functions for legacy async/await code ---

// Convenience helpers for legacy async/await code that needs to run
// EffectKysely query builders as Promises.
export const run = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromise(effect);

export const runTakeFirst = <A>(
  effect: Effect.Effect<A[], unknown, never>,
): Promise<A | undefined> =>
  Effect.runPromise(Effect.map(effect, (rows) => rows[0]));

export const runTakeFirstOrThrow = <A>(
  effect: Effect.Effect<A[], unknown, never>,
): Promise<A> =>
  Effect.runPromise(
    Effect.flatMap(effect, (rows) =>
      rows[0] !== undefined
        ? Effect.succeed(rows[0])
        : Effect.fail(new NotFoundError({ resource: "db record", id: "" })),
    ),
  );
