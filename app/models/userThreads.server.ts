import type { DB } from "#~/db.server";
import db from "#~/db.server";
import { log, trackPerformance } from "#~/helpers/observability";

export type UserThread = DB["user_threads"];

export async function getUserThread(userId: string, guildId: string) {
  return trackPerformance(
    "getUserThread",
    async () => {
      const thread = await db
        .selectFrom("user_threads")
        .selectAll()
        .where("user_id", "=", userId)
        .where("guild_id", "=", guildId)
        .executeTakeFirst();

      log(
        "debug",
        "UserThread",
        thread ? "Found user thread" : "No user thread found",
        { userId, guildId, threadId: thread?.thread_id },
      );
      return thread;
    },
    { userId, guildId },
  );
}

export async function createUserThread(
  userId: string,
  guildId: string,
  threadId: string,
): Promise<void> {
  await trackPerformance(
    "createUserThread",
    () =>
      db
        .insertInto("user_threads")
        .values({
          user_id: userId,
          guild_id: guildId,
          thread_id: threadId,
        })
        .execute(),
    { userId, guildId, threadId },
  );
}

export async function updateUserThread(
  userId: string,
  guildId: string,
  threadId: string,
): Promise<void> {
  await trackPerformance(
    "updateUserThread",
    () =>
      db
        .updateTable("user_threads")
        .set({ thread_id: threadId })
        .where("user_id", "=", userId)
        .where("guild_id", "=", guildId)
        .execute(),
    { userId, guildId, threadId },
  );
}
