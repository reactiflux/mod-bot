import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  InteractionType,
  SlashCommandBuilder,
  type APIEmbed,
  type ChatInputCommandInteraction,
  type Collection,
  type Guild,
  type GuildMember,
  type Message,
  type MessageComponentInteraction,
  type MessageContextMenuCommandInteraction,
  type MessageReaction,
  type ModalSubmitInteraction,
  type PartialMessage,
  type PartialMessageReaction,
  type Poll,
  type UserContextMenuCommandInteraction,
} from "discord.js";
import { Effect } from "effect";
import { partition } from "lodash-es";
import prettyBytes from "pretty-bytes";

import { resolveMessagePartial } from "#~/effects/discordSdk";
import { type DiscordApiError, NotFoundError } from "#~/effects/errors.ts";
import {
  getChars,
  getWords,
  parseMarkdownBlocks,
} from "#~/helpers/messageParsing";

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
        description: attachments
          .map(
            ({ size, name, contentType, url }) =>
              // Include size of the file and the filename
              `${prettyBytes(size)}: ${
                // If it's a video or image, include a link.
                // Renders as `1.12mb: [some-image.jpg](<original image url>)`
                contentType?.match(/(image|video)/) ? `[${name}](${url})` : name
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
export type AnyCommand =
  | MessageContextCommand
  | UserContextCommand
  | SlashCommand
  | MessageComponentCommand
  | ModalCommand
  | AnyEffectCommand;

export interface MessageContextCommand {
  command: ContextMenuCommandBuilder;
  handler: (interaction: MessageContextMenuCommandInteraction) => Promise<void>;
}
export const isMessageContextCommand = (
  config: AnyCommand,
): config is MessageContextCommand =>
  config.command instanceof ContextMenuCommandBuilder &&
  config.command.type === ApplicationCommandType.Message;

export interface UserContextCommand {
  command: ContextMenuCommandBuilder;
  handler: (interaction: UserContextMenuCommandInteraction) => Promise<void>;
}
export const isUserContextCommand = (
  config: AnyCommand,
): config is UserContextCommand =>
  config.command instanceof ContextMenuCommandBuilder &&
  config.command.type === ApplicationCommandType.User;

export interface SlashCommand {
  command: SlashCommandBuilder;
  handler: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
export const isSlashCommand = (config: AnyCommand): config is SlashCommand =>
  config.command instanceof SlashCommandBuilder;

export interface MessageComponentCommand {
  command: { type: InteractionType.MessageComponent; name: string };
  handler: (interaction: MessageComponentInteraction) => Promise<void>;
}
export const isMessageComponentCommand = (
  config: AnyCommand,
): config is MessageComponentCommand =>
  "type" in config.command &&
  config.command.type === InteractionType.MessageComponent;

export interface ModalCommand {
  command: { type: InteractionType.ModalSubmit; name: string };
  handler: (interaction: ModalSubmitInteraction) => Promise<void>;
}
export const isModalCommand = (config: AnyCommand): config is ModalCommand =>
  "type" in config.command &&
  config.command.type === InteractionType.ModalSubmit;

//
// Effect-based command types
// Handlers must be fully self-contained: E = never, R = never, A = void
//

export type EffectHandler<I> = (
  interaction: I,
) => Effect.Effect<void, never, never>;

export interface EffectSlashCommand {
  type: "effect";
  command: SlashCommandBuilder;
  handler: EffectHandler<ChatInputCommandInteraction>;
}

export interface EffectMessageComponentCommand {
  type: "effect";
  command: { type: InteractionType.MessageComponent; name: string };
  handler: EffectHandler<MessageComponentInteraction>;
}

export interface EffectUserContextCommand {
  type: "effect";
  command: ContextMenuCommandBuilder;
  handler: EffectHandler<UserContextMenuCommandInteraction>;
}

export interface EffectMessageContextCommand {
  type: "effect";
  command: ContextMenuCommandBuilder;
  handler: EffectHandler<MessageContextMenuCommandInteraction>;
}

export interface EffectModalCommand {
  type: "effect";
  command: { type: InteractionType.ModalSubmit; name: string };
  handler: EffectHandler<ModalSubmitInteraction>;
}

export type AnyEffectCommand =
  | EffectSlashCommand
  | EffectMessageComponentCommand
  | EffectUserContextCommand
  | EffectMessageContextCommand
  | EffectModalCommand;

export const isEffectCommand = (
  config: AnyCommand,
): config is AnyEffectCommand => "type" in config && config.type === "effect";

export interface CodeStats {
  chars: number;
  words: number;
  lines: number;
  lang: string | undefined;
}

export interface MessageStats {
  char_count: number;
  word_count: number;
  code_stats: CodeStats[];
  link_stats: string[];
  react_count: number;
  sent_at: number;
}

/**
 * getMessageStats is a helper to retrieve common metrics from a message
 * @param msg A Discord Message or PartialMessage object
 * @returns MessageStats with char/word counts, code blocks, links, reactions, and timestamp
 */
export const getMessageStats = (
  msg: Message | PartialMessage,
): Effect.Effect<MessageStats, NotFoundError | DiscordApiError, never> =>
  Effect.gen(function* () {
    const message = yield* resolveMessagePartial(msg);

    const { content } = message;
    if (!content) {
      return yield* Effect.fail(
        new NotFoundError({ resource: "message", id: msg.id }),
      );
    }

    const blocks = parseMarkdownBlocks(content);

    // TODO: groupBy would be better here, but this was easier to keep typesafe
    const [textblocks, nontextblocks] = partition(
      blocks,
      (b) => b.type === "text",
    );
    const [links, codeblocks] = partition(
      nontextblocks,
      (b) => b.type === "link",
    );

    const linkStats = links.map((link) => link.url);

    const { wordCount, charCount } = [...links, ...textblocks].reduce(
      (acc, block) => {
        const content =
          block.type === "link" ? (block.label ?? "") : block.content;
        const words = getWords(content).length;
        const chars = getChars(content).length;
        return {
          wordCount: acc.wordCount + words,
          charCount: acc.charCount + chars,
        };
      },
      { wordCount: 0, charCount: 0 },
    );

    const codeStats = codeblocks.map((block): CodeStats => {
      switch (block.type) {
        case "fencedcode": {
          const content = block.code.join("\n");
          return {
            chars: getChars(content).length,
            words: getWords(content).length,
            lines: block.code.length,
            lang: block.lang,
          };
        }
        case "inlinecode": {
          return {
            chars: getChars(block.code).length,
            words: getWords(block.code).length,
            lines: 1,
            lang: undefined,
          };
        }
      }
    });

    return {
      char_count: charCount,
      word_count: wordCount,
      code_stats: codeStats,
      link_stats: linkStats,
      react_count: msg.reactions.cache.size,
      sent_at: msg.createdTimestamp,
    };
  }).pipe(
    Effect.withSpan("getMessageStats", {
      attributes: { messageId: msg.id },
    }),
  );

export function hasModRole(
  interaction: MessageComponentInteraction,
  modRoleId: string,
): boolean {
  const member = interaction.member;
  if (!member) return false;

  if (Array.isArray(member.roles)) {
    return member.roles.includes(modRoleId);
  }
  return member.roles.cache.has(modRoleId);
}
