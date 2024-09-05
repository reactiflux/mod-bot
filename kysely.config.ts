import SQLite from "better-sqlite3";
import { defineConfig, getKnexTimestampPrefix } from "kysely-ctl";
import { SqliteDialect } from "kysely";

const dialect = new SqliteDialect({
  database: new SQLite(process.env.DATABASE_URL!),
});

export default defineConfig({
  dialect,
  migrations: {
    getMigrationPrefix: getKnexTimestampPrefix,
  },
});
