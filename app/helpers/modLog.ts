import type {
  Message,
  MessageCreateOptions,
  User,
  ClientUser,
} from "discord.js";
import { ChannelType } from "discord.js";
import TTLCache from "@isaacs/ttlcache";

import { fetchSettings, SETTINGS } from "~/models/guilds.server";
import {
  constructDiscordLink,
  describeAttachments,
  quoteAndEscape,
} from "~/helpers/discord";
import { simplifyString, truncateMessage } from "~/helpers/string";
import { format, formatDistanceToNowStrict } from "date-fns";

export const enum ReportReasons {
  anonReport = "anonReport",
  track = "track",
  mod = "mod",
  spam = "spam",
}
const ReadableReasons: Record<ReportReasons, string> = {
  [ReportReasons.anonReport]: "Reported anonymously",
  [ReportReasons.track]: "tracked",
  [ReportReasons.mod]: "convened mods",
  [ReportReasons.spam]: "detected as spam",
};
interface Report {
  reason: ReportReasons;
  message: Message;
  extra?: string;
  staff: User | ClientUser | false;
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
    cachedWarnings = new Map<
      string,
      {
        logMessage: Message;
        logs: Report[];
      }
    >();
    cache.set(cacheKey, cachedWarnings);
  }
  const cached = cachedWarnings.get(simplifiedContent);
  const newReport: Report = { message, reason, staff };

  if (cached) {
    // If we already logged for ~ this message, post to the existing thread
    const { logMessage: cachedMessage, logs } = cached;

    const newLogs = logs.concat([newReport]);
    cachedWarnings.set(simplifiedContent, {
      logMessage: cachedMessage,
      logs: newLogs,
    });

    const warnings = newLogs.length;

    let thread = cachedMessage.thread;
    if (!thread || !cachedMessage.hasThread) {
      thread = await makeLogThread(cachedMessage, message.author);
    }

    const [latestReport] = await Promise.all([
      thread.send({ content: makeReportString(newReport) }),
      cachedMessage.edit(
        cachedMessage.content
          ?.replace(/warned \d times/, `warned ${cachedWarnings.size} times`)
          .replace(/in \d channels/, `in ${warnings} channels`) || "",
      ),
    ]);
    return { warnings, message: cachedMessage, latestReport, thread };
  } else {
    // If this is new, send a new message
    const { modLog: modLogId } = await fetchSettings(guild, [SETTINGS.modLog]);
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
    const latestReport = await thread.send(makeReportString(newReport));

    cachedWarnings.set(simplifiedContent, {
      logMessage: warningMessage,
      logs: newLogs,
    });
    return { warnings: 1, message: warningMessage, latestReport, thread };
  }
};

const makeReportString = ({ message, reason, staff }: Report) =>
  `- ${constructDiscordLink(message)} ${staff ? ` ${staff.username} ` : ""}${
    ReadableReasons[reason]
  }`;

const constructLog = async ({
  logs,
  previousWarnings,
  extra: origExtra = "",
}: Pick<Report, "extra" | "staff"> & {
  logs: Report[];
  previousWarnings: Map<string, { logMessage: Message; logs: Report[] }>;
}): Promise<MessageCreateOptions> => {
  const lastReport = logs.at(-1)!;
  const { moderator } = await fetchSettings(lastReport.message.guild!, [
    SETTINGS.moderator,
  ]);

  if (!moderator) {
    throw new Error("No role configured to be used as moderator");
  }

  const preface = `<@${lastReport.message.author.id}> (${
    lastReport.message.author.username
  }) warned ${previousWarnings.size + 1} times recently, posted in ${
    logs.length
  } channels ${formatDistanceToNowStrict(lastReport.message.createdAt)} ago`;
  const extra = origExtra ? `${origExtra}\n` : "";

  const reportedMessage = quoteAndEscape(lastReport.message.content).trim();
  const attachments = describeAttachments(lastReport.message.attachments);
  let warnings = [];
  for (const { logMessage } of previousWarnings.values()) {
    warnings.push(
      `[${format(logMessage.createdAt, "PP kk:mmX")}](${constructDiscordLink(
        logMessage,
      )}) (${formatDistanceToNowStrict(logMessage.createdAt, {
        addSuffix: true,
      })})`,
    );
  }

  return {
    content: truncateMessage(`${preface}
${extra}${reportedMessage}
${warnings.join("\n")}`).trim(),
    embeds: attachments ? [{ description: `\n\n${attachments}` }] : undefined,
    allowedMentions: { roles: [moderator] },
  };
};
