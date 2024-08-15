import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { DB } from "kysely-codegen";
import { databaseUrl } from "./helpers/env";

export { SqliteError } from "better-sqlite3";

export const dialect = new SqliteDialect({
  database: new SQLite(databaseUrl),
});

const db = new Kysely<DB>({
  dialect,
});

export default db;
