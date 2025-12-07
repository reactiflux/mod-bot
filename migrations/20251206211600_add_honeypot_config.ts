import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  return db.schema
    .createTable("honeypot_config")
    .addColumn("guild_id", "text", (c) => c.notNull())
    .addColumn("channel_id", "text", (c) => c.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  return db.schema.dropTable("honeypot_config").execute();
}
