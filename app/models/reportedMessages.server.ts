import type { Message, User } from "discord.js";

import type { DB } from "#~/db.server";
import db from "#~/db.server";
import { log, trackPerformance } from "#~/helpers/observability";

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
      log("debug", "ReportedMessage", "Fetching reports for user", {
        userId,
        guildId,
      });

      const reports = await db
        .selectFrom("reported_messages")
        .selectAll()
        .where("reported_user_id", "=", userId)
        .where("guild_id", "=", guildId)
        .execute();

      log("debug", "ReportedMessage", `Found ${reports.length} reports`, {
        userId,
        guildId,
      });
      return reports;
    },
    { userId, guildId },
  );
}

export async function getReportsForMessage(messageId: string, guildId: string) {
  return trackPerformance(
    "getReportsForMessage",
    async () => {
      log("debug", "ReportedMessage", "Fetching reports for message", {
        messageId,
        guildId,
      });

      const reports = await db
        .selectFrom("reported_messages")
        .selectAll()
        .where("reported_message_id", "=", messageId)
        .where("guild_id", "=", guildId)
        .execute();

      log("debug", "ReportedMessage", `Found ${reports.length} reports`, {
        messageId,
        guildId,
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
      log("debug", "ReportedMessage", "Calculating stats for user", {
        userId,
        guildId,
      });

      const [totalReports, uniqueMessages, uniqueChannels] = await Promise.all([
        db
          .selectFrom("reported_messages")
          .select(db.fn.count("id").as("count"))
          .where("reported_user_id", "=", userId)
          .where("guild_id", "=", guildId)
          .executeTakeFirstOrThrow(),

        db
          .selectFrom("reported_messages")
          .select(({ fn }) =>
            fn.count("reported_message_id").distinct().as("count"),
          )
          .where("reported_user_id", "=", userId)
          .where("guild_id", "=", guildId)
          .executeTakeFirstOrThrow(),

        db
          .selectFrom("reported_messages")
          .select(({ fn }) =>
            fn.count("reported_channel_id").distinct().as("count"),
          )
          .where("reported_user_id", "=", userId)
          .where("guild_id", "=", guildId)
          .executeTakeFirstOrThrow(),
      ]);

      const stats = {
        reportCount: Number(totalReports.count),
        uniqueMessages: Number(uniqueMessages.count),
        uniqueChannels: Number(uniqueChannels.count),
        allReports: [], // Legacy compatibility - could fetch if needed
      };

      log("debug", "ReportedMessage", "Calculated stats", {
        userId,
        guildId,
        stats,
      });
      return stats;
    },
    { userId, guildId },
  );
}

export async function deleteAllReportedForUser(
  userId: string,
  guildId: string,
) {
  return trackPerformance(
    "deleteAllReportedForUser",
    async () => {
      log("info", "ReportedMessage", "Deleting all reported messages", {
        userId,
        guildId,
      });

      const reports = await getReportsForUser(userId, guildId);

      const deleteResults = await Promise.allSettled(
        reports.map(async (report) => {
          try {
            // Import here to avoid circular dependency
            const { client } = await import("#~/discord/client.server");
            const channel = await client.channels.fetch(
              report.reported_channel_id,
            );
            if (!channel || !("messages" in channel)) {
              throw new Error("Channel not found or not a text channel");
            }
            const message = await channel.messages.fetch(
              report.reported_message_id,
            );
            await message.delete();
            log("debug", "ReportedMessage", "Deleted message", {
              messageId: report.reported_message_id,
            });
          } catch (error) {
            log("warn", "ReportedMessage", "Failed to delete message", {
              messageId: report.reported_message_id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }),
      );

      const deleted = deleteResults.filter(
        (r) => r.status === "fulfilled",
      ).length;
      log("info", "ReportedMessage", "Deletion complete", {
        userId,
        guildId,
        total: reports.length,
        deleted,
      });

      return { total: reports.length, deleted };
    },
    { userId, guildId },
  );
}
