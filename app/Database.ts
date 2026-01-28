import { Context, Effect, Layer } from "effect";

import { SqlClient } from "@effect/sql";
import * as Sqlite from "@effect/sql-kysely/Sqlite";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { ResultLengthMismatch, SqlError } from "@effect/sql/SqlError";

import type { DB } from "./db";
import { DatabaseCorruptionError } from "./effects/errors";
import { databaseUrl, emergencyWebhook } from "./helpers/env.server";
import { log } from "./helpers/observability";
import { scheduleTask } from "./helpers/schedule";

// Re-export SQL errors for consumers
export { SqlError, ResultLengthMismatch };

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
    Effect.runPromise(
      runIntegrityCheck.pipe(Effect.provide(DatabaseLayer)),
    ).catch(() => {
      // Errors already logged and webhook sent
    });
  });
}
