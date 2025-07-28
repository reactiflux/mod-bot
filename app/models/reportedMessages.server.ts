import type { Message, User } from "discord.js";

import type { DB } from "#~/db.server";
import db from "#~/db.server";
import { log, trackPerformance } from "#~/helpers/observability";
import { client } from "#~/discord/client.server";

export type ReportedMessage = DB["reported_messages"];

export interface Report {
  reason: ReportReasons;
  message: Message;
  extra?: string;
  staff: User | false;
}

export const enum ReportReasons {
  anonReport = "anonReport",
  track = "track",
  modResolution = "modResolution",
  spam = "spam",
}

export async function recordReport(data: {
  reportedMessageId: string;
  reportedChannelId: string;
  reportedUserId: string;
  guildId: string;
  logMessageId: string;
  logChannelId: string;
  reason: ReportReasons;
  staffId?: string;
  staffUsername?: string;
  extra?: string;
}): Promise<{ wasInserted: boolean }> {
  return trackPerformance(
    "recordReport",
    async () => {
      log("info", "ReportedMessage", "Recording report", {
        reportedUserId: data.reportedUserId,
        guildId: data.guildId,
        reason: data.reason,
      });

      try {
        await db
          .insertInto("reported_messages")
          .values({
            id: crypto.randomUUID(),
            reported_message_id: data.reportedMessageId,
            reported_channel_id: data.reportedChannelId,
            reported_user_id: data.reportedUserId,
            guild_id: data.guildId,
            log_message_id: data.logMessageId,
            log_channel_id: data.logChannelId,
            reason: data.reason,
            staff_id: data.staffId,
            staff_username: data.staffUsername,
            extra: data.extra,
          })
          .execute();

        log("info", "ReportedMessage", "Report recorded", {
          reportedUserId: data.reportedUserId,
          guildId: data.guildId,
        });

        return { wasInserted: true };
      } catch (error) {
        // Check if this is a unique constraint violation
        if (
          error instanceof Error &&
          error.message.includes("UNIQUE constraint failed")
        ) {
          log(
            "debug",
            "ReportedMessage",
            "Report already exists (unique constraint)",
            {
              reportedUserId: data.reportedUserId,
              guildId: data.guildId,
              reason: data.reason,
            },
          );
          return { wasInserted: false };
        }

        // Re-throw other errors
        throw error;
      }
    },
    { reportedUserId: data.reportedUserId, guildId: data.guildId },
  );
}

export async function getReportsForUser(userId: string, guildId: string) {
  return trackPerformance(
    "getReportsForUser",
    async () => {
      const reports = await db
        .selectFrom("reported_messages")
        .selectAll()
        .where("reported_user_id", "=", userId)
        .where("guild_id", "=", guildId)
        .execute();

      return reports;
    },
    { userId, guildId },
  );
}

export async function getReportsForMessage(
  messageId: string,
  guildId: string,
  includeDeleted: boolean = false,
) {
  return trackPerformance(
    "getReportsForMessage",
    async () => {
      let query = db
        .selectFrom("reported_messages")
        .selectAll()
        .where("reported_message_id", "=", messageId)
        .where("guild_id", "=", guildId);

      if (!includeDeleted) {
        query = query.where("deleted_at", "is", null);
      }

      const reports = await query.orderBy("created_at", "desc").execute();

      log("debug", "ReportedMessage", `Found ${reports.length} reports`, {
        messageId,
        guildId,
        includeDeleted,
      });
      return reports;
    },
    { messageId, guildId },
  );
}

