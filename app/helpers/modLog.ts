import type { Message, MessageCreateOptions, User, APIEmbed } from "discord.js";
import { MessageType, ChannelType } from "discord.js";
import { format, formatDistanceToNowStrict, differenceInHours } from "date-fns";
import TTLCache from "@isaacs/ttlcache";

import { fetchSettings, SETTINGS } from "#~/models/guilds.server";
import {
  constructDiscordLink,
  describeAttachments,
  describeReactions,
  quoteAndEscape,
  quoteAndEscapePoll,
} from "#~/helpers/discord";
import { simplifyString, truncateMessage } from "#~/helpers/string";
import { escalationControls } from "./escalate";

export const enum ReportReasons {
  anonReport = "anonReport",
  track = "track",
  modResolution = "modResolution",
  spam = "spam",
}
const ReadableReasons: Record<ReportReasons, string> = {
  [ReportReasons.anonReport]: "Reported anonymously",
  [ReportReasons.track]: "tracked",
  [ReportReasons.modResolution]: "Mod vote resolved",
  [ReportReasons.spam]: "detected as spam",
};
interface Report {
  reason: ReportReasons;
  message: Message;
  extra?: string;
  staff: User | false;
}

const HOUR = 60 * 60 * 1000;
type UserID = string;
type GuildID = string;
const cache = new TTLCache<
  `${UserID}${GuildID}`,
  Map<
    string,
    {
      logMessage: Message;
      logs: Report[];
    }
  >
>({
  ttl: 20 * HOUR,
  max: 1000,
});

const makeLogThread = (message: Message, user: User) => {
  return message.startThread({
    name: `${user.username} – ${format(message.createdAt, "P")}`,
  });
};

// const warningMessages = new ();
export const reportUser = async ({
  reason,
  message,
  extra,
  staff,
}: Omit<Report, "date">) => {
  const { guild } = message;
  if (!guild) throw new Error("Tried to report a message without a guild");
  const cacheKey = `${message.guildId}${message.author.id}`;
  const simplifiedContent = simplifyString(message.content);

  let cachedWarnings = cache.get(cacheKey);
  if (!cachedWarnings) {
    cachedWarnings = new Map<string, { logMessage: Message; logs: Report[] }>();
    cache.set(cacheKey, cachedWarnings);
  }
  const cached = cachedWarnings.get(simplifiedContent);
  const newReport: Report = { message, reason, staff };

  console.log(
    "reportUser",
    `${message.author.username}, ${reason}. ${cached ? "cached" : "not cached"}.`,
  );

  const { modLog: modLogId, moderator: modRoleId } = await fetchSettings(
    guild,
    [SETTINGS.modLog, SETTINGS.moderator],
  );

  if (cached) {
    // If we already logged for ~ this message, post to the existing thread
    const { logMessage: cachedMessage, logs } = cached;

    let thread = cachedMessage.thread;
    if (!thread || !cachedMessage.hasThread) {
      thread = await makeLogThread(cachedMessage, message.author);
      await escalationControls(message, thread, modRoleId);
    }

    if (cached.logs.some((l) => l.message.id === message.id)) {
      // If we've already logged exactly this message, don't log it again as a
      // separate report.
      const latestReport = await thread.send(makeReportMessage(newReport));
      return {
        warnings: logs.length,
        message: cachedMessage,
        latestReport,
        thread,
      };
    }

    const newLogs = logs.concat([newReport]);
    cachedWarnings.set(simplifiedContent, {
      logMessage: cachedMessage,
      logs: newLogs,
    });

    const warnings = newLogs.length;

    const [latestReport] = await Promise.all([
      // Don't reply in thread if this is a resolved vote
      reason === ReportReasons.modResolution
        ? Promise.resolve()
        : thread.send(makeReportMessage(newReport)),
      cachedMessage.edit(
        cachedMessage.content
          ?.replace(/warned \d times/, `warned ${cachedWarnings.size} times`)
          .replace(/in \d channels/, `in ${warnings} channels`) || "",
      ),
    ]);
    return { warnings, message: cachedMessage, latestReport, thread };
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

  const logBody = await constructLog({
    extra,
    logs: newLogs,
    previousWarnings: cachedWarnings,
    staff,
  });

  const warningMessage = await modLog.send(logBody);
  const thread = await makeLogThread(warningMessage, message.author);
  await escalationControls(message, thread, modRoleId);

  const firstReportMessage = makeReportMessage(newReport);

  const latestReport = await thread.send(firstReportMessage);

  cachedWarnings.set(simplifiedContent, {
    logMessage: warningMessage,
    logs: newLogs,
  });
  return { warnings: 1, message: warningMessage, latestReport, thread };
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
  previousWarnings: Map<string, { logMessage: Message; logs: Report[] }>;
}): Promise<MessageCreateOptions> => {
  const lastReport = logs.at(-1);
  if (!lastReport || !lastReport.message.guild) {
    throw new Error("Something went wrong when trying to retrieve last report");
  }
  const { moderator } = await fetchSettings(lastReport.message.guild, [
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
  }) warned ${previousWarnings.size + 1} times recently, posted in ${
    logs.length
  } channels ${formatDistanceToNowStrict(lastReport.message.createdAt)} before this log (<t:${Math.floor(lastReport.message.createdTimestamp / 1000)}:R>)`;
  const extra = origExtra ? `${origExtra}\n` : "";

  // If it has the data for a poll, use a specialized formatting function
  const reportedMessage = message.poll
    ? quoteAndEscapePoll(message.poll)
    : quoteAndEscape(message.content).trim();
  const warnings = [];
  for (const { logMessage } of previousWarnings.values()) {
    warnings.push(
      `[${format(logMessage.createdAt, differenceInHours(logMessage.createdAt, new Date()) > 24 ? "PP kk:mmX" : "kk:mmX")}](${constructDiscordLink(
        logMessage,
      )}) (<t:${Math.floor(logMessage.createdAt.getTime() / 1000)}:R>)`,
    );
  }

  const embeds = [describeAttachments(message.attachments)].filter(
    (e): e is APIEmbed => Boolean(e),
  );

  return {
    content: truncateMessage(`${preface}
${extra}${reportedMessage}
${warnings.join("\n")}`).trim(),
    embeds: embeds.length === 0 ? undefined : embeds,
    allowedMentions: { roles: [moderator] },
  };
};
