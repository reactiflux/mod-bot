import { randomUUID } from "crypto";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";

import type { DB } from "#~/db";

// Check if we're running against a remote preview
const isRemote = !!process.env.E2E_PREVIEW_URL;

// Seeded test data IDs - must match scripts/seed-e2e.ts
export const SEEDED_DATA = {
  user: {
    id: "test-user-e2e",
    externalId: "discord_test_e2e",
    email: "e2e-test@example.com",
  },
  sessionId: "test-session-e2e",
  freeGuild: {
    id: "test-guild-free",
    subscription: {
      product_tier: "free" as const,
      status: "active",
    },
  },
  paidGuild: {
    id: "test-guild-paid",
    subscription: {
      product_tier: "paid" as const,
      status: "active",
      stripe_customer_id: "cus_test_e2e",
      stripe_subscription_id: "sub_test_e2e",
    },
  },
};

const DATABASE_URL = process.env.DATABASE_URL ?? "./mod-bot.sqlite3";

// Only create local db connection if not in remote mode
const testDialect = isRemote
  ? null
  : new SqliteDialect({
      database: new SQLite(DATABASE_URL),
    });

const testDb = isRemote
  ? null
  : new Kysely<DB>({
      dialect: testDialect!,
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
 * Cleanup deletes ALL data from tables to ensure clean state
 */
export class DbFixture {
  /**
   * Create a test guild with optional subscription
   * In remote mode, returns pre-seeded guild data
   */
  async createGuild(options?: {
    id?: string;
    productTier?: "free" | "paid";
    status?: string;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    currentPeriodEnd?: string;
  }): Promise<TestGuild> {
    // In remote mode, return pre-seeded guild
    if (isRemote) {
      const seededGuild =
        options?.productTier === "paid"
          ? SEEDED_DATA.paidGuild
          : SEEDED_DATA.freeGuild;
      return {
        id: seededGuild.id,
        subscription: seededGuild.subscription,
      };
    }

    const guildId = options?.id ?? randomUUID();

    // Create guild record
    await testDb!
      .insertInto("guilds")
      .values({
        id: guildId,
        settings: null,
      })
      .execute();

    // Create subscription if tier is provided
    if (options?.productTier) {
      await testDb!
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
   * In remote mode, returns pre-seeded user data
   */
  async createUser(options?: {
    id?: string;
    externalId?: string;
    email?: string;
  }): Promise<TestUser> {
    // In remote mode, return pre-seeded user
    if (isRemote) {
      return SEEDED_DATA.user;
    }

    const userId = options?.id ?? randomUUID();
    const externalId = options?.externalId ?? `discord_${randomUUID()}`;
    const email = options?.email ?? `test_${randomUUID()}@example.com`;

    await testDb!
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
   * In remote mode, returns pre-seeded session ID
   */
  async createSession(
    userId: string,
    discordToken?: Record<string, unknown>,
  ): Promise<string> {
    // In remote mode, return pre-seeded session
    if (isRemote) {
      return SEEDED_DATA.sessionId;
    }

    const sessionId = randomUUID();

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

    await testDb!
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
   * In remote mode, returns seeded subscription data
   */
  async getGuildSubscription(guildId: string) {
    if (isRemote) {
      // Return seeded data based on guild ID
      if (guildId === SEEDED_DATA.freeGuild.id) {
        return {
          guild_id: guildId,
          ...SEEDED_DATA.freeGuild.subscription,
        };
      }
      if (guildId === SEEDED_DATA.paidGuild.id) {
        return {
          guild_id: guildId,
          ...SEEDED_DATA.paidGuild.subscription,
        };
      }
      return undefined;
    }

    return await testDb!
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
   * Get database instance for custom queries
   * Returns null in remote mode
   */
  getDb() {
    return testDb;
  }
}

export { isRemote };
