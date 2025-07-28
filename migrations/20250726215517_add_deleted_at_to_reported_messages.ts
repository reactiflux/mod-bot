import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Add deleted_at column to track when messages were deleted
  await db.schema
    .alterTable("reported_messages")
    .addColumn("deleted_at", "datetime")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Remove the deleted_at column
  await db.schema
    .alterTable("reported_messages")
    .dropColumn("deleted_at")
    .execute();
}
