import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("reactji_channeler_config")
    .addColumn("id", "text", (c) => c.primaryKey().notNull())
    .addColumn("guild_id", "text", (c) => c.notNull())
    .addColumn("channel_id", "text", (c) => c.notNull())
    .addColumn("emoji", "text", (c) => c.notNull())
    .addColumn("configured_by_id", "text", (c) => c.notNull())
    .addColumn("threshold", "integer", (c) => c.notNull().defaultTo(1))
    .addColumn("created_at", "datetime", (c) =>
      c.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addUniqueConstraint("unique_guild_emoji", ["guild_id", "emoji"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("reactji_channeler_config").execute();
}
