import { Effect } from "effect";

import { log as legacyLog } from "#~/helpers/observability.js";

/**
 * Bridge Effect logging to existing observability infrastructure.
 * Returns an Effect that performs the logging as a side effect.
 */
export const logEffect = (
  level: "debug" | "info" | "warn" | "error",
  service: string,
  message: string,
  context: Record<string, unknown> = {},
): Effect.Effect<void, never, never> =>
  Effect.sync(() => legacyLog(level, service, message, context));

/**
 * Log and continue - useful for adding logging to a pipeline without affecting the flow.
 * Uses Effect.tap to perform logging as a side effect.
 */
export const tapLog =
  <A>(
    level: "debug" | "info" | "warn" | "error",
    service: string,
    message: string,
    getContext: (a: A) => Record<string, unknown> = () => ({}),
  ) =>
  <E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.tap(self, (a) => logEffect(level, service, message, getContext(a)));
