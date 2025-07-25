import type { DB } from "#~/db.server";
import db from "#~/db.server";
import { log, trackPerformance } from "#~/helpers/observability";

export type UserThread = DB["user_threads"];

export async function getUserThread(userId: string, guildId: string): Promise<UserThread | undefined> {
  return trackPerformance(
    "getUserThread",
    async () => {
      log("debug", "UserThread", "Fetching user thread", { userId, guildId });
      
      const thread = await db
        .selectFrom("user_threads")
        .selectAll()
        .where("user_id", "=", userId)
        .where("guild_id", "=", guildId)
        .executeTakeFirst();
        
      log("debug", "UserThread", thread ? "Found user thread" : "No user thread found", { userId, guildId, threadId: thread?.thread_id });
      return thread;
    },
    { userId, guildId }
  );
}

export async function createUserThread(userId: string, guildId: string, threadId: string): Promise<UserThread> {
  return trackPerformance(
    "createUserThread",
    async () => {
      log("info", "UserThread", "Creating user thread", { userId, guildId, threadId });
      
      const userThread = {
        user_id: userId,
        guild_id: guildId,
        thread_id: threadId,
        created_at: new Date().toISOString(),
      };

      await db
        .insertInto("user_threads")
        .values(userThread)
        .execute();
        
      log("info", "UserThread", "Created user thread", { userId, guildId, threadId });
      return userThread;
    },
    { userId, guildId, threadId }
  );
}

export async function updateUserThread(userId: string, guildId: string, threadId: string): Promise<void> {
  return trackPerformance(
    "updateUserThread", 
    async () => {
      log("info", "UserThread", "Updating user thread", { userId, guildId, threadId });
      
      await db
        .updateTable("user_threads")
        .set({ thread_id: threadId })
        .where("user_id", "=", userId)
        .where("guild_id", "=", guildId)
        .execute();
        
      log("info", "UserThread", "Updated user thread", { userId, guildId, threadId });
    },
    { userId, guildId, threadId }
  );
}