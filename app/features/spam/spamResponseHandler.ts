/**
 * Graduated response execution for spam verdicts.
 * Effect-based — performs Discord API calls and DB writes.
 */

import type { GuildMember, Message } from "discord.js";
import { Effect } from "effect";

import { logUserMessage } from "#~/commands/report/userLog.ts";
import { DatabaseLayer } from "#~/Database.ts";
import { client } from "#~/discord/client.server.ts";
import { deleteMessage } from "#~/effects/discordSdk.ts";
import { SpamDetectionError } from "#~/effects/errors.ts";
import { logEffect } from "#~/effects/observability.ts";
import { featureStats } from "#~/helpers/metrics.ts";
import { applyRestriction, timeout } from "#~/models/discord.server.ts";
import {
  markMessageAsDeleted,
  ReportReasons,
} from "#~/models/reportedMessages.ts";

import { AUTO_KICK_THRESHOLD, type SpamVerdict } from "./spamScorer.ts";

/**
 * Execute the graduated response for a spam verdict.
 * Should be called within a context that has DatabaseLayer provided.
 */
export const executeResponse = (
  verdict: SpamVerdict,
  message: Message,
  member: GuildMember,
) =>
  Effect.gen(function* () {
    if (verdict.tier === "none") return;

    const guildId = message.guild!.id;
    const userId = message.author.id;

    yield* logEffect("info", "SpamResponse", `Spam verdict: ${verdict.tier}`, {
      tier: verdict.tier,
      score: verdict.totalScore,
      userId,
      guildId,
      summary: verdict.summary,
    });

    // Honeypot: softban (ban + unban to clear 7 days of messages)
    if (verdict.tier === "honeypot") {
      yield* executeSoftban(message, member, verdict);
      return;
    }

    // Low tier: log only, no delete
    if (verdict.tier === "low") {
      yield* logSpamReport(message, verdict);
      featureStats.spamFlaggedForReview(guildId, userId, message.channelId);
      return;
    }

    // Medium and high: delete the message first
    yield* deleteMessage(message).pipe(
      Effect.tap(() =>
        Effect.provide(
          markMessageAsDeleted(message.id, guildId),
          DatabaseLayer,
        ),
      ),
      Effect.catchTag("DiscordApiError", (e) =>
        logEffect("warn", "SpamResponse", "Failed to delete spam message", {
          error: String(e.cause),
        }),
      ),
    );

    if (verdict.tier === "medium") {
      // Apply restricted role
      yield* Effect.tryPromise({
        try: () => applyRestriction(member),
        catch: (error) =>
          new SpamDetectionError({
            operation: "applyRestriction",
            cause: error,
          }),
      }).pipe(
        Effect.catchTag("SpamDetectionError", (e) =>
          logEffect("warn", "SpamResponse", "Failed to apply restriction", {
            error: String(e.cause),
          }),
        ),
      );
      featureStats.spamRestricted(guildId, userId, message.channelId);
    }

    if (verdict.tier === "high") {
      // Timeout user
      yield* Effect.tryPromise({
        try: () => timeout(member, "Automated spam detection"),
        catch: (error) =>
          new SpamDetectionError({ operation: "timeout", cause: error }),
      }).pipe(
        Effect.catchTag("SpamDetectionError", (e) =>
          logEffect("warn", "SpamResponse", "Failed to timeout user", {
            error: String(e.cause),
          }),
        ),
      );
      featureStats.spamTimedOut(guildId, userId, message.channelId);
    }

    // Log to mod thread for all medium/high tiers
    const logResult = yield* logSpamReport(message, verdict);

    // Check for auto-kick on high tier
    if (verdict.tier === "high" && logResult) {
      const { warnings, message: logMessage } = logResult;
      if (warnings >= AUTO_KICK_THRESHOLD) {
        yield* Effect.tryPromise({
          try: () => member.kick("Autokicked for repeated spam"),
          catch: (error) =>
            new SpamDetectionError({ operation: "kick", cause: error }),
        }).pipe(
          Effect.catchTag("SpamDetectionError", (e) =>
            logEffect("warn", "SpamResponse", "Failed to kick spammer", {
              error: String(e.cause),
            }),
          ),
        );

        yield* Effect.tryPromise({
          try: () =>
            logMessage.reply({
              content: `Automatically kicked <@${userId}> for spam`,
              allowedMentions: {},
            }),
          catch: (error) =>
            new SpamDetectionError({ operation: "kickReply", cause: error }),
        }).pipe(Effect.catchAll(() => Effect.void));

        featureStats.spamKicked(guildId, userId, warnings);
      }
    }

    featureStats.spamDetected(
      guildId,
      userId,
      message.channelId,
      verdict.tier,
      verdict.totalScore,
    );
  }).pipe(Effect.withSpan("SpamResponse.executeResponse"));

/** Log a spam report to the mod thread */
const logSpamReport = (message: Message, verdict: SpamVerdict) =>
  Effect.gen(function* () {
    const extra = `Score ${verdict.totalScore} (${verdict.tier}): ${verdict.summary}`;

    const result = yield* logUserMessage({
      reason: ReportReasons.spam,
      message,
      staff: client.user ?? false,
      extra,
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* logEffect(
            "error",
            "SpamResponse",
            "Failed to log spam report",
            {
              error: String(error),
            },
          );
          return null;
        }),
      ),
    );

    return result;
  }).pipe(Effect.withSpan("SpamResponse.logSpamReport"));

/** Execute a softban (ban + unban) for honeypot triggers */
const executeSoftban = (
  message: Message,
  member: GuildMember,
  verdict: SpamVerdict,
) =>
  Effect.gen(function* () {
    const guild = message.guild!;

    yield* Effect.tryPromise({
      try: async () => {
        await member.ban({
          reason: "honeypot spam detected",
          deleteMessageSeconds: 604800, // 7 days
        });
        await guild.members.unban(member);
      },
      catch: (error) =>
        new SpamDetectionError({ operation: "softban", cause: error }),
    }).pipe(
      Effect.catchTag("SpamDetectionError", (e) =>
        logEffect("error", "SpamResponse", "Failed to softban user", {
          error: String(e.cause),
          userId: member.id,
          guildId: guild.id,
        }),
      ),
    );

    yield* logSpamReport(message, verdict);

    featureStats.honeypotTriggered(guild.id, member.id, message.channelId);
  }).pipe(Effect.withSpan("SpamResponse.executeSoftban"));
