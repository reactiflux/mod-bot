import type {
  Message,
  GuildMember,
  PartialMessage,
  Guild,
  MessageReaction,
  PartialMessageReaction,
  MessageContextMenuCommandInteraction,
  UserContextMenuCommandInteraction,
  ChatInputCommandInteraction,
  Poll,
  APIEmbed,
  Collection,
} from "discord.js";
import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
} from "discord.js";
import type { RequestHandler } from "express";
import prettyBytes from "pretty-bytes";

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
 * Given files attached to a message, return a plaintext description of those
 * files.
 */
export const describeAttachments = (
  attachments: Message["attachments"],
): APIEmbed | undefined => {
  return attachments.size === 0
    ? undefined
    : {
        description:
          "Attachments:\n" +
          attachments
            .map(
              ({ size, name, contentType, url }) =>
                // Include size of the file and the filename
                `${prettyBytes(size)}: ${
                  // If it's a video or image, include a link.
                  // Renders as `1.12mb: [some-image.jpg](<original image url>)`
                  contentType?.match(/(image|video)/)
                    ? `[${name}](${url})`
                    : name
                }`,
            )
            .join("\n"),
      };
};

/*
 * Create a message embed that describes the reactions on a message
 */
export const describeReactions = (
  reactions: Collection<string, MessageReaction>,
): APIEmbed | undefined => {
  return reactions.size === 0
    ? undefined
    : {
        title: "Reactions",
        fields: reactions.map((r) => ({
          name: "",
          value: `${r.count} ${
            r.emoji.id ? `<:${r.emoji.name}:${r.emoji.id}>` : r.emoji.name
          }`,
          inline: true,
        })),
      };
};

const urlRegex = /(https?:\/\/\S+|discord.gg\/\S+)\b/g;
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
      .replace(urlRegex, "<$1>")
  );
};

export const quoteAndEscape = (content: string) => {
  return escapeDisruptiveContent(quoteMessageContent(content));
};

export const quoteAndEscapePoll = (poll: Poll) => {
  return `Poll:
> ${poll.question.text}
${poll.answers.map((a) => `> - ${a.text}`).join("\n")}`;
};

//
// Types and type helpers for command configs
//
export type MessageContextCommand = {
  command: ContextMenuCommandBuilder;
  handler: (interaction: MessageContextMenuCommandInteraction) => void;
  webserver?: RequestHandler;
};
export const isMessageContextCommand = (
  config: MessageContextCommand | UserContextCommand | SlashCommand,
): config is MessageContextCommand =>
  config.command instanceof ContextMenuCommandBuilder &&
  config.command.type === ApplicationCommandType.Message;

export type UserContextCommand = {
  command: ContextMenuCommandBuilder;
  handler: (interaction: UserContextMenuCommandInteraction) => void;
  webserver?: RequestHandler;
};
export const isUserContextCommand = (
  config: MessageContextCommand | UserContextCommand | SlashCommand,
): config is UserContextCommand =>
  config.command instanceof ContextMenuCommandBuilder &&
  config.command.type === ApplicationCommandType.User;

export type SlashCommand = {
  command: SlashCommandBuilder;
  handler: (interaction: ChatInputCommandInteraction) => void;
  webserver?: RequestHandler;
};
export const isSlashCommand = (
  config: MessageContextCommand | UserContextCommand | SlashCommand,
): config is SlashCommand => config.command instanceof SlashCommandBuilder;
