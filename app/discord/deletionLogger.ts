import { AuditLogEvent, Colors, Events, type Client } from "discord.js";
import { Effect } from "effect";

import { runEffect, runGatedFeature } from "#~/AppRuntime";
import { AUDIT_LOG_WINDOW_MS, fetchAuditLogEntry } from "#~/discord/auditLog";
import {
  fetchChannel,
  fetchGuild,
  fetchUserOrNull,
} from "#~/effects/discordSdk.ts";
import { DiscordApiError } from "#~/effects/errors";
import { logEffect } from "#~/effects/observability";
import { quoteMessageContent } from "#~/helpers/discord";
import { getOrCreateDeletionLogThread } from "#~/models/deletionLogThreads";
import { fetchSettingsEffect, SETTINGS } from "#~/models/guilds.server";

import {
  MessageCacheService,
  startMessageCacheExpiration,
} from "./messageCacheService";

export async function startDeletionLogging(client: Client) {
  // Cache every guild message so we have author/content on delete even for
  // messages Discord doesn't include in the partial delete event.
  client.on(Events.MessageCreate, (msg) => {
    if (msg.author.system || msg.author.bot || !msg.inGuild()) return;

    void runGatedFeature(
      "deletion-log",
      msg.guildId,
      Effect.gen(function* () {
        const cache = yield* MessageCacheService;
        yield* cache.upsertMessage({
          messageId: msg.id,
          guildId: msg.guildId,
          channelId: msg.channelId,
          userId: msg.author.id,
          content: msg.content,
        });
      }).pipe(
        Effect.catchAll((e) =>
          logEffect("warn", "DeletionLogger", "Failed to cache message", {
            messageId: msg.id,
            error: String(e),
          }),
        ),
        Effect.withSpan("DeletionLogger.cacheMessage", {
          attributes: { messageId: msg.id, guildId: msg.guildId },
        }),
      ),
    );
  });

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

        if (!settings?.deletionLog) return;

        const cache = yield* MessageCacheService;
        const cached = yield* cache.getMessage(msg.id);

        yield* logEffect("info", "DeletionLogger", "MessageDelete event data", {
          messageId: msg.id,
          partial: msg.partial,
          hasAuthor: !!msg.author,
          authorId: msg.author?.id ?? null,
          hasCacheEntry: !!cached,
          cachedUserId: cached?.user_id ?? null,
          hasContent: msg.content !== null,
          hasCachedContent:
            cached?.content !== null && cached?.content !== undefined,
        });

        const channelMention = `<#${msg.channelId}>`;

        // Resolve author: prefer live partial data, fall back to cache
        const userId = msg.author?.id ?? cached?.user_id;
        const content = msg.content ?? cached?.content ?? null;

        if (!userId) {
          // Nothing to attribute — post a minimal record to the log channel
          const logChannel = yield* fetchChannel(
            guild,
            settings.deletionLog,
          ).pipe(Effect.catchAll(() => Effect.succeed(null)));

          if (logChannel?.isTextBased()) {
            const uncachedAuditEntry = yield* fetchAuditLogEntry(
              guild,
              msg.id,
              AuditLogEvent.MessageDelete,
              (entries) =>
                entries.find(
                  (e) =>
                    (e.extra as { channel?: { id: string } } | null)?.channel
                      ?.id === msg.channelId &&
                    Date.now() - e.createdTimestamp < AUDIT_LOG_WINDOW_MS,
                ),
            ).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

            const sent = `<t:${Math.floor(msg.createdTimestamp / 1000)}:R>`;
            const header = uncachedAuditEntry?.executor
              ? `<@${uncachedAuditEntry.executor.id}> deleted from ${channelMention}, sent ${sent}`
              : `Message deleted from ${channelMention}, sent ${sent}`;

            yield* Effect.tryPromise({
              try: () =>
                logChannel.send({
                  allowedMentions: { parse: [] },
                  embeds: [
                    {
                      description: `${header}\n-# we don't know the content or author of uncached messages`,
                      color: Colors.Red,
                    },
                  ],
                }),
              catch: () => Effect.void,
            }).pipe(Effect.catchAll((e) => e));
          }
          return;
        }

        // We have a userId — resolve to a User object for thread creation
        const user = msg.author ?? (yield* fetchUserOrNull(client, userId));

        if (!user) return;

        const thread = yield* getOrCreateDeletionLogThread(guild, user).pipe(
          Effect.catchAll((error) =>
            logEffect(
              "warn",
              "DeletionLogger",
              "Failed to get/create deletion log thread",
              { guildId: guild.id, userId: user.id, error: String(error) },
            ),
          ),
        );

        if (!thread) return;

        // Check audit log to determine whether a mod or the author deleted it.
        // Self-deletions don't appear in the audit log.
        const auditEntry = yield* fetchAuditLogEntry(
          guild,
          userId,
          AuditLogEvent.MessageDelete,
          (entries) =>
            entries.find(
              (e) =>
                e.targetId === userId &&
                Date.now() - e.createdTimestamp < AUDIT_LOG_WINDOW_MS,
            ),
        ).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

        const sent = `<t:${Math.floor(msg.createdTimestamp / 1000)}:R>`;
        const header = auditEntry?.executor
          ? `<@${auditEntry.executor.id}> deleted from ${channelMention}, sent ${sent}`
          : `Message deleted from ${channelMention}, sent ${sent}`;

        yield* Effect.tryPromise({
          try: () =>
            thread.send({
              allowedMentions: { parse: [] },
              embeds: [
                {
                  description: [
                    header,
                    `<@${user.id}>`,
                    quoteMessageContent(content ?? "*(content not cached)*"),
                  ].join("\n"),
                  color: Colors.Red,
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

        if (!settings?.deletionLog) return;

        const author = newMessage.author;
        if (!author) return;

        const cache = yield* MessageCacheService;
        const cached = yield* cache.getMessage(newMessage.id);

        // Prefer cached content as "before" — more reliable than the partial
        // oldMessage which Discord may not populate
        const before =
          cached?.content ??
          oldMessage.content ??
          "*(not available — message was not cached)*";
        const after = newMessage.content ?? "*(content unavailable)*";

        // Update cache with new content and refresh last_touched
        yield* cache.touchMessage(newMessage.id, newMessage.content ?? null);

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

        const channelMention = `<#${newMessage.channelId}>`;
        const sent = `<t:${Math.floor(newMessage.createdTimestamp / 1000)}:R>`;

        yield* Effect.tryPromise({
          try: () =>
            thread.send({
              allowedMentions: { parse: [] },
              embeds: [
                {
                  description: [
                    `<@${author.id}> edited their message in ${channelMention}, sent ${sent}`,
                    quoteMessageContent(before),
                    "↓",
                    quoteMessageContent(after),
                    `-# [Go to message](${newMessage.url})`,
                  ].join("\n"),
                  color: Colors.Yellow,
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

        if (!settings?.deletionLog) return;

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

        // Tally messages per non-bot author from cached messages
        const authorCounts = new Map<string, { tag: string; count: number }>();
        for (const msg of messages.values()) {
          if (!msg.author || msg.author.bot) continue;
          const key = msg.author.id;
          const existing = authorCounts.get(key);
          if (existing) {
            existing.count++;
          } else {
            authorCounts.set(key, { tag: msg.author.tag, count: 1 });
          }
        }

        const count = [...messages.values()].filter(
          (msg) => !msg.author?.bot,
        ).length;
        if (count === 0) return;

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
              allowedMentions: { parse: [] },
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

  // Start periodic expiration of cached content (60 min) and rows (24 hr)
  startMessageCacheExpiration(() =>
    runEffect(
      Effect.gen(function* () {
        const cache = yield* MessageCacheService;
        yield* cache.expireContent();
        yield* cache.expireRows();
      }).pipe(
        Effect.catchAll((e) =>
          logEffect("warn", "MessageCacheExpiration", "Expiration run failed", {
            error: String(e),
          }),
        ),
      ),
    ),
  );
}
