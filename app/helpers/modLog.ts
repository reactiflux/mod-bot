import type {
  GuildMember,
  Message,
  MessageOptions,
  Role,
  TextChannel,
  APIInteractionGuildMember,
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
type Member = GuildMember | APIInteractionGuildMember;
interface Report {
  reason: ReportReasons;
  message: Message;
  extra?: string;
  staff?: Member[];
  members?: Member[];
}

const warningMessages = new Map<
  string,
  { warnings: number; message: Message }
>();
export const reportUser = async ({
  reason,
  message,
  extra,
  staff = [],
  members = [],
}: Report) => {
  const { guild } = message;
  if (!guild) throw new Error("Tried to report a message without a guild");
  const simplifiedContent = `${message.author.id}${simplifyString(
    message.content,
  )}`;
  const cached = warningMessages.get(simplifiedContent);

  const logBody = await constructLog({
    reason,
    message,
    extra,
    staff,
    members,
  });

  if (cached) {
    // If we already logged for ~ this message, edit the log
    const { message: cachedMessage, warnings: oldWarnings } = cached;
    const warnings = oldWarnings + 1;

    const finalLog =
      logBody.content?.replace(/warned \d times/, `warned ${warnings} times`) ||
      "";

    cachedMessage.edit(finalLog);
    warningMessages.set(simplifiedContent, {
      warnings,
      message: cachedMessage,
    });
    return { warnings, message: cachedMessage };
  } else {
    // If this is new, send a new message
    const { modLog: modLogId } = await fetchSettings(guild, [SETTINGS.modLog]);
    const modLog = (await guild.channels.fetch(modLogId)) as TextChannel;

    const warningMessage = await modLog.send(logBody);

    warningMessages.set(simplifiedContent, {
      warnings: 1,
      message: warningMessage,
    });
    return { warnings: 1, message: warningMessage };
  }
};

export const constructLog = async ({
  reason,
  message,
  extra: origExtra = "",
  staff = [],
  members = [],
}: Report): Promise<MessageOptions> => {
  const { moderator: moderatorId } = await fetchSettings(message.guild!, [
    SETTINGS.moderator,
  ]);

  const staffRole = (await message.guild!.roles.fetch(moderatorId)) as Role;

  const modAlert = `<@${staffRole.id}>`;
  const preface = `<@${message.author.id}> in <#${message.channel.id}> warned 1 times`;
  const extra = origExtra ? `\n${origExtra}\n` : "";
  const postfix = `${
    members.length
      ? `Reactors: ${members.map(({ user }) => user.username).join(", ")}\n`
      : ""
  }${
    staff.length
      ? `Staff: ${staff.map(({ user }) => user.username).join(", ")}`
      : ""
  }
`;
  const reportedMessage = quoteAndEscape(message.content);
  const link = `[Original message](${constructDiscordLink(message)})`;
  const attachments = describeAttachments(message.attachments);

  switch (reason) {
    case ReportReasons.mod:
      return {
        content: `${preface}:${extra}
${reportedMessage}

${postfix}`,
        embeds: [
          { description: `${link}${attachments ? `\n\n${attachments}` : ""}` },
        ],
      };

    case ReportReasons.track:
      return {
        content: `<@${message.author.id}> (${message.author.username}) in <#${
          message.channel.id
        }>
sent ${formatDistanceToNowStrict(message.createdAt)} ago on ${format(
          message.createdAt,
          "Pp 'GMT'x",
        )}
tracked by ${staff.map(({ user }) => user.username).join(", ")}:
${extra}
${reportedMessage}`,
        embeds: [
          { description: `${link}${attachments ? `\n\n${attachments}` : ""}` },
        ],
      };

    case ReportReasons.userWarn:
      return {
        content: `${modAlert} – ${preface}, met the warning threshold for the message:
${extra}
${reportedMessage}

${postfix}`,
        embeds: [
          { description: `${link}${attachments ? `\n\n${attachments}` : ""}` },
        ],
      };

    case ReportReasons.userDelete:
      return {
        content: `${modAlert} – ${preface}, met the deletion threshold for the message:
${extra}
${reportedMessage}

${postfix}`,
        embeds: attachments ? [{ description: `${attachments}` }] : [],
      };

    case ReportReasons.spam:
      return {
        content: `${preface}, reported for spam:
${extra}
${reportedMessage}

${postfix}`,
        embeds: attachments ? [{ description: `${attachments}` }] : [],
      };

    case ReportReasons.ping:
      return {
        content: `${preface}, pinged everyone:
${extra}
${reportedMessage}

${postfix}`,
        embeds: attachments ? [{ description: `${attachments}` }] : [],
      };

    case ReportReasons.anonReport:
      return {
        content: `${preface}, reported anonymously:
${extra}
${reportedMessage}

${postfix}`,
        embeds: [{ description: `${link}${attachments}` }],
      };
  }
};
