import { formatDistanceToNowStrict } from "date-fns";
import {
  AutoModerationActionType,
  messageLink,
  MessageReferenceType,
  type AnyThreadChannel,
  type APIEmbed,
  type Guild,
  type Message,
  type MessageCreateOptions,
  type PartialUser,
  type PrivateThreadChannel,
  type PublicThreadChannel,
  type User,
} from "discord.js";
import { Effect } from "effect";

import { DatabaseServiceLive, type DatabaseService } from "#~/Database";
import { DiscordApiError, type DatabaseError } from "#~/effects/errors";
import { logEffect } from "#~/effects/observability";
import { runEffect } from "#~/effects/runtime";
import {
  constructDiscordLink,
  describeAttachments,
  describeReactions,
  escapeDisruptiveContent,
  getMessageStats,
  quoteAndEscape,
  quoteAndEscapePoll,
} from "#~/helpers/discord";
import { truncateMessage } from "#~/helpers/string";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";
import {
  getReportsForMessage,
  getUserReportStats,
  recordReport,
  ReportReasons,
  type Report,
} from "#~/models/reportedMessages";
import { getOrCreateUserThread } from "#~/models/userThreads.ts";

const ReadableReasons: Record<ReportReasons, string> = {
  [ReportReasons.anonReport]: "Reported anonymously",
  [ReportReasons.track]: "tracked",
  [ReportReasons.modResolution]: "Mod vote resolved",
  [ReportReasons.spam]: "detected as spam",
  [ReportReasons.automod]: "detected by automod",
};

const isForwardedMessage = (message: Message): boolean => {
  return message.reference?.type === MessageReferenceType.Forward;
};

const getMessageContent = (message: Message): string => {
  if (isForwardedMessage(message)) {
    // For forwards, content is in the snapshot
    const snapshot = message.messageSnapshots.first();
    return snapshot?.content ?? message.content;
  }
  return message.content;
};

interface Reported {
  message: Message;
  warnings: number;
  thread: AnyThreadChannel;
  latestReport?: Message;
  reportId: string;
}

export interface AutomodReport {
  guild: Guild;
  user: User;
  content: string;
  channelId?: string;
  messageId?: string;
  ruleName: string;
  matchedKeyword?: string;
  actionType: AutoModerationActionType;
}

const ActionTypeLabels: Record<AutoModerationActionType, string> = {
  [AutoModerationActionType.BlockMessage]: "blocked message",
  [AutoModerationActionType.SendAlertMessage]: "sent alert",
  [AutoModerationActionType.Timeout]: "timed out user",
  [AutoModerationActionType.BlockMemberInteraction]: "blocked interaction",
};

const reportAutomod = ({
  guild,
  user,
  channelId,
  ruleName,
  matchedKeyword,
  actionType,
}: AutomodReport) =>
  Effect.gen(function* () {
    yield* logEffect(
      "info",
      "reportAutomod",
      `Automod triggered for ${user.username}`,
      {
        userId: user.id,
        guildId: guild.id,
        ruleName,
        actionType,
      },
    );

    // Get or create persistent user thread
    const thread = yield* getOrCreateUserThread(guild, user);

    // Get mod log for forwarding
    const { modLog, moderator } = yield* Effect.tryPromise({
      try: () => fetchSettings(guild.id, [SETTINGS.modLog, SETTINGS.moderator]),
      catch: (error) =>
        new DiscordApiError({
          operation: "fetchSettings",
          discordError: error,
        }),
    });

    // Construct the log message
    const channelMention = channelId ? `<#${channelId}>` : "Unknown channel";
    const actionLabel = ActionTypeLabels[actionType] ?? "took action";

    const logContent = truncateMessage(
      `<@${user.id}> (${user.username}) triggered automod ${matchedKeyword ? `with text  \`${matchedKeyword}\` ` : ""}in ${channelMention}
-# ${ruleName} · Automod ${actionLabel}`,
    ).trim();

    // Send log to thread
    const logMessage = yield* Effect.tryPromise({
      try: () =>
        thread.send({
          content: logContent,
          allowedMentions: { roles: [moderator] },
        }),
      catch: (error) =>
        new DiscordApiError({
          operation: "sendLogMessage",
          discordError: error,
        }),
    });

    // Forward to mod log (non-critical)
    yield* Effect.tryPromise({
      try: () => logMessage.forward(modLog),
      catch: (error) => error,
    }).pipe(
      Effect.catchAll((error) =>
        logEffect("error", "reportAutomod", "failed to forward to modLog", {
          error: String(error),
        }),
      ),
    );
  }).pipe(
    Effect.withSpan("reportAutomod", {
      attributes: { userId: user.id, guildId: guild.id, ruleName },
    }),
  );

