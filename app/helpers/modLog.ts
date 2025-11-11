import { formatDistanceToNowStrict } from "date-fns";
import {
  ChannelType,
  messageLink,
  MessageType,
  type AnyThreadChannel,
  type APIEmbed,
  type Message,
  type MessageCreateOptions,
  type TextChannel,
  type User,
} from "discord.js";

import {
  constructDiscordLink,
  describeAttachments,
  describeReactions,
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

const getOrCreateUserThread = async (message: Message, user: User) => {
  const { guild } = message;
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
  const { modLog: modLogId, moderator } = await fetchSettings(guild.id, [
    SETTINGS.modLog,
    SETTINGS.moderator,
  ]);
  const modLog = await guild.channels.fetch(modLogId);
  if (!modLog || modLog.type !== ChannelType.GuildText) {
    throw new Error("Invalid mod log channel");
  }

  // Create freestanding private thread
  const thread = await makeUserThread(modLog, user);
  await escalationControls(message, thread, moderator);

  // Store or update the thread reference
  if (existingThread) {
    await updateUserThread(user.id, guild.id, thread.id);
  } else {
    await createUserThread(user.id, guild.id, thread.id);
  }

  return thread;
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
  return await retry(3, async () => {
    const { guild } = message;
    if (!guild) throw new Error("Tried to report a message without a guild");

    // Check if this exact message has already been reported
    const existingReports = await getReportsForMessage(message.id, guild.id);

    const { modLog } = await fetchSettings(guild.id, [SETTINGS.modLog]);
    const alreadyReported = existingReports.find(
      (r) => r.reported_message_id === message.id,
    );

    log(
      "info",
      "reportUser",
      `${message.author.username}, ${reason}. ${alreadyReported ? "already reported" : "new report"}.`,
    );

    // Get or create persistent user thread first
    const thread = await getOrCreateUserThread(message, message.author);

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
            reportedUserId: message.author.id,
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
    const previousWarnings = await getUserReportStats(
      message.author.id,
      guild.id,
    );

    // Send detailed report info to the user thread
    const logBody = await constructLog({
      extra,
      logs: [{ message, reason, staff }],
      staff,
    });

    // If it has the data for a poll, use a specialized formatting function
    const reportedMessage = message.poll
      ? quoteAndEscapePoll(message.poll)
      : quoteAndEscape(message.content).trim();
    // Send the detailed log message to thread
    const [logMessage] = await Promise.all([
      thread.send(logBody),
      thread.send(reportedMessage),
    ]);

    // Try to record the report in database
    const [recordResult] = await Promise.all([
      recordReport({
        reportedMessageId: message.id,
        reportedChannelId: message.channel.id,
        reportedUserId: message.author.id,
        guildId: guild.id,
        logMessageId: logMessage.id,
        logChannelId: thread.id,
        reason,
        staffId: staff ? staff.id : undefined,
        staffUsername: staff ? staff.username : undefined,
        extra,
      }),
      logMessage.forward(modLog),
    ]);
    if (thread.parent?.isSendable()) {
      const singleLine = message.cleanContent
        .slice(0, 50)
        .replaceAll("\n", "\\n");
      const truncatedMessage =
        message.cleanContent.length > 50
          ? `${singleLine.slice(0, 50)}…`
          : singleLine;
      const stats = await getMessageStats(message);
      await thread.parent.send({
        allowedMentions: { roles: [], users: [] },
        content: `> ${truncatedMessage}\n-# [${stats.char_count} chars in ${stats.word_count} words. ${stats.link_stats.length} links, ${stats.code_stats.reduce((count, { lines }) => count + lines, 0)} lines of code](${messageLink(logMessage.channelId, logMessage.id)})`,
      });
    }

    // If the record was not inserted due to unique constraint (duplicate),
    // this means another process already reported the same message while we were preparing the log.
    // In this case, we'll keep the detailed log we already sent (since it's already there)
    // but add a short duplicate message and return updated stats
    if (!recordResult.wasInserted) {
      log(
        "warn",
        "reportUser",
        "duplicate detected at database level after sending detailed log",
      );
      throw new Error("Race condition detected in reportUser, retrying…");
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
  });
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
  let { message } = lastReport;
  if (
    // If there's a reference and it's not a reply, it's a forwarded message.
    // Fetch the reference and track that message.
    lastReport.message.type !== MessageType.Reply &&
    lastReport.message.reference
  ) {
    message = await message.fetchReference();
  }

  // This should never be possible but we gotta satisfy types
  if (!moderator) {
    throw new Error("No role configured to be used as moderator");
  }

  const { content: report, embeds: reactions = [] } =
    makeReportMessage(lastReport);

  const preface = `${report} ${constructDiscordLink(message)} by <@${lastReport.message.author.id}> (${
    lastReport.message.author.username
  })`;
  const extra = origExtra ? `${origExtra}\n` : "";

  const embeds = [
    describeAttachments(message.attachments),
    ...reactions,
  ].filter((e): e is APIEmbed => Boolean(e));
  return {
    content: truncateMessage(`${preface}
-# ${extra}${formatDistanceToNowStrict(lastReport.message.createdAt)} ago · <t:${Math.floor(lastReport.message.createdTimestamp / 1000)}:R>`).trim(),
    embeds: embeds.length === 0 ? undefined : embeds,
    allowedMentions: { roles: [moderator] },
  };
};
