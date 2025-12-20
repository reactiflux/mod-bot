import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // 1. Add the column
  await db.schema
    .alterTable("escalations")
    .addColumn("scheduled_for", "text")
    .execute();

  // 2. Backfill pending escalations based on their current vote count
  const pending = await db
    .selectFrom("escalations")
    .select(["id", "created_at"])
    .where("resolved_at", "is", null)
    .execute();

  for (const escalation of pending) {
    // Count votes for this escalation
    const voteResult = await db
      .selectFrom("escalation_records")
      .select(db.fn.count("id").as("count"))
      .where("escalation_id", "=", escalation.id)
      .executeTakeFirst();

    const voteCount = Number(voteResult?.count ?? 0);
    const timeoutHours = Math.max(0, 36 - 4 * voteCount);
    const scheduledFor = new Date(
      new Date(escalation.created_at).getTime() + timeoutHours * 60 * 60 * 1000,
    ).toISOString();

    await db
      .updateTable("escalations")
      .set({ scheduled_for: scheduledFor })
      .where("id", "=", escalation.id)
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("escalations")
    .dropColumn("scheduled_for")
    .execute();
}