/**
 * Reports an automod action when we don't have a full Message object.
 * Used when Discord's automod blocks/deletes a message before we can fetch it.
 */
export const reportAutomodLegacy = (report: AutomodReport): Promise<void> =>
  runEffect(Effect.provide(reportAutomod(report), DatabaseServiceLive));

export type ModActionReport =
  | {
      guild: Guild;
      user: User;
      actionType: "kick" | "ban";
      executor: User | PartialUser | null;
      reason: string;
    }
  | {
      guild: Guild;
      user: User;
      actionType: "left";
      executor: undefined;
      reason: undefined;
    };

const reportModAction = ({
  guild,
  user,
  actionType,
  executor,
  reason,
}: ModActionReport) =>
  Effect.gen(function* () {
    yield* logEffect(
      "info",
      "reportModAction",
      `${actionType} detected for ${user.username}`,
      {
        userId: user.id,
        guildId: guild.id,
        actionType,
        executorId: executor?.id,
        reason,
      },
    );

    if (actionType === "left") {
      return;
    }

    // Get or create persistent user thread
    const thread = yield* getOrCreateUserThread(guild, user);

    // Get mod log for forwarding
    const { modLog, moderator } = yield* Effect.tryPromise({
      try: () => fetchSettings(guild.id, [SETTINGS.modLog, SETTINGS.moderator]),
      catch: (error) =>
        new DiscordApiError({
          operation: "fetchSettings",
          discordError: error,
        }),
    });

    // Construct the log message
    const actionLabels: Record<ModActionReport["actionType"], string> = {
      ban: "was banned",
      kick: "was kicked",
      left: "left",
    };
    const actionLabel = actionLabels[actionType];
    const executorMention = executor
      ? ` by <@${executor.id}> (${executor.username})`
      : " by unknown";

    const reasonText = reason ? ` ${reason}` : " for no reason";

    const logContent = truncateMessage(
      `<@${user.id}> (${user.username}) ${actionLabel}
-# ${executorMention}${reasonText} <t:${Math.floor(Date.now() / 1000)}:R>`,
    ).trim();

    // Send log to thread
    const logMessage = yield* Effect.tryPromise({
      try: () =>
        thread.send({
          content: logContent,
          allowedMentions: { roles: [moderator] },
        }),
      catch: (error) =>
        new DiscordApiError({
          operation: "sendLogMessage",
          discordError: error,
        }),
    });

    // Forward to mod log (non-critical)
    yield* Effect.tryPromise({
      try: () => logMessage.forward(modLog),
      catch: (error) => error,
    }).pipe(
      Effect.catchAll((error) =>
        logEffect("error", "reportModAction", "failed to forward to modLog", {
          error: String(error),
        }),
      ),
    );
  }).pipe(
    Effect.withSpan("reportModAction", {
      attributes: { userId: user.id, guildId: guild.id, actionType },
    }),
  );

/**
 * Reports a mod action (kick/ban) to the user's persistent thread.
 * Used when Discord events indicate a kick or ban occurred.
 */
export const reportModActionLegacy = (report: ModActionReport): Promise<void> =>
  runEffect(Effect.provide(reportModAction(report), DatabaseServiceLive));

// : Effect<>
function reportUser({
  reason,
  message,
  extra,
  staff,
}: Omit<Report, "date">): Effect.Effect<
  {
    warnings: number;
    message: Message<boolean>;
    latestReport?: Message<true>;
    thread: PublicThreadChannel | PrivateThreadChannel;
    allReportedMessages: Report[];
    reportId: string;
  },
  DatabaseError,
  DatabaseService
