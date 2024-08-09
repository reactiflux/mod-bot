import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { DB } from "kysely-codegen";

export { SqliteError } from "better-sqlite3";

export const dialect = new SqliteDialect({
  database: new SQLite(process.env.DATABASE_URL),
});

const db = new Kysely<DB>({
  dialect,
});

export default db;
