import { sql, type Kysely } from "kysely";

/**
 * Recover corrupted timestamps from Discord snowflake IDs.
 *
 * The 20260218120000_fix_created_at_defaults migration was destructive - it set
 * all timestamps to datetime('now') instead of recovering them from snowflake IDs.
 *
 * This migration fixes that by extracting the original timestamps from Discord
 * snowflake IDs, which encode the creation time in the first 42 bits.
 *
 * We only update rows that were likely corrupted by the previous migration
 * (timestamps on or after 2026-02-18) to avoid touching any correct data.
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Recover timestamps from Discord snowflake IDs for reported_messages
  // Discord snowflake formula: ((id >> 22) + 1420070400000) / 1000 = unix timestamp
  // Only update rows that were corrupted by the previous migration (Feb 18-20, 2026)
  await sql`
    UPDATE reported_messages
    SET created_at = datetime(
      (CAST(log_message_id AS INTEGER) >> 22) / 1000.0 + 1420070400,
      'unixepoch'
    )
    WHERE created_at >= '2026-02-18'
      AND created_at <= '2026-02-21'
  `.execute(db);

  // Recover timestamps from thread_id snowflake for user_threads
  await sql`
    UPDATE user_threads
    SET created_at = datetime(
      (CAST(thread_id AS INTEGER) >> 22) / 1000.0 + 1420070400,
      'unixepoch'
    )
    WHERE created_at >= '2026-02-18'
      AND created_at <= '2026-02-21'
  `.execute(db);

  // For deletion_log_threads, recover from thread_id
  await sql`
    UPDATE deletion_log_threads
    SET created_at = datetime(
      (CAST(thread_id AS INTEGER) >> 22) / 1000.0 + 1420070400,
      'unixepoch'
    )
    WHERE created_at >= '2026-02-18'
      AND created_at <= '2026-02-21'
  `.execute(db);

  // guild_subscriptions has no snowflake IDs - cannot recover
  // Leave those timestamps as-is
}

export async function down(_db: Kysely<any>): Promise<void> {
  // Not reversible - we can't restore the corrupted timestamps
}
