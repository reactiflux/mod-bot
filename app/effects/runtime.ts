import { Effect, Layer, Logger, LogLevel } from "effect";

import { runtime, type RuntimeContext } from "#~/Database.js";
import { isProd } from "#~/helpers/env.server.js";
import { log } from "#~/helpers/observability.js";

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
 *
 * Database access is provided by the ManagedRuntime from Database.ts, which holds
 * a single SQLite connection open for the process lifetime.
 */

/**
 * Combined runtime layer providing tracing and logging.
 * TracingLive is a NodeSdk layer that needs to be provided first,
 * LoggerLive is a simple logger replacement layer.
 */
const RuntimeLive = Layer.merge(TracingLive, Logger.json);

/**
 * Run an Effect and return a Promise that resolves with the success value.
 * Automatically provides tracing (Sentry), logging (JSON to stdout), and
 * database access (via the ManagedRuntime).
 * Throws if the Effect fails.
 */
export const runEffect = async <A, E>(
  effect: Effect.Effect<A, E, RuntimeContext>,
): Promise<A> => {
  try {
    const program = effect.pipe(Effect.provide(RuntimeLive));
    return runtime.runPromise(
      isProd()
        ? program.pipe(Logger.withMinimumLogLevel(LogLevel.Info))
        : program,
    );
  } catch (error) {
    log("error", "runtime", "Caught an error while executing Effect", {
      error,
    });
    throw error;
  }
};

/**
 * Run an Effect and return a Promise that resolves with an Exit value.
 * Automatically provides tracing (Sentry), logging (JSON to stdout), and
 * database access (via the ManagedRuntime).
 * Never throws - use this when you need to inspect failures.
 */
export const runEffectExit = <A, E>(
  effect: Effect.Effect<A, E, RuntimeContext>,
) => runtime.runPromiseExit(effect.pipe(Effect.provide(RuntimeLive)));

/**
 * Run an Effect synchronously.
 * Note: Tracing and logging layers are not provided for sync execution.
 * Use runEffect for effects that need tracing/logging.
 * Only use for Effects that are guaranteed to be synchronous.
 */
export const runEffectSync = <A, E>(effect: Effect.Effect<A, E, never>): A =>
  Effect.runSync(effect);
