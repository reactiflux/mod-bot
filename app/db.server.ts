import SQLite from "better-sqlite3";
import { Kysely, ParseJSONResultsPlugin, SqliteDialect } from "kysely";

import type { DB } from "./db";
import { databaseUrl } from "./helpers/env.server";

export { SqliteError } from "better-sqlite3";

console.log(`Connecting to database at ${databaseUrl}`);

export const dialect = new SqliteDialect({
  database: new SQLite(databaseUrl),
});

const db = new Kysely<DB>({
  dialect,
  plugins: [new ParseJSONResultsPlugin()],
});

export default db;
export type { DB };
