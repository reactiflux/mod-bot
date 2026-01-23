import { AutoModerationActionType, type Guild, type User } from "discord.js";
import { Effect } from "effect";

import { DatabaseLayer } from "#~/Database";
import { forwardMessageSafe, sendMessage } from "#~/effects/discordSdk";
import { logEffect } from "#~/effects/observability";
import { runEffect } from "#~/effects/runtime";
import { truncateMessage } from "#~/helpers/string";
import { fetchSettingsEffect, SETTINGS } from "#~/models/guilds.server";
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

export const logAutomod = ({
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
    const { modLog, moderator } = yield* fetchSettingsEffect(guild.id, [
      SETTINGS.modLog,
      SETTINGS.moderator,
    ]);

    // Construct the log message
    const channelMention = channelId ? `<#${channelId}>` : "Unknown channel";
    const actionLabel = ActionTypeLabels[actionType] ?? "took action";

    const logContent = truncateMessage(
      `<@${user.id}> (${user.username}) triggered automod ${matchedKeyword ? `with text  \`${matchedKeyword}\` ` : ""}in ${channelMention}
-# ${ruleName} · Automod ${actionLabel}`,
    ).trim();

    // Send log to thread
    const logMessage = yield* sendMessage(thread, {
      content: logContent,
      allowedMentions: { roles: [moderator] },
    });

    // Forward to mod log (non-critical)
    yield* forwardMessageSafe(logMessage, modLog);
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
