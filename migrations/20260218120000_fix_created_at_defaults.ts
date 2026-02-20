import { sql, type Kysely } from "kysely";

/**
 * Fix rows where created_at was stored as the literal string 'CURRENT_TIMESTAMP'
 * instead of an actual timestamp, due to the column default being quoted.
 *
 * For reported_messages, we can recover the original timestamps by extracting
 * them from Discord snowflake IDs (log_message_id).
 *
 * For other tables without snowflake IDs, we use datetime('now') as a fallback.
 *
 * The inserts now explicitly provide created_at, so the broken default no longer
 * matters for new rows.
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Recover timestamps from Discord snowflake IDs for reported_messages
  // Discord snowflake formula: ((id >> 22) + 1420070400000) / 1000 = unix timestamp
  await sql`
    UPDATE reported_messages
    SET created_at = datetime(
      (CAST(log_message_id AS INTEGER) >> 22) / 1000.0 + 1420070400,
      'unixepoch'
    )
    WHERE created_at = 'CURRENT_TIMESTAMP'
  `.execute(db);

  // For user_threads, try to recover from thread_id snowflake
  await sql`
    UPDATE user_threads
    SET created_at = datetime(
      (CAST(thread_id AS INTEGER) >> 22) / 1000.0 + 1420070400,
      'unixepoch'
    )
    WHERE created_at = 'CURRENT_TIMESTAMP'
  `.execute(db);

  // For guild_subscriptions, no snowflake available - use current time
  await sql`
    UPDATE guild_subscriptions
    SET created_at = datetime('now')
    WHERE created_at = 'CURRENT_TIMESTAMP'
  `.execute(db);
}

export async function down(_db: Kysely<any>): Promise<void> {
  // Not reversible — we can't restore the broken 'CURRENT_TIMESTAMP' strings
}
