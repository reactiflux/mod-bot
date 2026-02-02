import { Context, Effect, Layer, Schema, type ParseResult } from "effect";

import { DatabaseService } from "#~/Database";
import { FeatureDisabledError } from "#~/effects/errors";
import { logEffect } from "#~/effects/observability";
import { PostHogService } from "#~/effects/posthog";

export const TierFlag = Schema.Literal(
  "advanced_analytics",
  "premium_moderation",
);
export type TierFlag = typeof TierFlag.Type;

const PAID_FEATURES: ReadonlySet<TierFlag> = new Set(TierFlag.literals);

export interface IFeatureFlagService {
  /** Check any PostHog flag by name. Never fails — returns false on error. */
  readonly isPostHogEnabled: (
    flag: string,
    guildId: string,
  ) => Effect.Effect<boolean>;

  /** Multivariate value decoded through a Schema for type safety. */
  readonly getPostHogValue: <A, I>(
    flag: string,
    guildId: string,
    schema: Schema.Schema<A, I>,
  ) => Effect.Effect<A, ParseResult.ParseError>;

  /** Check tier-based entitlement. Never fails — returns false on error. */
  readonly isTierEnabled: (
    flag: TierFlag,
    guildId: string,
  ) => Effect.Effect<boolean>;

  /** Guard that fails with FeatureDisabledError if tier check fails. */
  readonly requireTierFeature: (
    flag: TierFlag,
    guildId: string,
  ) => Effect.Effect<void, FeatureDisabledError>;
}

export class FeatureFlagService extends Context.Tag("FeatureFlagService")<
  FeatureFlagService,
  IFeatureFlagService
>() {}

export const FeatureFlagServiceLive = Layer.scoped(
  FeatureFlagService,
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const posthog = yield* PostHogService;

    // Await initial PostHog flag load during layer construction — no startup race
    if (posthog) {
      yield* Effect.tryPromise(() => posthog.reloadFeatureFlags()).pipe(
        Effect.tapError((e) =>
          logEffect(
            "warn",
            "FeatureFlagService",
            "Initial PostHog flag load failed, flags will default to off",
            { error: String(e) },
          ),
        ),
        Effect.catchAll(() => Effect.void),
      );
    }

    // Periodic refresh with scope-managed cleanup
    if (posthog) {
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          setInterval(() => {
            posthog.reloadFeatureFlags().catch(() => {
              // Silently swallow — flags stay at their last known state
            });
          }, 30_000),
        ),
        (interval) => Effect.sync(() => clearInterval(interval)),
      );
    }

    const checkTier = (flag: TierFlag, guildId: string) =>
      Effect.gen(function* () {
        if (!PAID_FEATURES.has(flag)) return false;

        const [row] = yield* db
          .selectFrom("guild_subscriptions")
          .select(["product_tier", "status"])
          .where("guild_id", "=", guildId)
          .where("status", "=", "active");

        if (!row) return false;

        // For now, any active subscription grants all paid features.
        // Tier-specific gating can be added here later when multiple tiers exist.
        return true;
      }).pipe(
        Effect.catchAll((e) =>
          logEffect(
            "warn",
            "FeatureFlagService",
            "Tier check failed, defaulting to disabled",
            { flag, guildId, error: String(e) },
          ).pipe(Effect.map(() => false)),
        ),
        Effect.withSpan("FeatureFlagService.checkTier", {
          attributes: { flag, guildId },
        }),
      );

    return {
      isPostHogEnabled: (flag, guildId) => {
        if (!posthog) return Effect.succeed(false as boolean);
        return Effect.tryPromise(() =>
          posthog.isFeatureEnabled(flag, guildId, {
            onlyEvaluateLocally: true,
            sendFeatureFlagEvents: false,
          }),
        ).pipe(
          Effect.map((result) => result ?? false),
          Effect.catchAll(() => Effect.succeed(false as boolean)),
          Effect.withSpan("FeatureFlagService.isPostHogEnabled", {
            attributes: { flag, guildId },
          }),
        );
      },

      getPostHogValue: (flag, guildId, schema) =>
        Effect.gen(function* () {
          let raw: unknown = undefined;
          if (posthog) {
            const result = yield* Effect.tryPromise(() =>
              posthog.getFeatureFlag(flag, guildId, {
                onlyEvaluateLocally: true,
                sendFeatureFlagEvents: false,
              }),
            ).pipe(Effect.catchAll(() => Effect.succeed(undefined)));
            raw = result ?? undefined;
          }
          return yield* Schema.decodeUnknown(schema)(raw);
        }).pipe(
          Effect.withSpan("FeatureFlagService.getPostHogValueDecoded", {
            attributes: { flag, guildId },
          }),
        ),

      isTierEnabled: (flag: TierFlag, guildId: string) =>
        checkTier(flag, guildId),

      requireTierFeature: (flag, guildId) =>
        Effect.gen(function* () {
          const enabled = yield* checkTier(flag, guildId);
          if (!enabled) {
            return yield* Effect.fail(
              new FeatureDisabledError({
                feature: flag,
                guildId,
                reason: "tier_required",
              }),
            );
          }
        }).pipe(
          Effect.withSpan("FeatureFlagService.requireTierFeature", {
            attributes: { flag, guildId },
          }),
        ),
    };
  }),
);
