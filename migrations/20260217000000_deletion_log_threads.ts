import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("deletion_log_threads")
    .addColumn("user_id", "text", (c) => c.notNull())
    .addColumn("guild_id", "text", (c) => c.notNull())
    .addColumn("thread_id", "text", (c) => c.notNull())
    .addColumn("created_at", "datetime", (c) =>
      c.defaultTo("CURRENT_TIMESTAMP").notNull(),
    )
    .execute();

  await db.schema
    .createIndex("deletion_log_threads_pk")
    .on("deletion_log_threads")
    .columns(["user_id", "guild_id"])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("deletion_log_threads").execute();
}
