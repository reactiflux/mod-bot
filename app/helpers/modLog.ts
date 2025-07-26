import type {
  Message,
  MessageCreateOptions,
  User,
  APIEmbed,
  AnyThreadChannel,
  TextChannel,
} from "discord.js";
import { MessageType, ChannelType } from "discord.js";
import { formatDistanceToNowStrict } from "date-fns";

import { ReportReasons, type Report } from "#~/commands/track/reportCache.js";
import {
  recordReport,
  getReportsForMessage,
  getUserReportStats,
} from "#~/models/reportedMessages.server";

import { fetchSettings, SETTINGS } from "#~/models/guilds.server";
import {
  constructDiscordLink,
  describeAttachments,
  describeReactions,
  quoteAndEscape,
  quoteAndEscapePoll,
} from "#~/helpers/discord";
import { truncateMessage } from "#~/helpers/string";
import { escalationControls } from "#~/helpers/escalate";
import {
  getUserThread,
  createUserThread,
  updateUserThread,
} from "#~/models/userThreads.server";

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
      console.log(
        "[getOrCreateUserThread] Existing thread not accessible, will create new one:",
        error,
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
  const { guild } = message;
  if (!guild) throw new Error("Tried to report a message without a guild");

  // Check if this exact message has already been reported
  const existingReports = await getReportsForMessage(message.id, guild.id);
  const alreadyReported = existingReports.some((r) => r.reason === reason);

  console.log(
    "[reportUser]",
    `${message.author.username}, ${reason}. ${alreadyReported ? "already reported" : "new report"}.`,
  );

  // Get or create persistent user thread first
  const thread = await getOrCreateUserThread(message, message.author);

  if (alreadyReported && reason !== ReportReasons.modResolution) {
    // Message already reported with this reason, just add to thread
    const latestReport = await thread.send(
      makeReportMessage({ message, reason, staff }),
    );
    console.log("[reportUser]", "exact message already logged");

    const userStats = await getUserReportStats(message.author.id, guild.id);
    return {
      warnings: userStats.reportCount,
      message: thread.lastMessage!,
      latestReport,
      thread,
      allReportedMessages: [], // Could fetch if needed
    };
  }

  console.log("[reportUser]", "new message reported");

  // Get user stats for constructing the log
  const previousWarnings = await getUserReportStats(
    message.author.id,
    guild.id,
  );

  // Send detailed report info to the user thread
  const logBody = await constructLog({
    extra,
    logs: [{ message, reason, staff }],
    previousWarnings,
    staff,
  });

  // Send the detailed log message to thread
  const logMessage = await thread.send(logBody);

  // Record the report in database
  await recordReport({
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
  });

  // Add the specific report message to thread
  const latestReport =
    reason === ReportReasons.modResolution
      ? undefined
      : await thread.send(makeReportMessage({ message, reason, staff }));

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
  previousWarnings,
  extra: origExtra = "",
}: Pick<Report, "extra" | "staff"> & {
  logs: Report[];
  previousWarnings: Awaited<ReturnType<typeof getUserReportStats>>;
}): Promise<MessageCreateOptions> => {
  const lastReport = logs.at(-1);
  if (!lastReport || !lastReport.message.guild) {
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

  const preface = `<@${lastReport.message.author.id}> (${
    lastReport.message.author.username
  }) warned ${previousWarnings.reportCount + 1} times recently for ${previousWarnings.uniqueMessages + 1} different messages, posted in ${
    previousWarnings.uniqueChannels + 1
  } channels ${formatDistanceToNowStrict(lastReport.message.createdAt)} before this log (<t:${Math.floor(lastReport.message.createdTimestamp / 1000)}:R>)`;
  const extra = origExtra ? `${origExtra}\n` : "";

  // If it has the data for a poll, use a specialized formatting function
  const reportedMessage = message.poll
    ? quoteAndEscapePoll(message.poll)
    : quoteAndEscape(message.content).trim();

  const { content: report, embeds: reactions = [] } =
    makeReportMessage(lastReport);

  const embeds = [
    describeAttachments(message.attachments),
    ...reactions,
  ].filter((e): e is APIEmbed => Boolean(e));
  return {
    content: truncateMessage(`${preface}
${extra}${reportedMessage}
${report}
- ${constructDiscordLink(message)}`).trim(),
    embeds: embeds.length === 0 ? undefined : embeds,
    allowedMentions: { roles: [moderator] },
  };
};
