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

const makeLogThread = (message: Message, user: User) => {
  return message.startThread({
    name: `${user.username} – ${format(message.createdAt, "P")}`,
  });
};

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
  const newReport = { message, reason, staff, date: new Date() };

  if (cached) {
    // If we already logged for ~ this message, post to the existing thread
    const { logMessage: cachedMessage, logs } = cached;

    const newLogs = logs.concat([newReport]);
    const warnings = newLogs.length;

    let thread = cachedMessage.thread;
    if (!thread || !cachedMessage.hasThread) {
      thread = await makeLogThread(cachedMessage, message.author);
    }

    const [latestReport] = await Promise.all([
      thread.send({ content: await makeReportString(newReport) }),
      cachedMessage.edit(
        cachedMessage.content?.replace(
          /warned \d times/,
          `warned ${warnings} times`,
        ) || "",
      ),
    ]);

    warningMessages.set(simplifiedContent, {
      logMessage: cachedMessage,
      logs: newLogs,
    });
    return { warnings, message: cachedMessage, latestReport, thread };
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

    const [warningMessage, reportString] = await Promise.all([
      modLog.send(logBody),
      makeReportString(newReport),
    ]);
    const thread = await makeLogThread(warningMessage, message.author);
    const latestReport = await thread.send(reportString);

    warningMessages.set(simplifiedContent, {
      logMessage: warningMessage,
      logs: newLogs,
    });
    return { warnings: 1, message: warningMessage, latestReport, thread };
  }
};

const makeReportString = ({ message, reason, staff, date }: Report) =>
  `- ${constructDiscordLink(message)} ${staff ? ` ${staff.username} ` : ""}${
    ReadableReasons[reason]
  } on ${format(date, "Pp")}`;

const constructLog = async ({
  logs,
  extra: origExtra = "",
}: Pick<Report, "extra" | "staff"> & {
  logs: Report[];
}): Promise<MessageCreateOptions> => {
  const lastReport = logs.at(-1)!;

  const preface = `<@${lastReport.message.author.id}> (${
    lastReport.message.author.username
  }) warned ${logs.length} times, posted ${formatDistanceToNowStrict(
    lastReport.message.createdAt,
  )} ago`;
  const extra = origExtra ? `\n${origExtra}\n` : "";

  const reportedMessage = quoteAndEscape(lastReport.message.content).trim();
  const attachments = describeAttachments(lastReport.message.attachments);

  return {
    content: truncateMessage(`${preface}
${extra}
${reportedMessage}`).trim(),
    embeds: attachments ? [{ description: `\n\n${attachments}` }] : undefined,
  };
};
