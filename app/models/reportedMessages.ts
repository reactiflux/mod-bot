import type { Message, User } from "discord.js";
import { Effect } from "effect";
import type { Selectable } from "kysely";

import { DatabaseService, DatabaseServiceLive } from "#~/Database";
import db, { type DB } from "#~/db.server";
// Discord-dependent functions (to be migrated when DiscordService is created)

import { client } from "#~/discord/client.server";
import { logEffect } from "#~/effects/observability";
import { runEffect } from "#~/effects/runtime";

export type ReportedMessage = Selectable<DB["reported_messages"]>;

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
  automod = "automod",
}

/**
 * Record a new report in the database.
 * Returns { wasInserted: true } on success, { wasInserted: false } if duplicate.
 */
export const recordReport = (data: {
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
}) =>
  Effect.gen(function* () {
    const dbService = yield* DatabaseService;

    yield* logEffect("info", "ReportedMessage", "Recording report", {
      reportedUserId: data.reportedUserId,
      guildId: data.guildId,
      reason: data.reason,
    });

    const result = yield* dbService.queryWithConstraint(
      () =>
        db
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
          .execute(),
      "recordReport",
      "reported_messages",
    );

    yield* logEffect("info", "ReportedMessage", "Report recorded", {
      reportedUserId: data.reportedUserId,
      guildId: data.guildId,
    });

    return { wasInserted: true, result };
  }).pipe(
    Effect.catchTag("DatabaseConstraintError", (_error) =>
      Effect.gen(function* () {
        yield* logEffect(
          "debug",
          "ReportedMessage",
          "Report already exists (unique constraint)",
          {
            reportedUserId: data.reportedUserId,
            guildId: data.guildId,
            reason: data.reason,
          },
        );
        return { wasInserted: false as const };
      }),
    ),
    Effect.withSpan("recordReport", {
      attributes: {
        reportedUserId: data.reportedUserId,
        guildId: data.guildId,
      },
    }),
  );

/**
 * Get all reports for a specific user in a guild.
 */
export const getReportsForUser = (userId: string, guildId: string) =>
  Effect.gen(function* () {
    const dbService = yield* DatabaseService;

    const reports = yield* dbService.query(
      () =>
        db
          .selectFrom("reported_messages")
          .selectAll()
          .where("reported_user_id", "=", userId)
          .where("guild_id", "=", guildId)
          .execute(),
      "getReportsForUser",
    );

    return reports;
  }).pipe(
    Effect.withSpan("getReportsForUser", { attributes: { userId, guildId } }),
  );

/**
 * Get all reports for a specific message.
 */
export const getReportsForMessage = (
  messageId: string,
  guildId: string,
  includeDeleted = false,
) =>
  Effect.gen(function* () {
    const dbService = yield* DatabaseService;

    let query = db
      .selectFrom("reported_messages")
      .selectAll()
      .where("reported_message_id", "=", messageId)
      .where("guild_id", "=", guildId);

    if (!includeDeleted) {
      query = query.where("deleted_at", "is", null);
    }

    const reports = yield* dbService.query(
      () => query.orderBy("created_at", "desc").execute(),
      "getReportsForMessage",
    );

    yield* logEffect(
      "debug",
      "ReportedMessage",
      `Found ${reports.length} reports`,
      { messageId, guildId, includeDeleted },
    );

    return reports;
  }).pipe(
    Effect.withSpan("getReportsForMessage", {
      attributes: { messageId, guildId, includeDeleted },
    }),
  );

/**
 * Get report statistics for a user in a guild.
 */
export const getUserReportStats = (userId: string, guildId: string) =>
  Effect.gen(function* () {
    const dbService = yield* DatabaseService;

    const [totalReports, uniqueMessages, uniqueChannels] = yield* Effect.all([
      dbService.query(
        () =>
          db
            .selectFrom("reported_messages")
            .select(db.fn.count("id").as("count"))
            .where("reported_user_id", "=", userId)
            .where("guild_id", "=", guildId)
            .where("deleted_at", "is", null)
            .executeTakeFirstOrThrow(),
        "getUserReportStats.totalReports",
      ),
      dbService.query(
        () =>
          db
            .selectFrom("reported_messages")
            .select(({ fn }) =>
              fn.count("reported_message_id").distinct().as("count"),
            )
            .where("reported_user_id", "=", userId)
            .where("guild_id", "=", guildId)
            .where("deleted_at", "is", null)
            .executeTakeFirstOrThrow(),
        "getUserReportStats.uniqueMessages",
      ),
      dbService.query(
        () =>
          db
            .selectFrom("reported_messages")
            .select(({ fn }) =>
              fn.count("reported_channel_id").distinct().as("count"),
            )
            .where("reported_user_id", "=", userId)
            .where("guild_id", "=", guildId)
            .where("deleted_at", "is", null)
            .executeTakeFirstOrThrow(),
        "getUserReportStats.uniqueChannels",
      ),
    ]);

    return {
      reportCount: Number(totalReports.count),
      uniqueMessages: Number(uniqueMessages.count),
      uniqueChannels: Number(uniqueChannels.count),
      allReports: [] as ReportedMessage[], // Legacy compatibility
    };
  }).pipe(
    Effect.withSpan("getUserReportStats", { attributes: { userId, guildId } }),
  );

/**
 * Delete a report from the database.
 */
