import type {
  GuildMember,
  Message,
  MessageOptions,
  Role,
  TextChannel,
} from "discord.js";
import type { APIInteractionGuildMember } from "discord-api-types/v10";
import prettyBytes from "pretty-bytes";

import { fetchSettings, SETTINGS } from "~/models/guilds.server";
import { constructDiscordLink, quoteAndEscape } from "~/helpers/discord";
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

  const { moderator: moderatorId } = await fetchSettings(guild, [
    SETTINGS.moderator,
  ]);

  const staffRole = (await guild.roles.fetch(moderatorId)) as Role;

  const logBody = constructLog({
    reason,
    message,
    staffRole,
    extra,
    staff,
    members,
  });

  if (cached) {
    // If we already logged for ~ this message, edit the log
    const { message, warnings: oldWarnings } = cached;
    const warnings = oldWarnings + 1;

    const finalLog =
      logBody.content?.replace(/warned \d times/, `warned ${warnings} times`) ||
      "";

    message.edit(finalLog);
    warningMessages.set(simplifiedContent, { warnings, message });
    return warnings;
  } else {
    // If this is new, send a new message
    const { modLog: modLogId } = await fetchSettings(guild, [SETTINGS.modLog]);

    const modLog = (await guild.channels.fetch(modLogId)) as TextChannel;
    modLog.send(logBody).then((warningMessage) => {
      warningMessages.set(simplifiedContent, {
        warnings: 1,
        message: warningMessage,
      });
    });
    return 1;
  }
};

const constructLog = ({
  reason,
  message,
  staffRole,
  extra: origExtra = "",
  staff = [],
  members = [],
}: Report & { staffRole: Role }): MessageOptions => {
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
  const attachments =
    message.attachments.size === 0
      ? ""
      : "\n\nAttachments:\n" +
        message.attachments
          .map(
            (a) =>
              // Include size of the file and the filename
              // If it's a video or image, include a link.
              // Renders as `1.12mb: [some-image.jpg](<original image url>)`
              `${prettyBytes(a.size)}: ${
                a.contentType?.match(/(image|video)/)
                  ? `[${a.name}](${a.url})`
                  : a.name
              }`,
          )
          .join("\n");

  switch (reason) {
    case ReportReasons.mod:
      return {
        content: `${preface}:${extra}
${reportedMessage}

${postfix}`,
        embeds: [{ description: `${link}${attachments}` }],
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
        embeds: [{ description: `${link}${attachments}` }],
      };

    case ReportReasons.userWarn:
      return {
        content: `${modAlert} – ${preface}, met the warning threshold for the message:
${extra}
${reportedMessage}

${postfix}`,
        embeds: [{ description: `${link}${attachments}` }],
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
