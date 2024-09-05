import type { Kysely } from "kysely";

export async function up(db: Kysely<any>) {
  return db.schema
    .createTable("guilds")
    .ifNotExists()
    .addColumn("id", "serial", (x) => x.primaryKey())
    .addColumn("settings", "jsonb")
    .execute();
}

export async function down(db: Kysely<any>) {
  return db.schema.dropTable("guilds").execute();
}
