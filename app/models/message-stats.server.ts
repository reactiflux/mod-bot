import db from "#~/db.server";
import type { DB } from "#~/db.server";

type MessageStats = DB["message_stats"];

/**
 * Creates a base query for message_stats filtered by guild, date range, and optionally user
 */
export function createMessageStatsQuery(
  guildId: MessageStats["guild_id"],
  start: string,
  end: string,
  userId?: MessageStats["author_id"],
) {
  let query = db
    .selectFrom("message_stats")
    .where("guild_id", "=", guildId)
    .where("sent_at", ">=", new Date(start).getTime())
    .where("sent_at", "<=", new Date(end + "T23:59:59").getTime());

  if (userId) {
    query = query.where("author_id", "=", userId);
  }

  return query;
}
