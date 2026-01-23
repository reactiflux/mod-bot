import {
  messageLink,
  type AnyThreadChannel,
  type APIEmbed,
  type Message,
} from "discord.js";
import { Effect } from "effect";

import {
  DatabaseLayer,
  type DatabaseService,
  type SqlError,
} from "#~/Database";
import { DiscordApiError } from "#~/effects/errors";
import { logEffect } from "#~/effects/observability";
import { runEffect } from "#~/effects/runtime";
import {
  describeAttachments,
  describeReactions,
  escapeDisruptiveContent,
  getMessageStats,
  quoteAndEscape,
  quoteAndEscapePoll,
} from "#~/helpers/discord";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";
import {
  getReportsForMessage,
  getUserReportStats,
  recordReport,
  ReportReasons,
  type Report,
} from "#~/models/reportedMessages";
import { getOrCreateUserThread } from "#~/models/userThreads.ts";

import {
  constructLog,
  isForwardedMessage,
  makeReportMessage,
} from "./constructLog";

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

export function logUserMessage({
  reason,
  message,
  extra,
  staff,
}: Omit<Report, "date">): Effect.Effect<
  {
    warnings: number;
    message: Message<boolean>;
    latestReport?: Message<true>;
    thread: AnyThreadChannel;
    allReportedMessages: Report[];
    reportId: string;
  },
  DiscordApiError | SqlError,
  DatabaseService
> {
  return Effect.gen(function* () {
    const { guild, author } = message;
    if (!guild) {
      return yield* Effect.fail(
        new DiscordApiError({
          operation: "logUserMessage",
          cause: new Error("Tried to log a message without a guild"),
        }),
      );
    }

    // Check if this exact message has already been reported
    const [existingReports, { modLog }, logBody, thread] = yield* Effect.all([
      getReportsForMessage(message.id, guild.id),
      Effect.tryPromise({
        try: () => fetchSettings(guild.id, [SETTINGS.modLog]),
        catch: (error) =>
          new DiscordApiError({
            operation: "fetchSettings",
            cause: error,
          }),
      }),
      constructLog({
        extra,
        logs: [{ message, reason, staff }],
        staff,
      }),
      getOrCreateUserThread(guild, author),
    ]);

    const alreadyReported = existingReports.find(
      (r) => r.reported_message_id === message.id,
    );

    yield* logEffect(
      "info",
      "logUserMessage",
      `${author.username}, ${reason}. ${alreadyReported ? "already reported" : "new report"}.`,
      { userId: author.id, guildId: guild.id, reason },
    );

    if (alreadyReported && reason !== ReportReasons.modResolution) {
      // Message already reported with this reason, just add to thread
      const latestReport = yield* Effect.tryPromise({
        try: async () => {
          try {
            const reportContents = makeReportMessage({
              message,
              reason,
              staff,
            });
            const priorLogMessage = await thread.messages.fetch(
              alreadyReported.log_message_id,
            );
            return priorLogMessage
              .reply(reportContents)
              .catch(() => priorLogMessage.channel.send(reportContents));
          } catch (_) {
            return thread.send(logBody);
          }
        },
        catch: (error) =>
          new DiscordApiError({
            operation: "logUserMessage existing",
            cause: error,
          }),
      });

      yield* logEffect(
        "info",
        "logUserMessage",
        "exact message already logged",
        {
          userId: author.id,
          guildId: guild.id,
        },
      );

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

    yield* logEffect("info", "logUserMessage", "new message reported", {
      userId: author.id,
      guildId: guild.id,
    });

    // Get user stats for constructing the log
    const previousWarnings = yield* getUserReportStats(author.id, guild.id);

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
          cause: error,
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
        "logUserMessage",
        "duplicate detected at database level",
        { userId: author.id, guildId: guild.id },
      );
    }

    // Forward to mod log (non-critical)
    yield* Effect.tryPromise({
      try: () => logMessage.forward(modLog),
      catch: (error) =>
        new DiscordApiError({ operation: "forwardLog", cause: error }),
    }).pipe(
      Effect.catchAll((error) =>
        logEffect("error", "logUserMessage", "failed to forward to modLog", {
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

      const stats = yield* getMessageStats(message).pipe(
        Effect.catchAll(() => Effect.succeed(undefined)),
      );

      yield* Effect.tryPromise({
        try: async () => {
          await parentChannel.send({
            allowedMentions: {},
            content: `> ${escapeDisruptiveContent(truncatedMsg)}\n-# [${!stats ? "stats failed to load" : `${stats.char_count} chars in ${stats.word_count} words. ${stats.link_stats.length} links, ${stats.code_stats.reduce((count, { lines }) => count + lines, 0)} lines of code. ${message.attachments.size} attachments, ${message.reactions.cache.size} reactions`}](${messageLink(logMessage.channelId, logMessage.id)})`,
          });
        },
        catch: (error) =>
          new DiscordApiError({
            operation: "logUserMessage",
            cause: error,
          }),
      }).pipe(
        Effect.catchAll((error) =>
          logEffect("error", "logUserMessage", "failed to forward to modLog", {
            error: String(error),
          }),
        ),
      );
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
    Effect.withSpan("logUserMessage", {
      attributes: {
        userId: message.author.id,
        guildId: message.guild?.id,
        reason,
      },
    }),
  );
}

export const logUserMessageLegacy = ({
  reason,
  message,
  extra,
  staff,
}: Omit<Report, "date">): Promise<
  Reported & { allReportedMessages: Report[] }
> =>
  runEffect(
    Effect.provide(
      logUserMessage({ reason, message, extra, staff }),
      DatabaseLayer,
    ),
  );
