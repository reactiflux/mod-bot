import { formatDistanceToNowStrict } from "date-fns";
import {
  AutoModerationActionType,
  ChannelType,
  messageLink,
  MessageReferenceType,
  type AnyThreadChannel,
  type APIEmbed,
  type Guild,
  type Message,
  type MessageCreateOptions,
  type TextChannel,
  type User,
} from "discord.js";

import {
  constructDiscordLink,
  describeAttachments,
  describeReactions,
  escapeDisruptiveContent,
  getMessageStats,
  quoteAndEscape,
  quoteAndEscapePoll,
} from "#~/helpers/discord";
import { escalationControls } from "#~/helpers/escalate";
import { truncateMessage } from "#~/helpers/string";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";
import {
  deleteReport,
  getReportsForMessage,
  getUserReportStats,
  recordReport,
  ReportReasons,
  type Report,
} from "#~/models/reportedMessages.server";
import {
  createUserThread,
  getUserThread,
  updateUserThread,
} from "#~/models/userThreads.server";

import { retry } from "./misc";
import { log } from "./observability";

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
}

const makeUserThread = (channel: TextChannel, user: User) => {
  return channel.threads.create({
    name: `${user.username} logs`,
  });
};

const getOrCreateUserThread = async (guild: Guild, user: User) => {
  if (!guild) throw new Error("Message has no guild");

  // Check if we already have a thread for this user
  const existingThread = await getUserThread(user.id, guild.id);

  if (existingThread) {
    try {
      // Verify the thread still exists and is accessible
      const thread = await guild.channels.fetch(existingThread.thread_id);
      if (thread?.isThread()) {
        return thread;
      }
    } catch (error) {
      log(
        "warn",
        "getOrCreateUserThread",
        "Existing thread not accessible, will create new one",
        { error },
      );
    }
  }

  // Create new thread and store in database
  const { modLog: modLogId } = await fetchSettings(guild.id, [SETTINGS.modLog]);
  const modLog = await guild.channels.fetch(modLogId);
  if (!modLog || modLog.type !== ChannelType.GuildText) {
    throw new Error("Invalid mod log channel");
  }

  // Create freestanding private thread
  const thread = await makeUserThread(modLog, user);
  await escalationControls(user.id, thread);

  // Store or update the thread reference
  if (existingThread) {
    await updateUserThread(user.id, guild.id, thread.id);
  } else {
    await createUserThread(user.id, guild.id, thread.id);
  }

  return thread;
};

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

/**
 * Reports an automod action when we don't have a full Message object.
 * Used when Discord's automod blocks/deletes a message before we can fetch it.
 */
export const reportAutomod = async ({
  guild,
  user,
  channelId,
  messageId,
  ruleName,
  matchedKeyword,
  actionType,
}: AutomodReport): Promise<void> => {
  log("info", "reportAutomod", `Automod triggered for ${user.username}`, {
    userId: user.id,
    guildId: guild.id,
    ruleName,
    actionType,
  });

  // Get or create persistent user thread
  const thread = await getOrCreateUserThread(guild, user);

  // Get mod log for forwarding
  const { modLog, moderator } = await fetchSettings(guild.id, [
    SETTINGS.modLog,
    SETTINGS.moderator,
  ]);

  // Construct the log message
  const channelMention = channelId ? `<#${channelId}>` : "Unknown channel";
  const actionLabel = ActionTypeLabels[actionType] ?? "took action";

  const logContent =
    truncateMessage(`<@${user.id}> (${user.username}) triggered automod ${matchedKeyword ? `with text  \`${matchedKeyword}\` ` : ""}in ${channelMention}
-# ${ruleName} · Automod ${actionLabel}`).trim();

  // Send log to thread
  const logMessage = await thread.send({
    content: logContent,
    allowedMentions: { roles: [moderator] },
  });

  // Record to database if we have a messageId
  if (messageId) {
    await retry(3, async () => {
      const result = await recordReport({
        reportedMessageId: messageId,
        reportedChannelId: channelId ?? "unknown",
        reportedUserId: user.id,
        guildId: guild.id,
        logMessageId: logMessage.id,
        logChannelId: thread.id,
        reason: ReportReasons.automod,
        extra: `Rule: ${ruleName}`,
      });

      if (!result.wasInserted) {
        log(
          "warn",
          "reportAutomod",
          "duplicate detected at database level, retrying check",
        );
        throw new Error("Race condition detected in recordReport, retrying…");
      }

      return result;
    });
  }

  // Forward to mod log
  await logMessage.forward(modLog).catch((e) => {
    log("error", "reportAutomod", "failed to forward to modLog", { error: e });
  });
};

