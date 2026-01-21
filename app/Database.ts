import { Context, Layer } from "effect";

import * as Sqlite from "@effect/sql-kysely/Sqlite";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { ResultLengthMismatch, SqlError } from "@effect/sql/SqlError";

import type { DB } from "./db";
import { databaseUrl } from "./helpers/env.server";
import { log } from "./helpers/observability";

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

// Legacy alias for backwards compatibility during migration
export const DatabaseServiceLive = DatabaseLayer;
