import { type Guild, type PartialUser, type User } from "discord.js";
import { Effect } from "effect";

import { DatabaseLayer } from "#~/Database";
import { forwardMessageSafe, sendMessage } from "#~/effects/discordSdk";
import { logEffect } from "#~/effects/observability";
import { runEffect } from "#~/effects/runtime";
import { truncateMessage } from "#~/helpers/string";
import { fetchSettingsEffect, SETTINGS } from "#~/models/guilds.server";
import { getOrCreateUserThread } from "#~/models/userThreads.ts";

export type ModActionReport =
  | {
      guild: Guild;
      user: User;
      actionType: "kick" | "ban" | "unban";
      executor: User | PartialUser | null;
      reason: string;
    }
  | {
      guild: Guild;
      user: User;
      actionType: "timeout";
      executor: User | PartialUser | null;
      reason: string;
      duration: string;
    }
  | {
      guild: Guild;
      user: User;
      actionType: "timeout_removed";
      executor: User | PartialUser | null;
      reason: string;
    }
  | {
      guild: Guild;
      user: User;
      actionType: "left";
      executor: undefined;
      reason: undefined;
    };

export const logModAction = (report: ModActionReport) =>
  Effect.gen(function* () {
    const { guild, user, actionType, executor, reason } = report;
    yield* logEffect(
      "info",
      "logModAction",
      `${actionType} detected for ${user.username}`,
      {
        userId: user.id,
        guildId: guild.id,
        actionType,
        executorId: executor?.id,
        reason,
      },
    );

    if (actionType === "left") {
      return;
    }

    // Get or create persistent user thread
    const thread = yield* getOrCreateUserThread(guild, user);

    // Get mod log for forwarding
    const { modLog, moderator } = yield* fetchSettingsEffect(guild.id, [
      SETTINGS.modLog,
      SETTINGS.moderator,
    ]);

    // Construct the log message
    const actionLabels: Record<ModActionReport["actionType"], string> = {
      ban: "was banned",
      kick: "was kicked",
      unban: "was unbanned",
      timeout: "was timed out",
      timeout_removed: "had timeout removed",
      left: "left",
    };
    const actionLabel = actionLabels[actionType];
    const executorMention = executor
      ? ` by <@${executor.id}> (${executor.username})`
      : " by unknown";

    const reasonText = reason ? ` ${reason}` : " for no reason";
    const durationText =
      actionType === "timeout" ? ` for ${report.duration}` : "";

    const logContent = truncateMessage(
      `<@${user.id}> (${user.username}) ${actionLabel}${durationText}
-# ${executorMention}${reasonText} <t:${Math.floor(Date.now() / 1000)}:R>`,
    ).trim();

    // Send log to thread
    const logMessage = yield* sendMessage(thread, {
      content: logContent,
      allowedMentions: { roles: [moderator] },
    });

    // Forward to mod log (non-critical)
    yield* forwardMessageSafe(logMessage, modLog);
  }).pipe(
    Effect.withSpan("logModAction", {
      attributes: {
        userId: report.user.id,
        guildId: report.guild.id,
        actionType: report.actionType,
      },
    }),
  );

/**
 * Logs a mod action (kick/ban/unban/timeout) to the user's persistent thread.
 * Used when Discord events indicate a moderation action occurred.
 */
export const logModActionLegacy = (report: ModActionReport): Promise<void> =>
  runEffect(Effect.provide(logModAction(report), DatabaseLayer));
