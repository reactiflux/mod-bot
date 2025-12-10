import { Context, Effect, Layer } from "effect";

import { DatabaseConstraintError, DatabaseError } from "../errors.js";

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
 */
export const DatabaseServiceLive = Layer.succeed(DatabaseService, {
  query: <T>(fn: () => Promise<T>, operation: string) =>
    Effect.tryPromise({
      try: fn,
      catch: (error) => new DatabaseError({ operation, cause: error }),
    }),

  queryWithConstraint: <T>(
    fn: () => Promise<T>,
    operation: string,
    constraintName: string,
  ) =>
    Effect.tryPromise({
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
    }),
});
