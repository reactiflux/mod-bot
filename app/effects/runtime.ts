import { Effect, Layer, Logger } from "effect";

import { TracingLive } from "./tracing.js";

/**
 * Runtime helpers for running Effects in the Promise-based codebase.
 * These provide the bridge between Effect-based code and legacy async/await code.
 *
 * The runtime layer includes:
 * - TracingLive: Exports spans to Sentry via OpenTelemetry
 * - LoggerLive: Structured JSON logging to stdout
 *
 * All effects run through these helpers get both tracing and logging automatically.
 */

/**
 * Combined runtime layer providing tracing and logging.
 * TracingLive is a NodeSdk layer that needs to be provided first,
 * LoggerLive is a simple logger replacement layer.
 */
const RuntimeLive = Layer.merge(TracingLive, Logger.json);

/**
 * Run an Effect and return a Promise that resolves with the success value.
 * Automatically provides tracing (Sentry) and logging (JSON to stdout).
 * Throws if the Effect fails.
 */
export const runEffect = <A, E>(
  effect: Effect.Effect<A, E, never>,
): Promise<A> => Effect.runPromise(effect.pipe(Effect.provide(RuntimeLive)));

/**
 * Run an Effect and return a Promise that resolves with an Exit value.
 * Automatically provides tracing (Sentry) and logging (JSON to stdout).
 * Never throws - use this when you need to inspect failures.
 */
export const runEffectExit = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(RuntimeLive)));

/**
 * Run an Effect synchronously.
 * Note: Tracing and logging layers are not provided for sync execution.
 * Use runEffect for effects that need tracing/logging.
 * Only use for Effects that are guaranteed to be synchronous.
 */
export const runEffectSync = <A, E>(effect: Effect.Effect<A, E, never>): A =>
  Effect.runSync(effect);
