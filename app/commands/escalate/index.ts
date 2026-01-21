import { Cause, Effect } from "effect";

import { runEffectExit } from "#~/effects/runtime";

import { EscalationServiceLive, type EscalationService } from "./service";

/**
 * Run an Effect that requires EscalationService.
 * Provides the service and all its dependencies automatically.
 * Returns an Exit for error handling in handlers.
 */
export const runEscalationEffect = <A, E>(
  effect: Effect.Effect<A, E, EscalationService>,
) => runEffectExit(Effect.provide(effect, EscalationServiceLive));

/**
 * Extract the first failure from a Cause for type-safe error matching.
 * Returns undefined if the Cause doesn't contain a Fail.
 */
export const getFailure = <E>(cause: Cause.Cause<E>): E | undefined => {
  const option = Cause.failureOption(cause);
  return option._tag === "Some" ? option.value : undefined;
};