export const deleteReport = (reportId: string) =>
  Effect.gen(function* () {
    const dbService = yield* DatabaseService;

    yield* dbService.query(
      () =>
        db.deleteFrom("reported_messages").where("id", "=", reportId).execute(),
      "deleteReport",
    );
  }).pipe(Effect.withSpan("deleteReport", { attributes: { reportId } }));

/**
 * Mark a message as deleted in the database.
 */
export const markMessageAsDeleted = (messageId: string, guildId: string) =>
  Effect.gen(function* () {
    const dbService = yield* DatabaseService;

    const result = yield* dbService.query(
      () =>
        db
          .updateTable("reported_messages")
          .set("deleted_at", new Date().toISOString())
          .where("reported_message_id", "=", messageId)
          .where("guild_id", "=", guildId)
          .where("deleted_at", "is", null)
          .execute(),
      "markMessageAsDeleted",
    );

    return { updatedCount: result.length };
  }).pipe(
    Effect.withSpan("markMessageAsDeleted", {
      attributes: { messageId, guildId },
    }),
  );

/**
 * Get unique non-deleted message IDs for a user.
 */
export const getUniqueNonDeletedMessages = (userId: string, guildId: string) =>
  Effect.gen(function* () {
    const dbService = yield* DatabaseService;

    return yield* dbService.query(
      () =>
        db
          .selectFrom("reported_messages")
          .select(["reported_message_id", "reported_channel_id"])
          .distinct()
          .where("reported_user_id", "=", userId)
          .where("guild_id", "=", guildId)
          .where("deleted_at", "is", null)
          .execute(),
      "getUniqueNonDeletedMessages",
    );
  }).pipe(
    Effect.withSpan("getUniqueNonDeletedMessages", {
      attributes: { userId, guildId },
    }),
  );

/**
 * Deletes a single Discord message and marks it as deleted in database.
 * Uses Effect-native logging.
 * @internal
 */
const deleteSingleMessage = (
  messageId: string,
  channelId: string,
  guildId: string,
) =>
  Effect.gen(function* () {
    const channel = yield* Effect.tryPromise({
      try: () => client.channels.fetch(channelId),
      catch: (error) => error,
    });

    if (!channel || !("messages" in channel)) {
      yield* logEffect(
        "warn",
        "ReportedMessage",
        "Channel not found or not a text channel",
        {
          messageId,
          channelId,
        },
      );
      return { success: false as const, messageId, error: "Channel not found" };
    }

    const result = yield* Effect.tryPromise({
      try: async () => {
        const message = await channel.messages.fetch(messageId);
        await message.delete();
        return { deleted: true };
      },
      catch: (error) => error,
    }).pipe(
      Effect.catchAll((error) => {
        // If message is already deleted, that's fine - mark it as deleted in DB
        if (
          error instanceof Error &&
          error.message.includes("Unknown Message")
        ) {
          return Effect.succeed({ deleted: false, alreadyGone: true });
        }
        return Effect.fail(error);
      }),
    );

    // Mark as deleted in database
    yield* Effect.provide(
      markMessageAsDeleted(messageId, guildId),
      DatabaseServiceLive,
    );

    if (result.deleted) {
      yield* logEffect("debug", "ReportedMessage", "Deleted message", {
        messageId,
      });
    } else {
      yield* logEffect("debug", "ReportedMessage", "Message already deleted", {
        messageId,
      });
    }

    return { success: true as const, messageId };
  }).pipe(
    Effect.catchAll((error) => {
      return Effect.gen(function* () {
        yield* logEffect(
          "warn",
          "ReportedMessage",
          "Failed to delete message",
          {
            messageId,
            error: error instanceof Error ? error.message : String(error),
          },
        );
        return { success: false as const, messageId, error };
      });
    }),
  );

/**
 * Delete all reported messages for a user.
 * Uses Effect-native logging throughout.
 */
export const deleteAllReportedForUserEffect = (
  userId: string,
  guildId: string,
) =>
  Effect.gen(function* () {
    const uniqueMessages = yield* Effect.provide(
      getUniqueNonDeletedMessages(userId, guildId),
      DatabaseServiceLive,
    );

    if (uniqueMessages.length === 0) {
      yield* logEffect("info", "ReportedMessage", "No messages to delete", {
        userId,
        guildId,
      });
      return { total: 0, deleted: 0 };
    }

    yield* logEffect("info", "ReportedMessage", "Starting message deletion", {
      userId,
      guildId,
      messageCount: uniqueMessages.length,
    });

    let deleted = 0;
    const errors: { messageId: string; error: unknown }[] = [];

    for (const { reported_message_id, reported_channel_id } of uniqueMessages) {
      const result = yield* deleteSingleMessage(
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

    yield* logEffect("info", "ReportedMessage", "Deletion complete", {
      userId,
      guildId,
      total: uniqueMessages.length,
      deleted,
      failed: errors.length,
    });

    return { total: uniqueMessages.length, deleted };
  }).pipe(
    Effect.withSpan("deleteAllReportedForUser", {
      attributes: { userId, guildId },
    }),
  );

/**
 * Delete all reported messages for a user.
 * Legacy wrapper that runs the Effect.
 */
export const deleteAllReportedForUser = (userId: string, guildId: string) =>
  runEffect(deleteAllReportedForUserEffect(userId, guildId));
