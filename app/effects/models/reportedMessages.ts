import type { Message, User } from "discord.js";
import { Effect } from "effect";
import type { Selectable } from "kysely";

import db, { type DB } from "#~/db.server.js";
// =============================================================================
// Discord-dependent functions (to be migrated when DiscordService is created)
// =============================================================================

import { client } from "#~/discord/client.server.js";
import { log } from "#~/helpers/observability.js";

import { logEffect } from "../observability.js";
import { runEffect } from "../runtime.js";
import { DatabaseService, DatabaseServiceLive } from "../services/Database.js";

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Effect-based functions
// =============================================================================

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

// =============================================================================
// Legacy wrappers for backward compatibility
// =============================================================================

const runWithDb = <A, E>(effect: Effect.Effect<A, E, DatabaseService>) =>
  runEffect(Effect.provide(effect, DatabaseServiceLive));

/** @deprecated Use the Effect-based version directly when possible. */
export const recordReportLegacy = (data: Parameters<typeof recordReport>[0]) =>
  runWithDb(recordReport(data));

/** @deprecated Use the Effect-based version directly when possible. */
export const getReportsForUserLegacy = (userId: string, guildId: string) =>
  runWithDb(getReportsForUser(userId, guildId));

/** @deprecated Use the Effect-based version directly when possible. */
export const getReportsForMessageLegacy = (
  messageId: string,
  guildId: string,
  includeDeleted = false,
) => runWithDb(getReportsForMessage(messageId, guildId, includeDeleted));

/** @deprecated Use the Effect-based version directly when possible. */
export const getUserReportStatsLegacy = (userId: string, guildId: string) =>
  runWithDb(getUserReportStats(userId, guildId));

/** @deprecated Use the Effect-based version directly when possible. */
export const deleteReportLegacy = (reportId: string) =>
  runWithDb(deleteReport(reportId));

/** @deprecated Use the Effect-based version directly when possible. */
export const markMessageAsDeletedLegacy = (
  messageId: string,
  guildId: string,
) => runWithDb(markMessageAsDeleted(messageId, guildId));

/** @deprecated Use the Effect-based version directly when possible. */
export const getUniqueNonDeletedMessagesLegacy = (
  userId: string,
  guildId: string,
) => runWithDb(getUniqueNonDeletedMessages(userId, guildId));

/**
 * Deletes a single Discord message and marks it as deleted in database.
 * @internal
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
    await markMessageAsDeletedLegacy(messageId, guildId);

    log("debug", "ReportedMessage", "Deleted message", { messageId });
    return { success: true, messageId };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unknown Message")) {
      await markMessageAsDeletedLegacy(messageId, guildId);
      return { success: true, messageId };
    }

    log("warn", "ReportedMessage", "Failed to delete message", {
      messageId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, messageId, error };
  }
}

/**
 * Delete all reported messages for a user.
 * This function still uses the Discord client directly.
 * TODO: Migrate to Effect when DiscordService is created.
 */
export async function deleteAllReportedForUser(
  userId: string,
  guildId: string,
) {
  const uniqueMessages = await getUniqueNonDeletedMessagesLegacy(
    userId,
    guildId,
  );

  if (uniqueMessages.length === 0) {
    log("info", "ReportedMessage", "No messages to delete", {
      userId,
      guildId,
    });
    return { total: 0, deleted: 0 };
  }

  let deleted = 0;
  const errors: { messageId: string; error: unknown }[] = [];

  for (const { reported_message_id, reported_channel_id } of uniqueMessages) {
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
}
