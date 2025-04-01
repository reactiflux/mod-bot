import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  return db.schema
    .createTable("tickets_config")
    .addColumn("message_id", "text", (c) => c.primaryKey().notNull())
    .addColumn("channel_id", "text")
    .addColumn("role_id", "text", (c) => c.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  return db.schema.dropTable("tickets_config").execute();
}
