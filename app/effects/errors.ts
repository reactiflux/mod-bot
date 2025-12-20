import { Data } from "effect";

// Tagged error types for discriminated unions
// Each error has a _tag property for pattern matching with Effect.catchTag

export class DiscordApiError extends Data.TaggedError("DiscordApiError")<{
  operation: string;
  discordError: unknown;
}> {}

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  operation: string;
  cause: unknown;
}> {}

export class DatabaseConstraintError extends Data.TaggedError(
  "DatabaseConstraintError",
)<{
  operation: string;
  constraint: string;
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
