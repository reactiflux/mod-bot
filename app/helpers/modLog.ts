import type {
  Message,
  TextChannel,
  MessageCreateOptions,
  User,
  ClientUser,
} from "discord.js";

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
  date: Date;
}

const warningMessages = new Map<
  string,
  {
    logMessage: Message;
    logs: Report[];
  }
>();
export const reportUser = async ({
  reason,
  message,
  extra,
  staff,
}: Omit<Report, "date">) => {
  const { guild } = message;
  if (!guild) throw new Error("Tried to report a message without a guild");
  const simplifiedContent = `${message.guildId}${
    message.author.id
  }${simplifyString(message.content)}`;
  const cached = warningMessages.get(simplifiedContent);

  if (cached) {
    // If we already logged for ~ this message, edit the log
    const { logMessage: cachedMessage, logs } = cached;

    const newLogs = logs.concat([{ message, reason, staff, date: new Date() }]);
    const warnings = newLogs.length;

    const logBody = await constructLog({
      logs: newLogs,
      extra,
      staff,
    });

    const finalLog =
      logBody.content?.replace(/warned \d times/, `warned ${warnings} times`) ||
      "";

    await cachedMessage.edit(truncateMessage(finalLog.slice(0, 1999)));
    warningMessages.set(simplifiedContent, {
      logMessage: cachedMessage,
      logs: newLogs,
    });
    return { warnings, message: cachedMessage };
  } else {
    // If this is new, send a new message
    const { modLog: modLogId } = await fetchSettings(guild, [SETTINGS.modLog]);
    const modLog = (await guild.channels.fetch(modLogId)) as TextChannel;
    const newLogs = [{ message, reason, staff, date: new Date() }];

    const logBody = await constructLog({
      extra,
      logs: newLogs,
      staff,
    });

    const warningMessage = await modLog.send(logBody);
    const thread = await warningMessage.startThread({
      name: message.content.slice(0, 50).toLocaleLowerCase().trim(),
    });
    await thread.send(quoteAndEscape(message.content).trim().slice(0, 2000));

    warningMessages.set(simplifiedContent, {
      logMessage: warningMessage,
      logs: newLogs,
    });
    return { warnings: 1, message: warningMessage };
  }
};

const constructLog = async ({
  logs,
  extra: origExtra = "",
}: Pick<Report, "extra" | "staff"> & {
  logs: Report[];
}): Promise<MessageCreateOptions> => {
  const lastReport = logs.at(-1)!;

  const reports = logs
    .map(
      ({ message, reason, staff, date }) =>
        `- ${constructDiscordLink(message)} ${
          staff ? ` ${staff.username} ` : ""
        }${ReadableReasons[reason]} on ${format(date, "Pp")}`,
    )
    .join("\n")
    .trim();
  const preface = `<@${lastReport.message.author.id}> (${
    lastReport.message.author.username
  }) warned ${logs.length} times, posted ${formatDistanceToNowStrict(
    lastReport.message.createdAt,
  )} ago`;
  const extra = origExtra ? `\n${origExtra}\n` : "";

  const attachments = describeAttachments(lastReport.message.attachments);

  return {
    content: truncateMessage(`${preface}

${reports}
${extra}`),
    embeds: attachments ? [{ description: `\n\n${attachments}` }] : undefined,
  };
};
