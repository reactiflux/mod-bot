import { AutoModerationActionType, type Guild, type User } from "discord.js";
import { Effect } from "effect";

import { DatabaseLayer } from "#~/Database";
import { DiscordApiError } from "#~/effects/errors";
import { logEffect } from "#~/effects/observability";
import { runEffect } from "#~/effects/runtime";
import { truncateMessage } from "#~/helpers/string";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";
import { getOrCreateUserThread } from "#~/models/userThreads.ts";

export interface AutomodReport {
  guild: Guild;
  user: User;
  content: string;
  channelId?: string;
  messageId?: string;
  ruleName: string;
  matchedKeyword?: string;
  actionType: AutoModerationActionType;
}

const ActionTypeLabels: Record<AutoModerationActionType, string> = {
  [AutoModerationActionType.BlockMessage]: "blocked message",
  [AutoModerationActionType.SendAlertMessage]: "sent alert",
  [AutoModerationActionType.Timeout]: "timed out user",
  [AutoModerationActionType.BlockMemberInteraction]: "blocked interaction",
};

const logAutomod = ({
  guild,
  user,
  channelId,
  ruleName,
  matchedKeyword,
  actionType,
}: AutomodReport) =>
  Effect.gen(function* () {
    yield* logEffect(
      "info",
      "logAutomod",
      `Automod triggered for ${user.username}`,
      {
        userId: user.id,
        guildId: guild.id,
        ruleName,
        actionType,
      },
    );

    // Get or create persistent user thread
    const thread = yield* getOrCreateUserThread(guild, user);

    // Get mod log for forwarding
    const { modLog, moderator } = yield* Effect.tryPromise({
      try: () => fetchSettings(guild.id, [SETTINGS.modLog, SETTINGS.moderator]),
      catch: (error) =>
        new DiscordApiError({
          operation: "fetchSettings",
          discordError: error,
        }),
    });

    // Construct the log message
    const channelMention = channelId ? `<#${channelId}>` : "Unknown channel";
    const actionLabel = ActionTypeLabels[actionType] ?? "took action";

    const logContent = truncateMessage(
      `<@${user.id}> (${user.username}) triggered automod ${matchedKeyword ? `with text  \`${matchedKeyword}\` ` : ""}in ${channelMention}
-# ${ruleName} · Automod ${actionLabel}`,
    ).trim();

    // Send log to thread
    const logMessage = yield* Effect.tryPromise({
      try: () =>
        thread.send({
          content: logContent,
          allowedMentions: { roles: [moderator] },
        }),
      catch: (error) =>
        new DiscordApiError({
          operation: "sendLogMessage",
          discordError: error,
        }),
    });

    // Forward to mod log (non-critical)
    yield* Effect.tryPromise({
      try: () => logMessage.forward(modLog),
      catch: (error) => error,
    }).pipe(
      Effect.catchAll((error) =>
        logEffect("error", "logAutomod", "failed to forward to modLog", {
          error: String(error),
        }),
      ),
    );
  }).pipe(
    Effect.withSpan("logAutomod", {
      attributes: { userId: user.id, guildId: guild.id, ruleName },
    }),
  );

/**
 * Logs an automod action when we don't have a full Message object.
 * Used when Discord's automod blocks/deletes a message before we can fetch it.
 */
export const logAutomodLegacy = (report: AutomodReport): Promise<void> =>
  runEffect(Effect.provide(logAutomod(report), DatabaseLayer));
