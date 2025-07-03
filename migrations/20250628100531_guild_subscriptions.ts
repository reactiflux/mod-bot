import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("guild_subscriptions")
    .addColumn("guild_id", "text", (c) => c.primaryKey())
    .addColumn("stripe_customer_id", "text")
    .addColumn("stripe_subscription_id", "text")
    .addColumn("product_tier", "text", (c) => c.notNull().defaultTo("free"))
    .addColumn("status", "text", (c) => c.notNull().defaultTo("active"))
    .addColumn("current_period_end", "datetime")
    .addColumn("created_at", "datetime", (c) =>
      c.defaultTo("CURRENT_TIMESTAMP"),
    )
    .addColumn("updated_at", "datetime", (c) =>
      c.defaultTo("CURRENT_TIMESTAMP"),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("guild_subscriptions").execute();
}
