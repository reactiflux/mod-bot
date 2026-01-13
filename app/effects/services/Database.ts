import { Context, Effect, Layer, Metric } from "effect";

import { DatabaseConstraintError, DatabaseError } from "../errors.js";
import { dbErrors, dbQueries, dbQueryLatency } from "../metrics";

/**
 * Database service interface for Effect-based database operations.
 * Wraps Kysely queries in Effects with typed errors.
 */
export interface IDatabaseService {
  /**
   * Execute a database query and wrap the result in an Effect.
   * Converts promise rejections to DatabaseError.
   */
  readonly query: <T>(
    fn: () => Promise<T>,
    operation: string,
  ) => Effect.Effect<T, DatabaseError, never>;

  /**
   * Execute a database query that may fail with a constraint violation.
   * Returns a discriminated union of success/constraint error.
   */
  readonly queryWithConstraint: <T>(
    fn: () => Promise<T>,
    operation: string,
    constraintName: string,
  ) => Effect.Effect<T, DatabaseError | DatabaseConstraintError, never>;
}

export class DatabaseService extends Context.Tag("DatabaseService")<
  DatabaseService,
  IDatabaseService
>() {}

/**
 * Check if an error is a SQLite constraint violation
 */
const isConstraintError = (error: unknown, constraintName: string): boolean => {
  if (error instanceof Error) {
    return error.message.includes(
      `UNIQUE constraint failed: ${constraintName}`,
    );
  }
  return false;
};

/**
 * Live implementation of the DatabaseService.
 * Uses the global Kysely db instance.
 * Tracks query latency, counts, and errors via Effect.Metric.
 */
export const DatabaseServiceLive = Layer.succeed(DatabaseService, {
  query: <T>(fn: () => Promise<T>, operation: string) =>
    Effect.gen(function* () {
      const start = Date.now();
      const taggedQueries = Metric.tagged(dbQueries, "operation", operation);
      const taggedErrors = Metric.tagged(dbErrors, "operation", operation);

      // Increment query counter
      yield* Metric.increment(taggedQueries);

      const result = yield* Effect.tryPromise({
        try: fn,
        catch: (error) => new DatabaseError({ operation, cause: error }),
      }).pipe(Effect.tapError(() => Metric.increment(taggedErrors)));

      // Record latency
      const duration = Date.now() - start;
      yield* Metric.update(dbQueryLatency, duration);

      return result;
    }),

  queryWithConstraint: <T>(
    fn: () => Promise<T>,
    operation: string,
    constraintName: string,
  ) =>
    Effect.gen(function* () {
      const start = Date.now();
      const taggedQueries = Metric.tagged(dbQueries, "operation", operation);
      const taggedErrors = Metric.tagged(dbErrors, "operation", operation);

      // Increment query counter
      yield* Metric.increment(taggedQueries);

      const result = yield* Effect.tryPromise({
        try: fn,
        catch: (error) => {
          if (isConstraintError(error, constraintName)) {
            return new DatabaseConstraintError({
              operation,
              constraint: constraintName,
              cause: error,
            });
          }
          return new DatabaseError({ operation, cause: error });
        },
      }).pipe(Effect.tapError(() => Metric.increment(taggedErrors)));

      // Record latency
      const duration = Date.now() - start;
      yield* Metric.update(dbQueryLatency, duration);

      return result;
    }),
});
