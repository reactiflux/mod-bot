import { Effect } from "effect";

/**
 * Minimal runtime helpers for running Effects in the Promise-based codebase.
 * These provide the bridge between Effect-based code and legacy async/await code.
 */

/**
 * Run an Effect and return a Promise that resolves with the success value.
 * Throws if the Effect fails.
 */
export const runEffect = <A, E>(
  effect: Effect.Effect<A, E, never>,
): Promise<A> => Effect.runPromise(effect);

/**
 * Run an Effect and return a Promise that resolves with an Exit value.
 * Never throws - use this when you need to inspect failures.
 */
export const runEffectExit = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromiseExit(effect);

/**
 * Run an Effect synchronously.
 * Only use for Effects that are guaranteed to be synchronous.
 */
export const runEffectSync = <A, E>(effect: Effect.Effect<A, E, never>): A =>
  Effect.runSync(effect);
