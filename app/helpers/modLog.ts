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
import { simplifyString } from "~/helpers/string";
import { format, formatDistanceToNowStrict } from "date-fns";

export const enum ReportReasons {
  anonReport = "anonReport",
  track = "track",
  mod = "mod",
  spam = "spam",
  ping = "ping",
}
const ReadableReasons: Record<ReportReasons, string> = {
  [ReportReasons.anonReport]: "Reported anonymously",
  [ReportReasons.track]: "Tracked",
  [ReportReasons.mod]: "Moderators convened",
  [ReportReasons.spam]: "Detected as spam",
  [ReportReasons.ping]: "Pinged everyone",
};
interface Report {
  reason: ReportReasons;
  message: Message;
  extra?: string;
  staff: User | ClientUser | false;
}

const warningMessages = new Map<
  string,
  {
    logMessage: Message;
    logs: Report[];
  }
>();
export const reportUser = async ({ reason, message, extra, staff }: Report) => {
  const { guild } = message;
  if (!guild) throw new Error("Tried to report a message without a guild");
  const simplifiedContent = `${message.guildId}${
    message.author.id
  }${simplifyString(message.content)}`;
  const cached = warningMessages.get(simplifiedContent);

  if (cached) {
    // If we already logged for ~ this message, edit the log
    const { logMessage: cachedMessage, logs } = cached;

    const newLogs = logs.concat([{ message, reason, staff }]);
    const warnings = newLogs.length;

    const logBody = await constructLog({
      logs: newLogs,
      extra,
      staff,
    });

    const finalLog =
      logBody.content?.replace(/warned \d times/, `warned ${warnings} times`) ||
      "";

    await cachedMessage.edit(finalLog);
    warningMessages.set(simplifiedContent, {
      logMessage: cachedMessage,
      logs: newLogs,
    });
    return { warnings, message: cachedMessage };
  } else {
    // If this is new, send a new message
    const { modLog: modLogId } = await fetchSettings(guild, [SETTINGS.modLog]);
    const modLog = (await guild.channels.fetch(modLogId)) as TextChannel;
    const newLogs = [{ message, reason, staff }];

    const logBody = await constructLog({
      extra,
      logs: newLogs,
      staff,
    });

    const warningMessage = await modLog.send(logBody);

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
      ({ message, reason, staff }) =>
        `${formatDistanceToNowStrict(lastReport.message.createdAt)} ago in <#${
          message.channel.id
        }> ${ReadableReasons[reason]}${
          staff ? `, by ${staff.username}` : ""
        }: ${constructDiscordLink(message)} on ${format(
          lastReport.message.createdAt,
          "Pp 'GMT'x",
        )}`,
    )
    .join("\n")
    .trim();
  const preface = `<@${lastReport.message.author.id}> (${lastReport.message.author.username}) warned ${logs.length} times:`;
  const extra = origExtra ? `\n${origExtra}\n` : "";

  const reportedMessage = quoteAndEscape(lastReport.message.content).trim();
  const attachments = describeAttachments(lastReport.message.attachments);

  return {
    content: `${preface}
${reports}
${extra}
${reportedMessage}`,
    embeds: attachments ? [{ description: `\n\n${attachments}` }] : undefined,
  };
};
