import { randomUUID } from "crypto";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";

import type { DB } from "#~/db";

const DB_FILE = process.env.DB_FILE ?? "./mod-bot.sqlite3";

// Create a separate db instance for tests
const testDialect = new SqliteDialect({
  database: new SQLite(DB_FILE),
});

const testDb = new Kysely<DB>({
  dialect: testDialect,
});

export interface TestGuild {
  id: string;
  subscription?: {
    product_tier: "free" | "paid";
    status: string;
    stripe_customer_id?: string;
    stripe_subscription_id?: string;
    current_period_end?: string;
  };
}

export interface TestUser {
  id: string;
  externalId: string;
  email: string;
}

/**
 * Database fixture for E2E tests
 * Provides helpers for creating and cleaning up test data
 */
export class DbFixture {
  private createdGuildIds: string[] = [];
  private createdUserIds: string[] = [];
  private createdSessionIds: string[] = [];

  /**
   * Create a test guild with optional subscription
   */
  async createGuild(options?: {
    id?: string;
    productTier?: "free" | "paid";
    status?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    currentPeriodEnd?: string;
  }): Promise<TestGuild> {
    const guildId = options?.id ?? randomUUID();
    this.createdGuildIds.push(guildId);

    // Create guild record
    await testDb
      .insertInto("guilds")
      .values({
        id: guildId,
        settings: null,
      })
      .execute();

    // Create subscription if tier is provided
    if (options?.productTier) {
      await testDb
        .insertInto("guild_subscriptions")
        .values({
          guild_id: guildId,
          product_tier: options.productTier,
          status: options.status ?? "active",
          stripe_customer_id: options.stripeCustomerId ?? null,
          stripe_subscription_id: options.stripeSubscriptionId ?? null,
          current_period_end: options.currentPeriodEnd ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .execute();
    }

    return {
      id: guildId,
      subscription: options?.productTier
        ? {
            product_tier: options.productTier,
            status: options.status ?? "active",
            stripe_customer_id: options.stripeCustomerId,
            stripe_subscription_id: options.stripeSubscriptionId,
            current_period_end: options.currentPeriodEnd,
          }
        : undefined,
    };
  }

  /**
   * Create a test user
   */
  async createUser(options?: {
    id?: string;
    externalId?: string;
    email?: string;
  }): Promise<TestUser> {
    const userId = options?.id ?? randomUUID();
    const externalId = options?.externalId ?? `discord_${randomUUID()}`;
    const email = options?.email ?? `test_${randomUUID()}@example.com`;

    this.createdUserIds.push(userId);

    await testDb
      .insertInto("users")
      .values({
        id: userId,
        externalId,
        email,
        authProvider: "discord",
      })
      .execute();

    return { id: userId, externalId, email };
  }

  /**
   * Create a test session for a user
   */
  async createSession(
    userId: string,
    discordToken?: Record<string, unknown>,
  ): Promise<string> {
    const sessionId = randomUUID();
    this.createdSessionIds.push(sessionId);

    const sessionData = {
      userId,
      discordToken: discordToken ?? {
        access_token: "test_access_token",
        token_type: "Bearer",
        expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        scope: "identify email guilds guilds.members.read",
      },
    };

    await testDb
      .insertInto("sessions")
      .values({
        id: sessionId,
        data: JSON.stringify(sessionData),
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .execute();

    return sessionId;
  }

  /**
   * Get subscription for a guild
   */
  async getGuildSubscription(guildId: string) {
    return await testDb
      .selectFrom("guild_subscriptions")
      .selectAll()
      .where("guild_id", "=", guildId)
      .executeTakeFirst();
  }

  /**
   * Verify subscription state
   */
  async verifySubscription(
    guildId: string,
    expected: {
      product_tier?: string;
      status?: string;
      stripe_customer_id?: string | null;
      stripe_subscription_id?: string | null;
    },
  ): Promise<boolean> {
    const subscription = await this.getGuildSubscription(guildId);

    if (!subscription) return false;

    if (
      expected.product_tier &&
      subscription.product_tier !== expected.product_tier
    ) {
      return false;
    }
    if (expected.status && subscription.status !== expected.status) {
      return false;
    }
    if (
      expected.stripe_customer_id !== undefined &&
      subscription.stripe_customer_id !== expected.stripe_customer_id
    ) {
      return false;
    }
    if (
      expected.stripe_subscription_id !== undefined &&
      subscription.stripe_subscription_id !== expected.stripe_subscription_id
    ) {
      return false;
    }

    return true;
  }

  /**
   * Clean up all created test data
   */
  async cleanup(): Promise<void> {
    // Delete in reverse dependency order
    await Promise.all([
      // Clean up sessions
      ...this.createdSessionIds.map((id) =>
        testDb.deleteFrom("sessions").where("id", "=", id).execute(),
      ),
      // Clean up subscriptions
      ...this.createdGuildIds.map((id) =>
        testDb
          .deleteFrom("guild_subscriptions")
          .where("guild_id", "=", id)
          .execute(),
      ),
    ]);

    // Then clean up guilds and users
    await Promise.all([
      ...this.createdGuildIds.map((id) =>
        testDb.deleteFrom("guilds").where("id", "=", id).execute(),
      ),
      ...this.createdUserIds.map((id) =>
        testDb.deleteFrom("users").where("id", "=", id).execute(),
      ),
    ]);

    // Reset tracking arrays
    this.createdGuildIds = [];
    this.createdUserIds = [];
    this.createdSessionIds = [];
  }

  /**
   * Get database instance for custom queries
   */
  getDb() {
    return testDb;
  }
}
