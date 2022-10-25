import type {
  Message,
  Role,
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
  userWarn = "userWarn",
  userDelete = "userDelete",
  mod = "mod",
  spam = "spam",
  ping = "ping",
}
const ReadableReasons: Record<ReportReasons, string> = {
  [ReportReasons.anonReport]: "Reported anonymously",
  [ReportReasons.track]: "Tracked",
  [ReportReasons.userWarn]: "Met 👎 threshold",
  [ReportReasons.userDelete]: "Met 👎 deletion threshold",
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
  const simplifiedContent = `${message.author.id}${simplifyString(
    message.content,
  )}`;
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
  const { guild } = logs[0].message;
  const lastReport = logs.at(-1)!;
  const { moderator: moderatorId } = await fetchSettings(guild!, [
    SETTINGS.moderator,
  ]);

  const staffRole = (await guild!.roles.fetch(moderatorId)) as Role;

  const modAlert = `<@${staffRole.id}>`;
  const preface = `<@${lastReport.message.author.id}> (${
    lastReport.message.author.username
  }) warned ${logs.length} times:
${logs
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
  .join("\n")}`.trim();
  const extra = origExtra ? `\n${origExtra}\n` : "";

  const reportedMessage = quoteAndEscape(lastReport.message.content).trim();
  const attachments = describeAttachments(lastReport.message.attachments);

  const reasons = logs.map(({ reason }) => reason);
  const outputFormat = getLogFormat(reasons);
  switch (outputFormat) {
    case ReportReasons.mod:
      return {
        content: `${preface}:${extra}
${reportedMessage}`,
        embeds: [{ description: `${attachments ? `\n\n${attachments}` : ""}` }],
      };

    case ReportReasons.track:
      return {
        content: `${preface}
${extra}
${reportedMessage}`,
        embeds: [{ description: `${attachments ? `\n\n${attachments}` : ""}` }],
      };

    case ReportReasons.userWarn:
    case ReportReasons.userDelete:
      return {
        content: `${modAlert} – ${preface}
${extra}
${reportedMessage}`,
        embeds: [{ description: `${attachments ? `\n\n${attachments}` : ""}` }],
      };

    case ReportReasons.spam:
    case ReportReasons.ping:
    case ReportReasons.anonReport:
      return {
        content: `${preface}
${extra}
${reportedMessage}`,
        embeds: [{ description: `${attachments ? `\n\n${attachments}` : ""}` }],
      };
  }
};

const reportScores = {
  [ReportReasons.anonReport]: 1,
  [ReportReasons.track]: 3,
  [ReportReasons.userWarn]: 1,
  [ReportReasons.userDelete]: 1,
  [ReportReasons.mod]: 5,
  [ReportReasons.spam]: 1,
  [ReportReasons.ping]: 1,
};
// Determine what format to use when sending a message. When a single message can
// be reported multiple times, we'd prefer that some types of reports have more
// weight over what format is used. For instance, if a message is tracked by
// moderators, then reported anonymously, we'd prefer to render it as a "tracked
// by moderators" message because it has more information.
const getLogFormat = (reports: ReportReasons[]): ReportReasons =>
  reports.reduce((mainType, report) => {
    if (reportScores[report] >= reportScores[mainType]) {
      return report;
    }
    return mainType;
  }, reports[0]);
