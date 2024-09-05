import { defineConfig, getKnexTimestampPrefix } from "kysely-ctl";
import { dialect } from "./app/db.server";

export default defineConfig({
  dialect,
  migrations: {
    getMigrationPrefix: getKnexTimestampPrefix,
  },
});
