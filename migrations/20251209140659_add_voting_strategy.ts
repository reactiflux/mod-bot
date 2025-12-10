import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("escalations")
    .addColumn("voting_strategy", "text")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("escalations")
    .dropColumn("voting_strategy")
    .execute();
}