> {
  return Effect.gen(function* () {
    const { guild, author } = message;
    if (!guild) {
      return yield* Effect.fail(
        new DiscordApiError({
          operation: "reportUser",
          discordError: new Error("Tried to report a message without a guild"),
        }),
      );
    }

    // Check if this exact message has already been reported
    const [existingReports, { modLog }] = yield* Effect.all([
      getReportsForMessage(message.id, guild.id),
      Effect.tryPromise({
        try: () => fetchSettings(guild.id, [SETTINGS.modLog]),
        catch: (error) =>
          new DiscordApiError({
            operation: "fetchSettings",
            discordError: error,
          }),
      }),
    ]);

    const alreadyReported = existingReports.find(
      (r) => r.reported_message_id === message.id,
    );

    yield* logEffect(
      "info",
      "reportUser",
      `${author.username}, ${reason}. ${alreadyReported ? "already reported" : "new report"}.`,
      { userId: author.id, guildId: guild.id, reason },
    );

    // Get or create persistent user thread first
    const thread = yield* getOrCreateUserThread(guild, author);

    if (alreadyReported && reason !== ReportReasons.modResolution) {
      // Message already reported with this reason, just add to thread
      const latestReport = yield* Effect.tryPromise({
        try: async () => {
          const priorLogMessage = await thread.messages.fetch(
            alreadyReported.log_message_id,
          );
          const reportContents = makeReportMessage({ message, reason, staff });
          return priorLogMessage
            .reply(reportContents)
            .catch(() => priorLogMessage.channel.send(reportContents));
        },
        catch: (error) => error,
      });

      yield* logEffect("info", "reportUser", "exact message already logged", {
        userId: author.id,
        guildId: guild.id,
      });

      const userStats = yield* getUserReportStats(message.author.id, guild.id);
      return {
        reportId: alreadyReported.id,
        warnings: userStats.reportCount,
        message: thread.lastMessage!,
        latestReport,
        thread,
        allReportedMessages: [] as Report[],
      };
    }

    yield* logEffect("info", "reportUser", "new message reported", {
      userId: author.id,
      guildId: guild.id,
    });

    // Get user stats for constructing the log
    const previousWarnings = yield* getUserReportStats(author.id, guild.id);

    // Send detailed report info to the user thread
    const logBody = yield* constructLog({
      extra,
      logs: [{ message, reason, staff }],
      staff,
    });

    // For forwarded messages, get attachments from the snapshot
    const attachments = isForwardedMessage(message)
      ? (message.messageSnapshots.first()?.attachments ?? message.attachments)
      : message.attachments;

    const embeds = [
      describeAttachments(attachments),
      describeReactions(message.reactions.cache),
    ].filter((e): e is APIEmbed => Boolean(e));

    // If it has the data for a poll, use a specialized formatting function
    const reportedMessage = message.poll
      ? quoteAndEscapePoll(message.poll)
      : quoteAndEscape(getMessageContent(message)).trim();

    // Send the detailed log message to thread
    const [logMessage] = yield* Effect.tryPromise({
      try: () =>
        Promise.all([
          thread.send(logBody),
          thread.send({
            content: reportedMessage,
            allowedMentions: {},
            embeds: embeds.length === 0 ? undefined : embeds,
          }),
        ]),
      catch: (error) =>
        new DiscordApiError({
          operation: "sendLogMessages",
          discordError: error,
        }),
    });

    // Record the report in database
    const recordResult = yield* recordReport({
      reportedMessageId: message.id,
      reportedChannelId: message.channel.id,
      reportedUserId: author.id,
      guildId: guild.id,
      logMessageId: logMessage.id,
      logChannelId: thread.id,
      reason,
      staffId: staff ? staff.id : undefined,
      staffUsername: staff ? staff.username : undefined,
      extra,
    });

    if (!recordResult.wasInserted) {
      yield* logEffect(
        "warn",
        "reportUser",
        "duplicate detected at database level",
        { userId: author.id, guildId: guild.id },
      );
    }

    // Forward to mod log (non-critical)
    yield* Effect.tryPromise({
      try: () => logMessage.forward(modLog),
      catch: (error) => error,
    }).pipe(
      Effect.catchAll((error) =>
        logEffect("error", "reportUser", "failed to forward to modLog", {
          error: String(error),
        }),
      ),
    );

    // Send summary to parent channel if possible (non-critical)
    const parentChannel = thread.parent;
    if (parentChannel?.isSendable()) {
      const content = isForwardedMessage(message)
        ? getMessageContent(message)
        : message.cleanContent;
      const singleLine = content.slice(0, 80).replaceAll("\n", "\\n ");
      const truncatedMsg =
        singleLine.length > 80 ? `${singleLine.slice(0, 80)}…` : singleLine;

      yield* Effect.tryPromise({
        try: async () => {
          const stats = await getMessageStats(message).catch(() => undefined);
          await parentChannel.send({
            allowedMentions: {},
            content: `> ${escapeDisruptiveContent(truncatedMsg)}\n-# [${!stats ? "stats failed to load" : `${stats.char_count} chars in ${stats.word_count} words. ${stats.link_stats.length} links, ${stats.code_stats.reduce((count, { lines }) => count + lines, 0)} lines of code. ${message.attachments.size} attachments, ${message.reactions.cache.size} reactions`}](${messageLink(logMessage.channelId, logMessage.id)})`,
          });
        },
        catch: (error) =>
          logEffect("error", "reportUser", "failed to send stats", { error }),
      });
    }

    return {
      warnings: previousWarnings.reportCount + 1,
      message: logMessage,
      latestReport: undefined,
      thread,
      allReportedMessages: [],
      reportId: recordResult.reportId,
    };
  }).pipe(
    Effect.withSpan("reportUser", {
      attributes: {
        userId: message.author.id,
        guildId: message.guild?.id,
        reason,
      },
    }),
  );
}

