import type { Kysely } from "kysely";

const tableName = "channel_info";

export async function up(db: Kysely<any>) {
  return db.schema
    .createTable(tableName)
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("name", "text")
    .addColumn("category", "text")
    .execute();
}

export async function down(db: Kysely<any>) {
  return db.schema.dropTable(tableName).execute();
}