// const warningMessages = new ();
export const reportUser = async ({
  reason,
  message,
  extra,
  staff,
}: Omit<Report, "date">): Promise<
  Reported & { allReportedMessages: Report[] }
> => {
  const { guild, author } = message;
  if (!guild) throw new Error("Tried to report a message without a guild");

  // Check if this exact message has already been reported
  const [existingReports, { modLog }] = await Promise.all([
    getReportsForMessage(message.id, guild.id),
    fetchSettings(guild.id, [SETTINGS.modLog]),
  ]);
  const alreadyReported = existingReports.find(
    (r) => r.reported_message_id === message.id,
  );

  log(
    "info",
    "reportUser",
    `${author.username}, ${reason}. ${alreadyReported ? "already reported" : "new report"}.`,
  );

  // Get or create persistent user thread first
  const thread = await getOrCreateUserThread(guild, author);

  if (alreadyReported && reason !== ReportReasons.modResolution) {
    // Message already reported with this reason, just add to thread
    let priorLogMessage: Message<true>, latestReport: Message<true>;
    try {
      priorLogMessage = await thread.messages.fetch(
        alreadyReported.log_message_id,
      );
      latestReport = await priorLogMessage.reply(
        makeReportMessage({ message, reason, staff }),
      );
    } catch (e) {
      // If the error is because the message doesn't exist, post to the thread
      log("warn", "reportUser", "message not found, posting to thread", {
        error: e,
      });
      if (e instanceof Error && e.message.includes("Unknown Message")) {
        latestReport = await thread.send(
          await constructLog({
            extra,
            logs: [{ message, reason, staff }],
            staff,
          }),
        );
        await deleteReport(alreadyReported.id);
        await recordReport({
          reportedMessageId: message.id,
          reportedChannelId: message.channel.id,
          reportedUserId: author.id,
          guildId: guild.id,
          logMessageId: latestReport.id,
          logChannelId: thread.id,
          reason,
        });
      } else {
        throw e;
      }
    }
    log("info", "reportUser", "exact message already logged");

    const userStats = await getUserReportStats(message.author.id, guild.id);
    return {
      warnings: userStats.reportCount,
      message: thread.lastMessage!,
      latestReport,
      thread,
      allReportedMessages: [], // Could fetch if needed
    };
  }

  log("info", "reportUser", "new message reported");

  // Get user stats for constructing the log
  const previousWarnings = await getUserReportStats(author.id, guild.id);

  // Send detailed report info to the user thread
  const logBody = await constructLog({
    extra,
    logs: [{ message, reason, staff }],
    staff,
  });

  // If it has the data for a poll, use a specialized formatting function
  const reportedMessage = message.poll
    ? quoteAndEscapePoll(message.poll)
    : quoteAndEscape(getMessageContent(message)).trim();
  // Send the detailed log message to thread
  const [logMessage] = await Promise.all([
    thread.send(logBody),
    thread.send({ content: reportedMessage, allowedMentions: {} }),
  ]);

  // Try to record the report in database with retry logic
  await retry(3, async () => {
    const result = await recordReport({
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

    // If the record was not inserted due to unique constraint (duplicate),
    // this means another process already reported the same message while we were
    // preparing the log. Retry to check if we should bail early.
    if (!result.wasInserted) {
      log(
        "warn",
        "reportUser",
        "duplicate detected at database level, retrying check",
      );
      throw new Error("Race condition detected in recordReport, retrying…");
    }

    return result;
  });

  await logMessage.forward(modLog).catch((e) => {
    log("error", "reportUser", "failed to forward to modLog", { error: e });
  });

  // Send summary to parent channel if possible
  if (thread.parent?.isSendable()) {
    // For forwarded messages, cleanContent is empty - use snapshot content instead
    const content = isForwardedMessage(message)
      ? getMessageContent(message)
      : message.cleanContent;
    const singleLine = content.slice(0, 80).replaceAll("\n", "\\n ");
    const truncatedMessage =
      singleLine.length > 80 ? `${singleLine.slice(0, 80)}…` : singleLine;

    try {
      const stats = await getMessageStats(message);
      await thread.parent.send({
        allowedMentions: {},
        content: `> ${escapeDisruptiveContent(truncatedMessage)}\n-# [${stats.char_count} chars in ${stats.word_count} words. ${stats.link_stats.length} links, ${stats.code_stats.reduce((count, { lines }) => count + lines, 0)} lines of code](${messageLink(logMessage.channelId, logMessage.id)})`,
      });
    } catch (e) {
      // If message was deleted or stats unavailable, send without stats
      log("warn", "reportUser", "failed to get message stats, skipping", {
        error: e,
      });
      await thread.parent
        .send({
          allowedMentions: {},
          content: `> ${escapeDisruptiveContent(truncatedMessage)}\n-# [Stats failed to load](${messageLink(logMessage.channelId, logMessage.id)})`,
        })
        .catch((sendError) => {
          log("error", "reportUser", "failed to send summary to parent", {
            error: sendError,
          });
        });
    }
  }

  // For new reports, the detailed log already includes the reason info,
  // so we don't need a separate short message
  const latestReport = undefined;

  return {
    warnings: previousWarnings.reportCount + 1,
    message: logMessage,
    latestReport,
    thread,
    allReportedMessages: [], // Could fetch from database if needed
  };
};

const makeReportMessage = ({ message, reason, staff }: Report) => {
  const embeds = [describeReactions(message.reactions.cache)].filter(
    (e): e is APIEmbed => Boolean(e),
  );

  return {
    content: `${staff ? ` ${staff.username} ` : ""}${ReadableReasons[reason]}`,
    embeds: embeds.length === 0 ? undefined : embeds,
  };
};

const constructLog = async ({
  logs,
  extra: origExtra = "",
}: Pick<Report, "extra" | "staff"> & {
  logs: Report[];
}): Promise<MessageCreateOptions> => {
  const lastReport = logs.at(-1);
  if (!lastReport?.message.guild) {
    throw new Error("Something went wrong when trying to retrieve last report");
  }
  const { moderator } = await fetchSettings(lastReport.message.guild.id, [
    SETTINGS.moderator,
  ]);
  const { message } = lastReport;

  // This should never be possible but we gotta satisfy types
  if (!moderator) {
    throw new Error("No role configured to be used as moderator");
  }

  const { content: report, embeds: reactions = [] } =
    makeReportMessage(lastReport);

  // Add indicator if this is forwarded content
  const forwardNote = isForwardedMessage(message) ? " (forwarded)" : "";
  const preface = `${constructDiscordLink(message)} by <@${lastReport.message.author.id}> (${
    lastReport.message.author.username
  })${forwardNote}`;
  const extra = origExtra ? `${origExtra}\n` : "";

  // For forwarded messages, get attachments from the snapshot
  const attachments = isForwardedMessage(message)
    ? (message.messageSnapshots.first()?.attachments ?? message.attachments)
    : message.attachments;

  const embeds = [describeAttachments(attachments), ...reactions].filter(
    (e): e is APIEmbed => Boolean(e),
  );
  return {
    content: truncateMessage(`${preface}
-# ${extra}${formatDistanceToNowStrict(lastReport.message.createdAt)} ago · <t:${Math.floor(lastReport.message.createdTimestamp / 1000)}:R> · ${report}`).trim(),
    embeds: embeds.length === 0 ? undefined : embeds,
    allowedMentions: { roles: [moderator] },
  };
};
