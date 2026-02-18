import { Colors, Events, type Client } from "discord.js";
import { Effect } from "effect";

import { runGatedFeature } from "#~/AppRuntime";
import { fetchChannel, fetchGuild } from "#~/effects/discordSdk.ts";
import { DiscordApiError } from "#~/effects/errors";
import { logEffect } from "#~/effects/observability";
import { getOrCreateDeletionLogThread } from "#~/models/deletionLogThreads";
import { fetchSettingsEffect, SETTINGS } from "#~/models/guilds.server";

export async function startDeletionLogging(client: Client) {
  client.on(Events.MessageDelete, (msg) => {
    if (msg.system || msg.author?.bot || !msg.guildId) return;

    void runGatedFeature(
      "deletion-log",
      msg.guildId,
      Effect.gen(function* () {
        const guild = yield* fetchGuild(client, msg.guildId!);

        const settings = yield* fetchSettingsEffect(guild.id, [
          SETTINGS.deletionLog,
        ]).pipe(Effect.catchAll(() => Effect.succeed(null)));

        if (!settings?.deletionLog) {
          yield* logEffect(
            "debug",
            "DeletionLogger",
            "No deletionLog channel configured, skipping",
            { guildId: guild.id },
          );
          return;
        }

        const author = msg.author;
        if (!author) {
          yield* logEffect(
            "debug",
            "DeletionLogger",
            "Message has no author (not cached), skipping",
            { guildId: guild.id },
          );
          return;
        }

        const thread = yield* getOrCreateDeletionLogThread(guild, author).pipe(
          Effect.catchAll((error) =>
            logEffect(
              "warn",
              "DeletionLogger",
              "Failed to get/create deletion log thread",
              { guildId: guild.id, userId: author.id, error: String(error) },
            ),
          ),
        );

        if (!thread) return;

        const content =
          msg.content ?? "*(not available — message was not cached)*";
        const channelName =
          "name" in msg.channel
            ? `#${msg.channel.name}`
            : `<#${msg.channelId}>`;

        yield* Effect.tryPromise({
          try: () =>
            thread.send({
              embeds: [
                {
                  title: "Message deleted",
                  color: Colors.Red,
                  fields: [
                    { name: "Channel", value: channelName, inline: true },
                    { name: "Content", value: content },
                  ],
                  timestamp: new Date().toISOString(),
                },
              ],
            }),
          catch: (error) =>
            logEffect(
              "warn",
              "DeletionLogger",
              "Failed to post deletion log embed",
              { guildId: guild.id, error: String(error) },
            ),
        }).pipe(Effect.catchAll((e) => e));
      }).pipe(
        Effect.catchAll((e) =>
          logEffect(
            "warn",
            "DeletionLogger",
            "Failed to log message deletion",
            {
              messageId: msg.id,
              error: String(e),
            },
          ),
        ),
        Effect.withSpan("DeletionLogger.messageDelete", {
          attributes: { messageId: msg.id, guildId: msg.guildId },
        }),
      ),
    );
  });

  client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
    if (
      !newMessage.guildId ||
      newMessage.author?.bot ||
      newMessage.author?.system
    )
      return;
    // Skip if content hasn't changed (e.g., embed resolution)
    if (oldMessage.content === newMessage.content) return;

    void runGatedFeature(
      "deletion-log",
      newMessage.guildId,
      Effect.gen(function* () {
        const guild = yield* fetchGuild(client, newMessage.guildId!);

        const settings = yield* fetchSettingsEffect(guild.id, [
          SETTINGS.deletionLog,
        ]).pipe(Effect.catchAll(() => Effect.succeed(null)));

        if (!settings?.deletionLog) {
          yield* logEffect(
            "debug",
            "DeletionLogger",
            "No deletionLog channel configured, skipping",
            { guildId: guild.id },
          );
          return;
        }

        const author = newMessage.author;
        if (!author) return;

        const thread = yield* getOrCreateDeletionLogThread(guild, author).pipe(
          Effect.catchAll((error) =>
            logEffect(
              "warn",
              "DeletionLogger",
              "Failed to get/create deletion log thread for edit",
              { guildId: guild.id, userId: author.id, error: String(error) },
            ),
          ),
        );

        if (!thread) return;

        const before =
          oldMessage.content ?? "*(not available — message was not cached)*";
        const after = newMessage.content ?? "*(content unavailable)*";
        const channelName =
          "name" in newMessage.channel
            ? `#${newMessage.channel.name}`
            : `<#${newMessage.channelId}>`;
        const jumpLink = newMessage.url;

        yield* Effect.tryPromise({
          try: () =>
            thread.send({
              embeds: [
                {
                  title: "Message edited",
                  color: Colors.Yellow,
                  fields: [
                    { name: "Before", value: before },
                    { name: "After", value: after },
                    { name: "Channel", value: channelName, inline: true },
                    {
                      name: "Jump",
                      value: `[Go to message](${jumpLink})`,
                      inline: true,
                    },
                  ],
                  timestamp: new Date().toISOString(),
                },
              ],
            }),
          catch: (error) =>
            logEffect(
              "warn",
              "DeletionLogger",
              "Failed to post edit log embed",
              { guildId: guild.id, error: String(error) },
            ),
        }).pipe(Effect.catchAll((e) => e));
      }).pipe(
        Effect.catchAll((e) =>
          logEffect("warn", "DeletionLogger", "Failed to log message edit", {
            messageId: newMessage.id,
            error: String(e),
          }),
        ),
        Effect.withSpan("DeletionLogger.messageUpdate", {
          attributes: {
            messageId: newMessage.id,
            guildId: newMessage.guildId,
          },
        }),
      ),
    );
  });

  client.on(Events.MessageBulkDelete, (messages, channel) => {
    const guildId = messages.first()?.guildId ?? channel.guildId;
    if (!guildId) return;

    void runGatedFeature(
      "deletion-log",
      guildId,
      Effect.gen(function* () {
        const guild = yield* fetchGuild(client, guildId);

        const settings = yield* fetchSettingsEffect(guild.id, [
          SETTINGS.deletionLog,
        ]).pipe(Effect.catchAll(() => Effect.succeed(null)));

        if (!settings?.deletionLog) {
          yield* logEffect(
            "debug",
            "DeletionLogger",
            "No deletionLog channel configured, skipping bulk delete",
            { guildId: guild.id },
          );
          return;
        }

        const deletionLogChannel = yield* fetchChannel(
          guild,
          settings.deletionLog,
        ).pipe(
          Effect.catchAll(() =>
            Effect.fail(
              new DiscordApiError({
                operation: "fetchDeletionLogChannel",
                cause: new Error("Deletion log channel not found"),
              }),
            ),
          ),
        );

        if (!deletionLogChannel?.isTextBased()) {
          yield* logEffect(
            "warn",
            "DeletionLogger",
            "Deletion log channel not found or not a text channel",
            { guildId: guild.id, channelId: settings.deletionLog },
          );
          return;
        }

        const channelName = `#${channel.name}`;
        const count = messages.size;

        // Tally messages per author from cached messages
        const authorCounts = new Map<string, { tag: string; count: number }>();
        for (const msg of messages.values()) {
          if (!msg.author) continue;
          const key = msg.author.id;
          const existing = authorCounts.get(key);
          if (existing) {
            existing.count++;
          } else {
            authorCounts.set(key, { tag: msg.author.tag, count: 1 });
          }
        }

        const authorList =
          authorCounts.size > 0
            ? [...authorCounts.values()]
                .map(
                  ({ tag, count }) =>
                    `• ${tag} (${count} message${count !== 1 ? "s" : ""})`,
                )
                .join("\n")
            : "*(no authors available — messages were not cached)*";

        yield* Effect.tryPromise({
          try: () =>
            deletionLogChannel.send({
              embeds: [
                {
                  title: "Messages bulk deleted",
                  color: Colors.Orange,
                  description: `**${count}** message${count !== 1 ? "s" : ""} bulk deleted in ${channelName}`,
                  fields: [{ name: "Authors", value: authorList }],
                  timestamp: new Date().toISOString(),
                },
              ],
            }),
          catch: (error) =>
            logEffect(
              "warn",
              "DeletionLogger",
              "Failed to post bulk delete log",
              { guildId: guild.id, error: String(error) },
            ),
        }).pipe(Effect.catchAll((e) => e));
      }).pipe(
        Effect.catchAll((e) =>
          logEffect(
            "warn",
            "DeletionLogger",
            "Failed to log bulk message delete",
            {
              guildId,
              error: String(e),
            },
          ),
        ),
        Effect.withSpan("DeletionLogger.messageBulkDelete", {
          attributes: { guildId, count: messages.size },
        }),
      ),
    );
  });
}
