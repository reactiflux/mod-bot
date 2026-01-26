import SQLite from "better-sqlite3";
import { Kysely, ParseJSONResultsPlugin, SqliteDialect } from "kysely";

import type { DB } from "./db";
import { databaseUrl } from "./helpers/env.server";

export { SqliteError } from "better-sqlite3";

console.log(`Connecting to database at ${databaseUrl}`);

const sqliteDb = new SQLite(databaseUrl);
// Enable WAL mode to match @effect/sql-sqlite-node's default.
// Both connections MUST use the same journal mode to prevent corruption.
sqliteDb.pragma("journal_mode = WAL");

export const dialect = new SqliteDialect({
  database: sqliteDb,
});

const db = new Kysely<DB>({
  dialect,
  plugins: [new ParseJSONResultsPlugin()],
});

export default db;
export type { DB };
