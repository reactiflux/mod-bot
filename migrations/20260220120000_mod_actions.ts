import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("mod_actions")
    .addColumn("id", "text", (c) => c.primaryKey().notNull())
    .addColumn("user_id", "text", (c) => c.notNull())
    .addColumn("guild_id", "text", (c) => c.notNull())
    .addColumn("action_type", "text", (c) => c.notNull())
    .addColumn("executor_id", "text")
    .addColumn("executor_username", "text")
    .addColumn("reason", "text")
    .addColumn("duration", "text")
    .addColumn("created_at", "datetime", (c) => c.notNull())
    .execute();

  await db.schema
    .createIndex("idx_mod_actions_user_guild")
    .on("mod_actions")
    .columns(["user_id", "guild_id"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("mod_actions").execute();
}