export const reportUserLegacy = ({
  reason,
  message,
  extra,
  staff,
}: Omit<Report, "date">): Promise<
  Reported & { allReportedMessages: Report[] }
> =>
  runEffect(
    Effect.provide(
      reportUser({ reason, message, extra, staff }),
      DatabaseServiceLive,
    ),
  );

const makeReportMessage = ({ message: _, reason, staff }: Report) => {
  return {
    content: `${staff ? ` ${staff.username} ` : ""}${ReadableReasons[reason]}`,
  };
};

const constructLog = ({
  logs,
  extra: origExtra = "",
}: Pick<Report, "extra" | "staff"> & {
  logs: Report[];
}) =>
  Effect.gen(function* () {
    const lastReport = logs.at(-1);
    if (!lastReport?.message.guild) {
      return yield* Effect.fail(
        new DiscordApiError({
          operation: "constructLog",
          discordError: new Error(
            "Something went wrong when trying to retrieve last report",
          ),
        }),
      );
    }
    const { message } = lastReport;
    const { author } = message;
    const { moderator } = yield* Effect.tryPromise({
      try: () =>
        fetchSettings(lastReport.message.guild!.id, [SETTINGS.moderator]),
      catch: (error) =>
        new DiscordApiError({
          operation: "fetchSettings",
          discordError: error,
        }),
    });

    // This should never be possible but we gotta satisfy types
    if (!moderator) {
      return yield* Effect.fail(
        new DiscordApiError({
          operation: "constructLog",
          discordError: new Error("No role configured to be used as moderator"),
        }),
      );
    }

    const { content: report } = makeReportMessage(lastReport);

    // Add indicator if this is forwarded content
    const forwardNote = isForwardedMessage(message) ? " (forwarded)" : "";
    const preface = `${constructDiscordLink(message)} by <@${author.id}> (${
      author.username
    })${forwardNote}`;
    const extra = origExtra ? `${origExtra}\n` : "";

    return {
      content: truncateMessage(`${preface}
-# ${report}
-# ${extra}${formatDistanceToNowStrict(lastReport.message.createdAt)} ago · <t:${Math.floor(lastReport.message.createdTimestamp / 1000)}:R>`).trim(),
      allowedMentions: { roles: [moderator] },
    } satisfies MessageCreateOptions;
  });
