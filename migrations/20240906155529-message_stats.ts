import type { Kysely } from "kysely";

export async function up(db: Kysely<any>) {
  return db.schema
    .createTable("message_stats")
    .addColumn("message_id", "text", (c) => c.primaryKey())
    .addColumn("author_id", "text", (c) => c.notNull())
    .addColumn("guild_id", "text", (c) => c.notNull())
    .addColumn("channel_id", "text", (c) => c.notNull())
    .addColumn("channel_category", "text")
    .addColumn("recipient_id", "text")
    .addColumn("char_count", "integer", (c) => c.notNull())
    .addColumn("word_count", "integer", (c) => c.notNull())
    .addColumn("react_count", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("sent_at", "text", (c) => c.notNull())
    .execute();
}

export async function down(db: Kysely<any>) {
  return db.schema.dropTable("message_stats").execute();
}

