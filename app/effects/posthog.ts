import type { Collection, Guild } from "discord.js";
import { Context, Effect, Layer } from "effect";
import { PostHog } from "posthog-node";

import { posthogApiKey, posthogHost } from "#~/helpers/env.server";
import { log } from "#~/helpers/observability";
import { SubscriptionService } from "#~/models/subscriptions.server";

export class PostHogService extends Context.Tag("PostHogService")<
  PostHogService,
  PostHog | null
>() {}

export const PostHogServiceLive = Layer.scoped(
  PostHogService,
  Effect.acquireRelease(
    Effect.sync(() => {
      if (!posthogApiKey) {
        log(
          "info",
          "PostHogService",
          "No PostHog API key configured, metrics disabled",
        );
        return null;
      }
      const client = new PostHog(posthogApiKey, {
        host: posthogHost || "https://us.i.posthog.com",
        flushAt: 20,
        flushInterval: 10000,
      });
      log("info", "PostHogService", "PostHog client initialized");
      return client;
    }),
    (client) =>
      Effect.promise(async () => {
        if (client) {
          await client.shutdown();
          log("info", "PostHogService", "PostHog client shut down");
        }
      }),
  ),
);

export const initializeGroups = (guilds: Collection<string, Guild>) =>
  Effect.gen(function* () {
    const posthog = yield* PostHogService;
    if (!posthog) return;

    const subscriptions = yield* Effect.tryPromise(() =>
      SubscriptionService.getAllSubscriptions(),
    );
    const subByGuild = new Map(subscriptions.map((s) => [s.guild_id, s]));

    for (const [guildId, guild] of guilds) {
      const sub = subByGuild.get(guildId);
      posthog.groupIdentify({
        groupType: "guild",
        groupKey: guildId,
        properties: {
          id: guild.id,
          name: guild.name,
          member_count: guild.memberCount,
          subscription_tier: sub?.product_tier ?? "free",
          subscription_status: sub?.status ?? "none",
        },
      });
    }

    log(
      "info",
      "PostHogService",
      `Initialized ${guilds.size} guild groups in PostHog`,
    );
  });
