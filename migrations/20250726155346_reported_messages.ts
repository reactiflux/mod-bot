import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("reported_messages")
    .addColumn("id", "uuid", (c) => c.primaryKey().notNull())
    .addColumn("reported_message_id", "text", (c) => c.notNull())
    .addColumn("reported_channel_id", "text", (c) => c.notNull())
    .addColumn("reported_user_id", "text", (c) => c.notNull())
    .addColumn("guild_id", "text", (c) => c.notNull())
    .addColumn("log_message_id", "text", (c) => c.notNull())
    .addColumn("log_channel_id", "text", (c) => c.notNull())
    .addColumn("reason", "text", (c) => c.notNull())
    .addColumn("staff_id", "text")
    .addColumn("staff_username", "text")
    .addColumn("extra", "text")
    .addColumn("created_at", "datetime", (c) =>
      c.defaultTo("CURRENT_TIMESTAMP").notNull(),
    )
    .execute();

  await db.schema
    .createIndex("idx_reported_user_guild")
    .on("reported_messages")
    .columns(["reported_user_id", "guild_id"])
    .execute();

  await db.schema
    .createIndex("idx_reported_message")
    .on("reported_messages")
    .columns(["reported_message_id"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("reported_messages").execute();
}
