import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Add unique constraint to prevent duplicate reports for the same message/reason/guild
  await db.schema
    .createIndex("idx_unique_message_reason_guild")
    .on("reported_messages")
    .columns(["reported_message_id", "reason", "guild_id"])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Remove the unique constraint
  await db.schema.dropIndex("idx_unique_message_reason_guild").execute();
}
