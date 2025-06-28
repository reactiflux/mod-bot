import db from "#~/db.server";
import type { GuildSubscriptions } from "#~/db";

export type ProductTier = "free" | "paid";

// Define feature sets per subscription tier
const SUBSCRIPTION_FEATURES = {
  free: [],
  paid: [], // Will be populated when we implement actual features
} as const;

export const SubscriptionService = {
  async getGuildSubscription(guildId: string): Promise<any> {
    const result = await db
      .selectFrom("guild_subscriptions")
      .selectAll()
      .where("guild_id", "=", guildId)
      .executeTakeFirst();
    return result || null;
  },

  async createOrUpdateSubscription(data: {
    guild_id: string;
    stripe_customer_id?: string;
    stripe_subscription_id?: string;
    product_tier: ProductTier;
    status?: string;
    current_period_end?: string;
  }): Promise<void> {
    await db
      .insertInto("guild_subscriptions")
      .values({
        guild_id: data.guild_id,
        stripe_customer_id: data.stripe_customer_id ?? null,
        stripe_subscription_id: data.stripe_subscription_id ?? null,
        product_tier: data.product_tier,
        status: data.status ?? "active",
        current_period_end: data.current_period_end ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .onConflict((oc: any) =>
        oc.column("guild_id").doUpdateSet({
          stripe_customer_id: data.stripe_customer_id ?? null,
          stripe_subscription_id: data.stripe_subscription_id ?? null,
          product_tier: data.product_tier,
          status: data.status ?? "active",
          current_period_end: data.current_period_end ?? null,
          updated_at: new Date().toISOString(),
        }),
      )
      .execute();
  },

  async updateSubscriptionStatus(
    guildId: string,
    status: string,
    currentPeriodEnd?: string,
  ): Promise<void> {
    await db
      .updateTable("guild_subscriptions")
      .set({
        status,
        current_period_end: currentPeriodEnd ?? null,
        updated_at: new Date().toISOString(),
      })
      .where("guild_id", "=", guildId)
      .execute();
  },

  async getProductTier(guildId: string): Promise<ProductTier> {
    const subscription = await this.getGuildSubscription(guildId);
    
    // If no subscription exists, default to free
    if (!subscription) {
      return "free";
    }

    // If subscription is not active, downgrade to free
    if (subscription.status !== "active") {
      return "free";
    }

    // If subscription is past due, check if grace period has expired
    if (
      subscription.current_period_end &&
      new Date() > new Date(subscription.current_period_end)
    ) {
      return "free";
    }

    // Type assertion since we control the values
    return subscription.product_tier as unknown as ProductTier;
  },

  async hasFeature(guildId: string, feature: string): Promise<boolean> {
    const tier = await this.getProductTier(guildId);
    // For now, return false since we haven't defined features yet
    return false;
  },

  // Initialize free tier for new guilds
  async initializeFreeSubscription(guildId: string): Promise<void> {
    const existing = await this.getGuildSubscription(guildId);
    if (!existing) {
      await this.createOrUpdateSubscription({
        guild_id: guildId,
        product_tier: "free",
      });
    }
  },
};