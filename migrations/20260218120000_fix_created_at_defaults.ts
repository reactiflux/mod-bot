import { sql, type Kysely } from "kysely";

/**
 * Fix rows where created_at was stored as the literal string 'CURRENT_TIMESTAMP'
 * instead of an actual timestamp, due to the column default being quoted.
 *
 * The inserts now explicitly provide created_at, so the broken default no longer
 * matters for new rows.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`UPDATE reported_messages SET created_at = datetime('now') WHERE created_at = 'CURRENT_TIMESTAMP'`.execute(
    db,
  );
  await sql`UPDATE user_threads SET created_at = datetime('now') WHERE created_at = 'CURRENT_TIMESTAMP'`.execute(
    db,
  );
  await sql`UPDATE guild_subscriptions SET created_at = datetime('now') WHERE created_at = 'CURRENT_TIMESTAMP'`.execute(
    db,
  );
}

export async function down(_db: Kysely<any>): Promise<void> {
  // Not reversible — we can't recover the original (missing) timestamps
}
