import { Effect } from "effect";

import { TracingLive } from "./tracing.js";

/**
 * Runtime helpers for running Effects in the Promise-based codebase.
 * These provide the bridge between Effect-based code and legacy async/await code.
 *
 * The tracing layer is automatically provided to all effects run through these
 * helpers, so spans created with Effect.withSpan will be exported to Sentry.
 */

/**
 * Run an Effect and return a Promise that resolves with the success value.
 * Automatically provides the tracing layer for Sentry integration.
 * Throws if the Effect fails.
 */
export const runEffect = <A, E>(
  effect: Effect.Effect<A, E, never>,
): Promise<A> => Effect.runPromise(effect.pipe(Effect.provide(TracingLive)));

/**
 * Run an Effect and return a Promise that resolves with an Exit value.
 * Automatically provides the tracing layer for Sentry integration.
 * Never throws - use this when you need to inspect failures.
 */
export const runEffectExit = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(TracingLive)));

/**
 * Run an Effect synchronously.
 * Note: Tracing is not provided for sync execution - use runEffect for traced effects.
 * Only use for Effects that are guaranteed to be synchronous.
 */
export const runEffectSync = <A, E>(effect: Effect.Effect<A, E, never>): A =>
  Effect.runSync(effect);
