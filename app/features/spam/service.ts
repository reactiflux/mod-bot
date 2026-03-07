/**
 * SpamDetectionService — wires analyzers, tracker, and honeypot cache together.
 * This is the Effect-based service that orchestrates the spam detection pipeline.
 */

import type { GuildMember, Message } from "discord.js";
import { Context, Effect, Layer } from "effect";

import { DatabaseService } from "#~/Database.ts";
import { logEffect } from "#~/effects/observability.ts";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server.ts";

import { analyzeBehavior } from "./behaviorAnalyzer.ts";
import { analyzeContent } from "./contentAnalyzer.ts";
import {
  cleanupTracker,
  getRecentMessages,
  recordMessage,
  type ActivityMap,
} from "./recentActivityTracker.ts";
import { executeResponse } from "./spamResponseHandler.ts";
import {
  computeVerdict,
  type SpamSignal,
  type SpamVerdict,
} from "./spamScorer.ts";
import { analyzeVelocity } from "./velocityAnalyzer.ts";

export interface ISpamDetectionService {
  readonly checkMessage: (
    message: Message,
    member: GuildMember,
  ) => Effect.Effect<SpamVerdict, never>;
  readonly executeResponse: (
    verdict: SpamVerdict,
    message: Message,
    member: GuildMember,
  ) => Effect.Effect<void, never>;
}

export class SpamDetectionService extends Context.Tag("SpamDetectionService")<
  SpamDetectionService,
  ISpamDetectionService
>() {}

// ── Honeypot cache ──

interface HoneypotCacheEntry {
  channels: Set<string>;
  cachedAt: number;
}

const HONEYPOT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const TRACKER_CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
const TRACKER_MAX_AGE = 30 * 60 * 1000; // 30 minutes

// ── Service implementation ──

export const SpamDetectionServiceLive = Layer.effect(
  SpamDetectionService,
  Effect.gen(function* () {
    const db = yield* DatabaseService;

    // In-memory state, lives for the bot's lifetime
    const tracker: ActivityMap = new Map();
    const honeypotCache = new Map<string, HoneypotCacheEntry>();

    // Periodic cleanup
    setInterval(
      () => cleanupTracker(tracker, TRACKER_MAX_AGE),
      TRACKER_CLEANUP_INTERVAL,
    );

    // ── Honeypot lookup ──

    const checkHoneypot = (
      guildId: string,
      channelId: string,
    ): Effect.Effect<SpamSignal[], never> =>
      Effect.gen(function* () {
        const cached = honeypotCache.get(guildId);
        if (cached && cached.cachedAt + HONEYPOT_CACHE_TTL > Date.now()) {
          if (cached.channels.has(channelId)) {
            return [
              {
                name: "honeypot_channel",
                score: 100,
                description: "Message in honeypot channel",
              },
            ];
          }
          return [];
        }

        // Refresh cache from DB
        const configs = yield* db
          .selectFrom("honeypot_config")
          .selectAll()
          .where("guild_id", "=", guildId)
          .pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* logEffect(
                  "warn",
                  "SpamDetection",
                  "Failed to fetch honeypot config",
                  { error },
                );
                return [] as { guild_id: string; channel_id: string }[];
              }),
            ),
          );

        const channels = new Set(configs.map((c) => c.channel_id));
        honeypotCache.set(guildId, { channels, cachedAt: Date.now() });

        if (channels.has(channelId)) {
          return [
            {
              name: "honeypot_channel",
              score: 100,
              description: "Message in honeypot channel",
            },
          ];
        }
        return [];
      }).pipe(Effect.withSpan("SpamDetection.checkHoneypot"));

    // ── Mod role check (for honeypot exemption) ──

    const isModeratorOrAdmin = (
      member: GuildMember,
      guildId: string,
    ): Effect.Effect<boolean, never> =>
      Effect.gen(function* () {
        if (member.permissions.has("Administrator")) return true;

        const settings = yield* Effect.tryPromise({
          try: () => fetchSettings(guildId, [SETTINGS.moderator]),
          catch: () => null,
        }).pipe(Effect.catchAll(() => Effect.succeed(null)));

        if (!settings?.moderator) return false;

        return Array.isArray(member.roles)
          ? member.roles.includes(settings.moderator)
          : member.roles.cache.has(settings.moderator);
      }).pipe(Effect.withSpan("SpamDetection.isModeratorOrAdmin"));

    return {
      checkMessage: (message, member) =>
        Effect.gen(function* () {
          const guildId = message.guild!.id;
          const userId = message.author.id;
          const content = message.content;
          const hasLink = content.includes("http");

          // Record in activity tracker
          const attachmentIds = Array.from(message.attachments.keys()).sort().join(",");
          const contentHash = attachmentIds
            ? `${content.toLowerCase().trim()}::attachments:${attachmentIds}`
            : content.toLowerCase().trim();
          recordMessage(tracker, guildId, userId, {
            messageId: message.id,
            channelId: message.channelId,
            contentHash,
            timestamp: Date.now(),
            hasLink,
          });

          // Check honeypot first (absolute signal)
          const honeypotSignals = yield* checkHoneypot(
            guildId,
            message.channelId,
          );
          if (honeypotSignals.length > 0) {
            // Check if moderator — mods are exempt from honeypot
            const isMod = yield* isModeratorOrAdmin(member, guildId);
            if (isMod) {
              yield* logEffect(
                "debug",
                "SpamDetection",
                "Mod posted in honeypot channel, no action taken",
              );
              return computeVerdict([]);
            }
            return computeVerdict(honeypotSignals);
          }

          // Run pure analyzers
          const contentSignals = analyzeContent(content);
          const behaviorSignals = analyzeBehavior(message, member);

          const recentMessages = getRecentMessages(tracker, guildId, userId);
          const velocitySignals = analyzeVelocity(recentMessages, contentHash);

          const allSignals = [
            ...contentSignals,
            ...behaviorSignals,
            ...velocitySignals,
          ];

          return computeVerdict(allSignals);
        }).pipe(
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* logEffect(
                "error",
                "SpamDetection",
                "Spam check failed, falling through",
                { error: String(error) },
              );
              // Spam detection failure should never block message processing
              return computeVerdict([]);
            }),
          ),
          Effect.withSpan("SpamDetection.checkMessage"),
        ),

      executeResponse: (verdict, message, member) =>
        executeResponse(verdict, message, member).pipe(
          Effect.provide(Layer.succeed(DatabaseService, db)),
          Effect.catchAll((error) =>
            logEffect("error", "SpamDetection", "Response execution failed", {
              error: String(error),
            }),
          ),
          Effect.withSpan("SpamDetection.executeResponse"),
        ),
    };
  }),
);
