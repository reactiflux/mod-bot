import type {
  Message,
  MessageCreateOptions,
  User,
  APIEmbed,
  AnyThreadChannel,
  TextChannel,
} from "discord.js";
import { MessageType, ChannelType } from "discord.js";
import { format, formatDistanceToNowStrict, differenceInHours } from "date-fns";

import {
  queryReportCache,
  queryCacheMetadata,
  trackReport,
  ReportReasons,
  type Report,
} from "#~/commands/track/reportCache.js";

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
    name: `${user.username} Moderation History`,
    type: ChannelType.PrivateThread,
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
  const { modLog: modLogId } = await fetchSettings(guild.id, [SETTINGS.modLog]);
  const modLog = await guild.channels.fetch(modLogId);
  if (!modLog || modLog.type !== ChannelType.GuildText) {
    throw new Error("Invalid mod log channel");
  }

  // Create freestanding private thread
  const thread = await makeUserThread(modLog, user);

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
  const cached = queryReportCache(message);
  const newReport: Report = { message, reason, staff };

  console.log(
    "[reportUser]",
    `${message.author.username}, ${reason}. ${cached ? "cached" : "not cached"}.`,
  );

  const { modLog: modLogId, moderator: modRoleId } = await fetchSettings(
    guild.id,
    [SETTINGS.modLog, SETTINGS.moderator],
  );

  if (cached) {
    // If we already logged for ~ this message, post to the existing thread
    const { logMessage: cachedMessage, logs } = cached;

    // Get or create persistent user thread
    const thread = await getOrCreateUserThread(message, message.author);

    if (cached.logs.some((l) => l.message.id === message.id)) {
      // If we've already logged exactly this message, don't log it again as a
      // separate report.
      const latestReport = // Don't reply in thread if this is a resolved vote
        reason === ReportReasons.modResolution
          ? undefined
          : await thread.send(makeReportMessage(newReport));
      console.log("[reportUser]", "exact message already logged");
      return {
        warnings: logs.length,
        message: cachedMessage,
        latestReport,
        thread,
        allReportedMessages: logs,
      };
    }

    console.log("[reportUser]", "new message reported");
    trackReport(cachedMessage, newReport);
    const { uniqueChannels, uniqueMessages, reportCount } =
      queryCacheMetadata(message);

    const [latestReport] = await Promise.all([
      // Don't reply in thread if this is a resolved vote
      reason === ReportReasons.modResolution
        ? Promise.resolve(undefined)
        : thread.send(makeReportMessage(newReport)),
      cachedMessage.edit(
        cachedMessage.content
          .replace(
            /for \d different messages/,
            `for ${uniqueMessages} different messages`,
          )
          .replace(/in \d channels/, `in ${uniqueChannels} channels`)
          .replace(/warned \d times/, `warned ${reportCount} times`) || "",
      ),
    ]);
    return {
      warnings: reportCount,
      message: cachedMessage,
      latestReport,
      thread,
      allReportedMessages: cached.logs,
    };
  }

  // If this is new, send a new message
  const modLog = await guild.channels.fetch(modLogId);
  if (!modLog) {
    throw new Error("Channel configured for use as mod log not found");
  }
  if (modLog.type !== ChannelType.GuildText) {
    throw new Error(
      "Invalid channel configured for use as mod log, must be guild text",
    );
  }
  const newLogs: Report[] = [{ message, reason, staff }];

  console.log("[reportUser]", "new message reported");

  // Get or create persistent user thread first
  const thread = await getOrCreateUserThread(message, message.author);

  // Post notification in main channel linking to user thread
  const notificationMessage = await modLog.send({
    content: `New report for <@${message.author.id}> - see discussion in <#${thread.id}>`,
  });
  trackReport(notificationMessage, newReport);

  // Send detailed report info to the user thread
  const logBody = await constructLog({
    extra,
    logs: newLogs,
    previousWarnings: queryCacheMetadata(message),
    staff,
  });

  // Send combined detailed report with moderator controls
  await thread.send(logBody);
  await escalationControls(message, thread, modRoleId);

  const latestReport = await thread.send(makeReportMessage(newReport));

  return {
    warnings: 1,
    message: notificationMessage,
    latestReport,
    thread,
    allReportedMessages: newLogs,
  };
};

const makeReportMessage = ({ message, reason, staff }: Report) => {
  const embeds = [describeReactions(message.reactions.cache)].filter(
    (e): e is APIEmbed => Boolean(e),
  );

  return {
    content: `- ${constructDiscordLink(message)} ${
      staff ? ` ${staff.username} ` : ""
    }${ReadableReasons[reason]}`,
    embeds: embeds.length === 0 ? undefined : embeds,
  };
};

const constructLog = async ({
  logs,
  previousWarnings,
  extra: origExtra = "",
}: Pick<Report, "extra" | "staff"> & {
  logs: Report[];
  previousWarnings: NonNullable<ReturnType<typeof queryCacheMetadata>>;
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
  const warnings = previousWarnings.allReports.map(
    ({ message: logMessage }) => {
      return `[${format(logMessage.createdAt, differenceInHours(logMessage.createdAt, new Date()) > 24 ? "PP kk:mmX" : "kk:mmX")}](${constructDiscordLink(
        logMessage,
      )}) (<t:${Math.floor(logMessage.createdAt.getTime() / 1000)}:R>)`;
    },
  );

  const embeds = [describeAttachments(message.attachments)].filter(
    (e): e is APIEmbed => Boolean(e),
  );

  return {
    content: truncateMessage(`${preface}
${extra}${reportedMessage}
${warnings.join("\n")}

---
**Moderator controls follow below** ⬇️`).trim(),
    embeds: embeds.length === 0 ? undefined : embeds,
    allowedMentions: { roles: [moderator] },
  };
};
