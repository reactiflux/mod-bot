/**
 * Graduated response execution for spam verdicts.
 * Effect-based — performs Discord API calls and DB writes.
 */

import type { GuildMember, Message } from "discord.js";
import { Effect } from "effect";

import { logUserMessage } from "#~/commands/report/userLog.ts";
import { client } from "#~/discord/client.server.ts";
import { deleteMessage } from "#~/effects/discordSdk.ts";
import { logEffect } from "#~/effects/observability.ts";
import { featureStats } from "#~/helpers/metrics.ts";
import { applyRestriction, timeout } from "#~/models/discord.server.ts";
import {
  getSpamReportCount,
  markMessageAsDeleted,
  ReportReasons,
} from "#~/models/reportedMessages.ts";

import { AUTO_KICK_THRESHOLD, type SpamVerdict } from "./spamScorer.ts";

/**
 * Tracks users that have already been auto-kicked this session.
 * Keyed by `${guildId}:${userId}`. Prevents duplicate kicks when multiple
 * spam messages are processed concurrently before the first kick completes.
 * Exported so the event listener can skip further processing for kicked users.
 */
export const kickedUsers = new Set<string>();

/** Execute the graduated response for a spam verdict. */
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
      Effect.tap(() => markMessageAsDeleted(message.id, guildId)),
      Effect.catchTag("DiscordApiError", (e) =>
        logEffect("warn", "SpamResponse", "Failed to delete spam message", {
          error: String(e.cause),
        }),
      ),
    );

    if (verdict.tier === "medium") {
      // Apply restricted role
      yield* Effect.tryPromise(() => applyRestriction(member)).pipe(
        Effect.catchAll((error) =>
          logEffect("warn", "SpamResponse", "Failed to apply restriction", {
            error: String(error),
          }),
        ),
      );
      featureStats.spamRestricted(guildId, userId, message.channelId);
    }

    if (verdict.tier === "high") {
      // Timeout user
      yield* Effect.tryPromise(() =>
        timeout(member, "Automated spam detection"),
      ).pipe(
        Effect.catchAll((error) =>
          logEffect("warn", "SpamResponse", "Failed to timeout user", {
            error: String(error),
          }),
        ),
      );
      featureStats.spamTimedOut(guildId, userId, message.channelId);
    }

    // Log to mod thread for all medium/high tiers
    const logResult = yield* logSpamReport(message, verdict);

    // Check for auto-kick on high tier (spam reports only)
    if (verdict.tier === "high" && logResult) {
      const kickKey = `${guildId}:${userId}`;
      // Guard against duplicate kicks when concurrent pipelines all reach this
      // point before any single kick resolves. The Set check-and-set is
      // synchronous, so it is atomic in Node's single-threaded event loop.
      if (!kickedUsers.has(kickKey)) {
        kickedUsers.add(kickKey);
        const { message: logMessage } = logResult;
        const spamCount = yield* getSpamReportCount(userId, guildId);
        if (spamCount >= AUTO_KICK_THRESHOLD) {
          yield* Effect.tryPromise(() =>
            member.kick("Autokicked for repeated spam"),
          ).pipe(
            Effect.catchAll((error) =>
              logEffect("warn", "SpamResponse", "Failed to kick spammer", {
                error: String(error),
              }),
            ),
          );

          yield* Effect.tryPromise(() =>
            logMessage.reply({
              content: `Automatically kicked <@${userId}> for spam`,
              allowedMentions: {},
            }),
          ).pipe(Effect.catchAll(() => Effect.void));

          featureStats.spamKicked(guildId, userId, spamCount);
        }
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

    yield* Effect.tryPromise(async () => {
      await member.ban({
        reason: "honeypot spam detected",
        deleteMessageSeconds: 604800, // 7 days
      });
      await guild.members.unban(member);
    }).pipe(
      Effect.catchAll((error) =>
        logEffect("error", "SpamResponse", "Failed to softban user", {
          error: String(error),
          userId: member.id,
          guildId: guild.id,
        }),
      ),
    );

    yield* logSpamReport(message, verdict);

    featureStats.honeypotTriggered(guild.id, member.id, message.channelId);
  }).pipe(Effect.withSpan("SpamResponse.executeSoftban"));
