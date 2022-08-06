import type {
  Message,
  GuildMember,
  PartialMessage,
  Guild,
  MessageReaction,
  PartialMessageReaction,
} from "discord.js";
import prettyBytes from "pretty-bytes";
import { truncateMessage } from "./string";

const staffRoles = ["mvp", "moderator", "admin", "admins"];
const helpfulRoles = ["mvp", "star helper"];

const hasRole = (member: GuildMember, roles: string | string[]) =>
  member.roles.cache.some((role) => {
    const normalizedRole = role.name.toLowerCase();
    return typeof roles === "string"
      ? roles === normalizedRole
      : roles.includes(normalizedRole);
  });

export const isStaff = (member: GuildMember | null | undefined) => {
  if (!member) return false;

  return hasRole(member, staffRoles);
};
export const isHelpful = (member: GuildMember | null | undefined) => {
  if (!member) return false;

  return hasRole(member, helpfulRoles);
};

export const constructDiscordLink = (message: Message | PartialMessage) =>
  `https://discord.com/channels/${message.guild?.id}/${message.channel.id}/${message.id}`;

export const fetchReactionMembers = (
  guild: Guild,
  reaction: MessageReaction | PartialMessageReaction,
) => {
  try {
    return reaction.users
      .fetch()
      .then((users) =>
        Promise.all(users.map((user) => guild.members.fetch(user.id))),
      );
  } catch (e) {
    return Promise.resolve([] as GuildMember[]);
  }
};

/*
 * Escape a message and insert markdown quote symbols. Returns a string with
 * backticks escaped to render correctly when sent in a quote.
 */
export const quoteMessageContent = (content: string) => {
  return `> ${content.replace("`", "\\`").replace(/[\n]/g, "\n> ")}`;
};

/*
 * Create a message embed that
 */
export const describeAttachments = (attachments: Message["attachments"]) => {
  return attachments.size === 0
    ? ""
    : "Attachments:\n" +
        attachments
          .map(
            ({ size, name, contentType, url }) =>
              // Include size of the file and the filename
              `${prettyBytes(size)}: ${
                // If it's a video or image, include a link.
                // Renders as `1.12mb: [some-image.jpg](<original image url>)`
                contentType?.match(/(image|video)/) ? `[${name}](${url})` : name
              }`,
          )
          .join("\n");
};

/*
 * Escape content that Discord would otherwise do undesireable things with.
 * Sepecifically, suppresses @-mentions and link previews.
 */
export const escapeDisruptiveContent = (content: string) => {
  return (
    content
      // Silence pings
      .replace(/@(\S*)(\s)?/g, "@ $1$2")
      // Wrap links in <> so they don't make a preview
      .replace(/(https?:\/\/.*)\s?/g, "<$1>")
  );
};

export const quoteAndEscape = (content: string) => {
  return truncateMessage(escapeDisruptiveContent(quoteMessageContent(content)));
};
