import { Data } from "effect";

// Re-export SQL errors from @effect/sql for convenience
export { SqlError, ResultLengthMismatch } from "@effect/sql/SqlError";

// Tagged error types for discriminated unions
// Each error has a _tag property for pattern matching with Effect.catchTag

export class DiscordApiError extends Data.TaggedError("DiscordApiError")<{
  operation: string;
  discordError: unknown;
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

// Escalation-specific errors

export class EscalationNotFoundError extends Data.TaggedError(
  "EscalationNotFoundError",
)<{
  escalationId: string;
}> {}

export class AlreadyResolvedError extends Data.TaggedError(
  "AlreadyResolvedError",
)<{
  escalationId: string;
  resolvedAt: string;
}> {}

export class NotAuthorizedError extends Data.TaggedError("NotAuthorizedError")<{
  operation: string;
  userId: string;
  requiredRole?: string;
}> {}

export class NoLeaderError extends Data.TaggedError("NoLeaderError")<{
  escalationId: string;
  reason: "no_votes" | "tied";
  tiedResolutions?: string[];
}> {}

export class ResolutionExecutionError extends Data.TaggedError(
  "ResolutionExecutionError",
)<{
  escalationId: string;
  resolution: string;
  cause: unknown;
}> {}
