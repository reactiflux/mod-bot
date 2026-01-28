/**
 * Discord SDK - Effect-TS wrappers for common Discord.js operations.
 *
 * These helpers provide consistent error handling and reduce boilerplate
 * when calling Discord.js APIs from Effect-based code.
 */
import type {
  Client,
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  Message,
  PartialMessage,
  ThreadChannel,
  User,
} from "discord.js";
import { Effect } from "effect";

import { DiscordApiError } from "#~/effects/errors";
import { logEffect } from "#~/effects/observability";

export const fetchGuild = (client: Client, guildId: string) =>
  Effect.tryPromise({
    try: () => client.guilds.fetch(guildId),
    catch: (error) =>
      new DiscordApiError({ operation: "fetchGuild", cause: error }),
  });

export const fetchChannel = (guild: Guild, channelId: string) =>
  Effect.tryPromise({
    try: () => guild.channels.fetch(channelId),
    catch: (error) =>
      new DiscordApiError({ operation: "fetchChannel", cause: error }),
  });

export const fetchChannelFromClient = <T = GuildTextBasedChannel>(
  client: Client,
  channelId: string,
) =>
  Effect.tryPromise({
    try: () => client.channels.fetch(channelId) as Promise<T>,
    catch: (error) =>
      new DiscordApiError({ operation: "fetchChannel", cause: error }),
  });

export const fetchMember = (guild: Guild, userId: string) =>
  Effect.tryPromise({
    try: () => guild.members.fetch(userId),
    catch: (error) =>
      new DiscordApiError({ operation: "fetchMember", cause: error }),
  });

export const fetchMemberOrNull = (
  guild: Guild,
  userId: string,
): Effect.Effect<GuildMember | null, never, never> =>
  Effect.tryPromise({
    try: () => guild.members.fetch(userId),
    catch: () => null,
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));

export const fetchUser = (client: Client, userId: string) =>
  Effect.tryPromise({
    try: () => client.users.fetch(userId),
    catch: (error) =>
      new DiscordApiError({ operation: "fetchUser", cause: error }),
  });

export const fetchUserOrNull = (
  client: Client,
  userId: string,
): Effect.Effect<User | null, never, never> =>
  Effect.tryPromise({
    try: () => client.users.fetch(userId),
    catch: () => null,
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));

export const fetchMessage = (
  channel: GuildTextBasedChannel | ThreadChannel,
  messageId: string,
) =>
  Effect.tryPromise({
    try: () => channel.messages.fetch(messageId),
    catch: (error) =>
      new DiscordApiError({ operation: "fetchMessage", cause: error }),
  });

export const sendMessage = (
  channel: GuildTextBasedChannel | ThreadChannel,
  options: Parameters<typeof channel.send>[0],
) =>
  Effect.tryPromise({
    try: () => channel.send(options),
    catch: (error) =>
      new DiscordApiError({ operation: "sendMessage", cause: error }),
  });

export const editMessage = (
  message: Message,
  options: Parameters<typeof message.edit>[0],
) =>
  Effect.tryPromise({
    try: () => message.edit(options),
    catch: (error) =>
      new DiscordApiError({ operation: "editMessage", cause: error }),
  });

export const forwardMessageSafe = (message: Message, targetChannelId: string) =>
  Effect.tryPromise({
    try: () => message.forward(targetChannelId),
    catch: (error) => error,
  }).pipe(
    Effect.catchAll((error) =>
      logEffect("error", "Discord SDK", "failed to forward to modLog", {
        error: String(error),
        messageId: message.id,
        targetChannelId,
      }),
    ),
  );

export const replyAndForwardSafe = (
  message: Message,
  content: string,
  forwardToChannelId: string,
) =>
  Effect.tryPromise({
    try: async () => {
      const reply = await message.reply({ content });
      await reply.forward(forwardToChannelId);
      return reply;
    },
    catch: () => null,
  }).pipe(
    Effect.catchAll((error) =>
      logEffect("warn", "Discord SDK", "Could not reply and forward message", {
        error,
        messageId: message.id,
        forwardToChannelId,
      }),
    ),
  );

/**
 * Resolve a potentially partial message to a full Message.
 * Only fetches from Discord API if the message is partial.
 * Provides type narrowing from Message | PartialMessage to Message.
 */
export const resolveMessagePartial = (
  msg: Message | PartialMessage,
): Effect.Effect<Message, DiscordApiError, never> =>
  msg.partial
    ? Effect.tryPromise({
        try: () => msg.fetch(),
        catch: (error) =>
          new DiscordApiError({
            operation: "resolveMessagePartial",
            cause: error,
          }),
      })
    : Effect.succeed(msg);
