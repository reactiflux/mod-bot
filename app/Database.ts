import { Context, Effect, Layer, ManagedRuntime } from "effect";

import { SqlClient } from "@effect/sql";
import * as Sqlite from "@effect/sql-kysely/Sqlite";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { ResultLengthMismatch, SqlError } from "@effect/sql/SqlError";

import type { DB } from "./db";
import { DatabaseCorruptionError, NotFoundError } from "./effects/errors";
import { databaseUrl, emergencyWebhook } from "./helpers/env.server";
import { log } from "./helpers/observability";
import { scheduleTask } from "./helpers/schedule";

// Re-export SQL errors and DB type for consumers
export { SqlError, ResultLengthMismatch };
export type { DB };

// Type alias for the effectified Kysely instance
export type EffectKysely = Sqlite.EffectKysely<DB>;

// Service tag for the EffectKysely instance
export class DatabaseService extends Context.Tag("DatabaseService")<
  DatabaseService,
  EffectKysely
>() {}

// Base SQLite client layer
// Note: WAL mode is enabled by default by @effect/sql-sqlite-node
const SqliteLive = SqliteClient.layer({
  filename: databaseUrl,
});

// Kysely service layer - provides the effectified Kysely instance
const KyselyLive = Layer.effect(DatabaseService, Sqlite.make<DB>()).pipe(
  Layer.provide(SqliteLive),
);

// Combined database layer providing SqlClient, SqliteClient, and KyselyService
export const DatabaseLayer = Layer.mergeAll(SqliteLive, KyselyLive);

log("info", "Database", `Database configured at ${databaseUrl}`);

// --- ManagedRuntime (single connection for the process lifetime) ---

// ManagedRuntime keeps the DatabaseLayer scope alive for the process lifetime.
// Unlike Effect.runSync which closes the scope (and thus the SQLite connection)
// after execution, ManagedRuntime holds the scope open until explicit disposal.
export const runtime = ManagedRuntime.make(DatabaseLayer);

// The context type provided by the ManagedRuntime. Use this for typing functions
// that accept effects which need database access.
export type RuntimeContext = ManagedRuntime.ManagedRuntime.Context<
  typeof runtime
>;

// Extract the EffectKysely instance synchronously.
// The connection stays open because the runtime manages the layer's lifecycle.
export const db: EffectKysely = runtime.runSync(DatabaseService);

// Set busy_timeout so queries wait for locks instead of failing immediately
runtime.runSync(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.unsafe("PRAGMA busy_timeout = 5000");
  }),
);

/** Checkpoint WAL to main database and dispose the runtime. Call on process shutdown. */
export function shutdownDatabase() {
  try {
    runtime.runSync(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql.unsafe("PRAGMA wal_checkpoint(TRUNCATE)");
      }),
    );
  } catch (e) {
    console.error("Failed to checkpoint WAL on shutdown", e);
  }
}

// --- Bridge functions for legacy async/await code ---

// Convenience helpers for legacy async/await code that needs to run
// EffectKysely query builders as Promises.
export const run = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromise(effect);

export const runTakeFirst = <A>(
  effect: Effect.Effect<A[], unknown, never>,
): Promise<A | undefined> =>
  Effect.runPromise(Effect.map(effect, (rows) => rows[0]));

export const runTakeFirstOrThrow = <A>(
  effect: Effect.Effect<A[], unknown, never>,
): Promise<A> =>
  Effect.runPromise(
    Effect.flatMap(effect, (rows) =>
      rows[0] !== undefined
        ? Effect.succeed(rows[0])
        : Effect.fail(new NotFoundError({ resource: "db record", id: "" })),
    ),
  );

// --- Integrity Check ---

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

const sendWebhookAlert = (message: string) =>
  Effect.tryPromise({
    try: () =>
      fetch(emergencyWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message }),
      }),
    catch: (e) => e,
  }).pipe(
    Effect.tapError((e) =>
      Effect.sync(() =>
        log("error", "IntegrityCheck", "Failed to send webhook alert", {
          error: String(e),
        }),
      ),
    ),
    Effect.ignore, // Don't fail the whole check if webhook fails
  );

/** Run SQLite integrity check using the existing database connection */
export const runIntegrityCheck = Effect.gen(function* () {
  log("info", "IntegrityCheck", "Running scheduled integrity check", {});

  const sql = yield* SqlClient.SqlClient;
  const result = yield* sql.unsafe<{ integrity_check: string }>(
    "PRAGMA integrity_check",
  );

  if (result[0]?.integrity_check === "ok") {
    log("info", "IntegrityCheck", "Database integrity check passed", {});
    return "ok" as const;
  }

  const errors = result.map((r) => r.integrity_check).join("\n");
  log("error", "IntegrityCheck", "Database corruption detected!", { errors });

  yield* sendWebhookAlert(
    `🚨 **Database Corruption Detected**\n\`\`\`\n${errors.slice(0, 1800)}\n\`\`\``,
  );

  return yield* new DatabaseCorruptionError({ errors });
}).pipe(
  Effect.catchTag("SqlError", (e) =>
    Effect.gen(function* () {
      log("error", "IntegrityCheck", "Integrity check failed to run", {
        error: e.message,
      });
      yield* sendWebhookAlert(
        `🚨 **Database Integrity Check Failed**\n\`\`\`\n${e.message}\n\`\`\``,
      );
      return yield* e;
    }),
  ),
  Effect.withSpan("runIntegrityCheck"),
);

/** Start the twice-daily integrity check scheduler */
export function startIntegrityCheck() {
  return scheduleTask("IntegrityCheck", TWELVE_HOURS, () => {
    runtime.runPromise(runIntegrityCheck).catch(() => {
      // Errors already logged and webhook sent
    });
  });
}
