import { Context, Effect, Layer } from "effect";
import { PostHog } from "posthog-node";

import { posthogApiKey, posthogHost } from "#~/helpers/env.server";
import { log } from "#~/helpers/observability";

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
