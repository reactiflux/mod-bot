import type { Kysely } from "kysely";

const column = "link_stats";

export async function up(db: Kysely<any>) {
  return await db.schema
    .alterTable("message_stats")
    .addColumn(column, "text", (c) => c.notNull().defaultTo("[]"))
    .execute();
}

export async function down(db: Kysely<any>) {
  return db.schema.alterTable("message_stats").dropColumn(column).execute();
}
