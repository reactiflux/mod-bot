import Database from "better-sqlite3";
import { Context, Data, Effect, Layer, Metric } from "effect";
import { Kysely, SqliteDialect } from "kysely";

import type { DB } from "./db";
import { databaseUrl } from "./helpers/env.server";
import { log } from "./helpers/observability";

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly operation: string;
  readonly cause: Error;
}> {}

export class DatabaseConstraintError extends Data.TaggedError(
  "DatabaseConstraintError",
)<{
  readonly operation: string;
  readonly constraint: string;
  readonly cause: Error;
}> {}

export class TransactionError extends Data.TaggedError("TransactionError")<{
  readonly operation: string;
  readonly cause: Error;
}> {}

const dbQueries = Metric.counter("db_queries_total");
const dbErrors = Metric.counter("db_errors_total");

export interface IDatabaseService {
  readonly query: <T>(
    fn: (db: Kysely<DB>) => Promise<T>,
    operation: string,
  ) => Effect.Effect<T, DatabaseError>;

  readonly transaction: <T, E>(
    fn: (db: Kysely<DB>) => Effect.Effect<T, E>,
    operation: string,
  ) => Effect.Effect<T, E | TransactionError>;
}

export class DatabaseService extends Context.Tag("DatabaseService")<
  DatabaseService,
  IDatabaseService
>() {}

const catchQueryErrors = (operation: string) => (e: unknown) => {
  if (e instanceof Error) {
    return new DatabaseError({ operation, cause: e });
  }
  throw e;
};

const handleDatabaseErrors = (operation: string) => (e: DatabaseError) => {
  // TODO: Handle errors appropriately
  log("error", `Database.${operation}`, "Unhandled error", { error: e });
  return Effect.die(e);
};

export const DatabaseServiceLive = Layer.scoped(
  DatabaseService,
  Effect.gen(function* () {
    const sqliteDb = new Database(databaseUrl);
    sqliteDb.pragma("journal_mode = WAL");
    sqliteDb.pragma("foreign_keys = ON");

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        sqliteDb.close();
        log("info", "Database", "Database connection closed");
      }),
    );

    const kysely = new Kysely<DB>({
      dialect: new SqliteDialect({ database: sqliteDb }),
    });

    log("info", "Database", `Connected to database at ${databaseUrl}`);

    return {
      query: <T>(fn: (db: Kysely<DB>) => Promise<T>, operation: string) =>
        Effect.tryPromise({
          try: () => fn(kysely),
          catch: catchQueryErrors(operation),
        }).pipe(
          Effect.tap(() =>
            Metric.increment(Metric.tagged(dbQueries, "operation", operation)),
          ),
          Effect.tapError(() =>
            Metric.increment(Metric.tagged(dbErrors, "operation", operation)),
          ),
          Effect.withSpan(`db.query.${operation}`),
          Effect.catchAll(handleDatabaseErrors(operation)),
        ),

      transaction: <T, E>(
        fn: (db: Kysely<DB>) => Effect.Effect<T, E>,
        operation: string,
      ) =>
        Effect.tryPromise({
          try: () =>
            kysely.transaction().execute((trx) => Effect.runPromise(fn(trx))),
          catch: catchQueryErrors(operation),
        }).pipe(
          Effect.tap(() =>
            Metric.increment(Metric.tagged(dbQueries, "operation", operation)),
          ),
          Effect.tapError(() =>
            Metric.increment(Metric.tagged(dbErrors, "operation", operation)),
          ),
          Effect.withSpan(`db.transaction.${operation}`),
          Effect.catchAll(handleDatabaseErrors(operation)),
        ),
    };
  }),
);
