import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Main escalation votes table
  await db.schema
    .createTable("escalations")
    .addColumn("id", "text", (c) => c.primaryKey().notNull())
    .addColumn("guild_id", "text", (c) => c.notNull())
    .addColumn("thread_id", "text", (c) => c.notNull())
    .addColumn("vote_message_id", "text", (c) => c.notNull())
    .addColumn("reported_user_id", "text", (c) => c.notNull())
    .addColumn("initiator_id", "text", (c) => c.notNull())
    .addColumn("flags", "text", (c) => c.notNull())
    .addColumn("created_at", "datetime", (c) =>
      c.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addColumn("resolved_at", "datetime")
    .addColumn("resolution", "text")
    .execute();

  await db.schema
    .createIndex("idx_pending_escalations")
    .on("escalations")
    .columns(["guild_id", "resolved_at"])
    .execute();

  // Individual vote records
  await db.schema
    .createTable("escalation_records")
    .addColumn("id", "text", (c) => c.primaryKey().notNull())
    .addColumn("escalation_id", "text", (c) => c.notNull())
    .addColumn("voter_id", "text", (c) => c.notNull())
    .addColumn("vote", "text", (c) => c.notNull())
    .addColumn("voted_at", "datetime", (c) =>
      c.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  await db.schema
    .createIndex("idx_vote_records_escalation")
    .on("escalation_records")
    .columns(["escalation_id"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("escalation_records").execute();
  await db.schema.dropTable("escalations").execute();
}
