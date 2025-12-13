/**
 * Seed script for e2e tests in staging environments.
 * Creates deterministic test data that e2e tests can reference.
 *
 * Run via: npm run seed:e2e
 * Called automatically in staging via: npm run start:staging
 */

import db from "#~/db.server";

// Known test data IDs - tests reference these directly
export const TEST_USER_ID = "test-user-e2e";
export const TEST_USER_EXTERNAL_ID = "discord_test_e2e";
export const TEST_SESSION_ID = "test-session-e2e";
export const TEST_GUILD_FREE_ID = "test-guild-free";
export const TEST_GUILD_PAID_ID = "test-guild-paid";

async function seed() {
  console.log("Seeding e2e test data...");

  // Create test user
  await db
    .insertInto("users")
    .values({
      id: TEST_USER_ID,
      externalId: TEST_USER_EXTERNAL_ID,
      email: "e2e-test@example.com",
      authProvider: "discord",
    })
    .onConflict((oc) => oc.doNothing())
    .execute();

  // Create session for test user
  await db
    .insertInto("sessions")
    .values({
      id: TEST_SESSION_ID,
      data: JSON.stringify({
        userId: TEST_USER_ID,
        discordToken: {
          access_token: "test_access_token",
          token_type: "Bearer",
          expires_at: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          scope: "identify email guilds guilds.members.read",
        },
      }),
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .onConflict((oc) => oc.doNothing())
    .execute();

  // Create free guild with subscription
  await db
    .insertInto("guilds")
    .values({ id: TEST_GUILD_FREE_ID, settings: null })
    .onConflict((oc) => oc.doNothing())
    .execute();

  await db
    .insertInto("guild_subscriptions")
    .values({
      guild_id: TEST_GUILD_FREE_ID,
      product_tier: "free",
      status: "active",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      current_period_end: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .onConflict((oc) => oc.doNothing())
    .execute();

  // Create paid guild with subscription
  await db
    .insertInto("guilds")
    .values({ id: TEST_GUILD_PAID_ID, settings: null })
    .onConflict((oc) => oc.doNothing())
    .execute();

  await db
    .insertInto("guild_subscriptions")
    .values({
      guild_id: TEST_GUILD_PAID_ID,
      product_tier: "paid",
      status: "active",
      stripe_customer_id: "cus_test_e2e",
      stripe_subscription_id: "sub_test_e2e",
      current_period_end: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .onConflict((oc) => oc.doNothing())
    .execute();

  console.log("E2E test data seeded successfully.");
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to seed e2e data:", error);
    process.exit(1);
  });
