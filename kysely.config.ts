import SQLite from "better-sqlite3";
import { defineConfig, getKnexTimestampPrefix } from "kysely-ctl";
import { SqliteDialect } from "kysely";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Please provide a DATABASE_URL! probably './mod-bot.sqlite3'",
  );
}

const dialect = new SqliteDialect({
  database: new SQLite(process.env.DATABASE_URL),
});

export default defineConfig({
  dialect,
  migrations: {
    getMigrationPrefix: getKnexTimestampPrefix,
  },
});
