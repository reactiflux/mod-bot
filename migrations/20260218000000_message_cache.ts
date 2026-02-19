import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("message_cache")
    .addColumn("message_id", "text", (c) => c.primaryKey().notNull())
    .addColumn("guild_id", "text", (c) => c.notNull())
    .addColumn("channel_id", "text", (c) => c.notNull())
    .addColumn("user_id", "text", (c) => c.notNull())
    .addColumn("content", "text")
    .addColumn("last_touched", "datetime", (c) => c.notNull())
    .addColumn("created_at", "datetime", (c) => c.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("message_cache").execute();
}