export async function getUserReportStats(userId: string, guildId: string) {
  return trackPerformance(
    "getUserReportStats",
    async () => {
      const [totalReports, uniqueMessages, uniqueChannels] = await Promise.all([
        db
          .selectFrom("reported_messages")
          .select(db.fn.count("id").as("count"))
          .where("reported_user_id", "=", userId)
          .where("guild_id", "=", guildId)
          .where("deleted_at", "is", null) // Only count non-deleted messages
          .executeTakeFirstOrThrow(),

        db
          .selectFrom("reported_messages")
          .select(({ fn }) =>
            fn.count("reported_message_id").distinct().as("count"),
          )
          .where("reported_user_id", "=", userId)
          .where("guild_id", "=", guildId)
          .where("deleted_at", "is", null) // Only count non-deleted messages
          .executeTakeFirstOrThrow(),

        db
          .selectFrom("reported_messages")
          .select(({ fn }) =>
            fn.count("reported_channel_id").distinct().as("count"),
          )
          .where("reported_user_id", "=", userId)
          .where("guild_id", "=", guildId)
          .where("deleted_at", "is", null) // Only count non-deleted messages
          .executeTakeFirstOrThrow(),
      ]);

      const stats = {
        reportCount: Number(totalReports.count),
        uniqueMessages: Number(uniqueMessages.count),
        uniqueChannels: Number(uniqueChannels.count),
        allReports: [], // Legacy compatibility - could fetch if needed
      };

      return stats;
    },
    { userId, guildId },
  );
}

/**
 * Gets unique message IDs for a user that haven't been deleted yet
 */
async function getUniqueNonDeletedMessages(userId: string, guildId: string) {
  return db
    .selectFrom("reported_messages")
    .select(["reported_message_id", "reported_channel_id"])
    .distinct()
    .where("reported_user_id", "=", userId)
    .where("guild_id", "=", guildId)
    .where("deleted_at", "is", null)
    .execute();
}

/**
 * Deletes a single Discord message and marks it as deleted in database
 */
async function deleteSingleMessage(
  messageId: string,
  channelId: string,
  guildId: string,
) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !("messages" in channel)) {
      throw new Error("Channel not found or not a text channel");
    }

    const message = await channel.messages.fetch(messageId);
    await message.delete();
    await markMessageAsDeleted(messageId, guildId);

    log("debug", "ReportedMessage", "Deleted message", { messageId });
    return { success: true, messageId };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unknown Message")) {
      await markMessageAsDeleted(messageId, guildId);
      return { success: true, messageId };
    }

    log("warn", "ReportedMessage", "Failed to delete message", {
      messageId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, messageId, error };
  }
}

export async function deleteAllReportedForUser(
  userId: string,
  guildId: string,
) {
  return trackPerformance(
    "deleteAllReportedForUser",
    async () => {
      // Get unique messages that haven't been deleted yet (using SQL DISTINCT)
      const uniqueMessages = await getUniqueNonDeletedMessages(userId, guildId);

      if (uniqueMessages.length === 0) {
        log("info", "ReportedMessage", "No messages to delete", {
          userId,
          guildId,
        });
        return { total: 0, deleted: 0 };
      }

      // Delete messages sequentially to avoid rate limits and race conditions
      let deleted = 0;
      const errors: Array<{ messageId: string; error: unknown }> = [];

      for (const {
        reported_message_id,
        reported_channel_id,
      } of uniqueMessages) {
        const result = await deleteSingleMessage(
          reported_message_id,
          reported_channel_id,
          guildId,
        );

        if (result.success) {
          deleted++;
        } else {
          errors.push({ messageId: reported_message_id, error: result.error });
        }
      }

      log("info", "ReportedMessage", "Deletion complete", {
        userId,
        guildId,
        total: uniqueMessages.length,
        deleted,
        failed: errors.length,
      });

      return { total: uniqueMessages.length, deleted };
    },
    { userId, guildId },
  );
}

/**
 * Deletes a report from the database. Should only be used if the corresponding log message accompanying the report has been deleted.
 *
 * @param reportId - The ID of the report to delete.
 * @returns A promise that resolves when the report is deleted.
 */
export async function deleteReport(reportId: string) {
  return trackPerformance(
    "deleteReport",
    async () => {
      await db
        .deleteFrom("reported_messages")
        .where("id", "=", reportId)
        .execute();
    },
    { reportId },
  );
}

/**
 * Marks a specific reported message as deleted
 */
export async function markMessageAsDeleted(messageId: string, guildId: string) {
  return trackPerformance(
    "markMessageAsDeleted",
    async () => {
      const result = await db
        .updateTable("reported_messages")
        .set("deleted_at", new Date().toISOString())
        .where("reported_message_id", "=", messageId)
        .where("guild_id", "=", guildId)
        .where("deleted_at", "is", null) // Only update if not already marked as deleted
        .execute();

      return { updatedCount: result.length };
    },
    { messageId, guildId },
  );
}
