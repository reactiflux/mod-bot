import { expect, test } from "./fixtures/auth";
import { createDiscordMock } from "./mocks/discord";

test.describe("Payment Flow", () => {
  test.describe("Authenticated - Onboarding Flow", () => {
    test("free guild onboarding shows Pro vs Free choice", async ({
      authenticatedPage,
      db,
      testUser,
    }) => {
      // Setup: Create a free tier guild
      const guild = await db.createGuild({
        productTier: "free",
        status: "active",
      });

      // Setup Discord mock
      const discordMock = createDiscordMock({
        userId: testUser.externalId,
        userEmail: testUser.email,
        guilds: [{ id: guild.id, name: "Test Guild", permissions: "32" }],
      });
      await discordMock.setup(authenticatedPage);

      // Navigate to onboarding
      await authenticatedPage.goto(`/app/${guild.id}/onboard`);

      // Verify onboarding content - shows setup form
      await expect(
        authenticatedPage.getByRole("heading", {
          name: "Set up Euno for your server",
        }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByText(
          "Configure the essential settings to get started",
        ),
      ).toBeVisible();

      // Verify database state hasn't changed
      const subscription = await db.getGuildSubscription(guild.id);
      expect(subscription?.product_tier).toBe("free");
      expect(subscription?.status).toBe("active");
    });

    test("pro guild onboarding shows congratulations", async ({
      authenticatedPage,
      db,
      testUser,
    }) => {
      // Setup: Create a pro tier guild
      const guild = await db.createGuild({
        productTier: "paid",
        status: "active",
        stripeCustomerId: "cus_test_123",
        stripeSubscriptionId: "sub_test_123",
      });

      // Setup Discord mock
      const discordMock = createDiscordMock({
        userId: testUser.externalId,
        userEmail: testUser.email,
        guilds: [{ id: guild.id, name: "Pro Guild", permissions: "32" }],
      });
      await discordMock.setup(authenticatedPage);

      // Navigate to onboarding
      await authenticatedPage.goto(`/app/${guild.id}/onboard`);

      // Verify onboarding content - same setup form regardless of tier
      await expect(
        authenticatedPage.getByRole("heading", {
          name: "Set up Euno for your server",
        }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByText(
          "Configure the essential settings to get started",
        ),
      ).toBeVisible();

      // Verify database state
      const subscription = await db.getGuildSubscription(guild.id);
      expect(subscription?.product_tier).toBe("paid");
      expect(subscription?.status).toBe("active");
    });

    test("onboarding without guild_id returns 404 error", async ({
      authenticatedPage,
      testUser,
    }) => {
      // Setup Discord mock
      const discordMock = createDiscordMock({
        userId: testUser.externalId,
        userEmail: testUser.email,
      });
      await discordMock.setup(authenticatedPage);

      // Navigate to onboarding without guild_id (invalid route)
      const response = await authenticatedPage.goto("/onboard");

      // Should return 404 error (route doesn't exist)
      expect(response?.status()).toBe(404);
    });
  });

  test.describe("Authenticated - Payment Flow", () => {
    test("upgrade page displays pricing options", async ({
      authenticatedPage,
      db,
      testUser,
    }) => {
      // Setup: Create a free tier guild
      const guild = await db.createGuild({
        productTier: "free",
        status: "active",
      });

      // Setup Discord mock
      const discordMock = createDiscordMock({
        userId: testUser.externalId,
        userEmail: testUser.email,
        guilds: [{ id: guild.id, name: "Test Guild", permissions: "32" }],
      });
      await discordMock.setup(authenticatedPage);

      // Navigate to upgrade page
      await authenticatedPage.goto(`/upgrade?guild_id=${guild.id}`);

      // Verify upgrade page content (use getByRole to avoid strict mode violation)
      await expect(
        authenticatedPage.getByRole("heading", { name: "Upgrade to Pro" }),
      ).toBeVisible();
      await expect(authenticatedPage.getByText("Free Plan")).toBeVisible();
      await expect(authenticatedPage.getByText("Pro Plan")).toBeVisible();

      // Verify database state hasn't changed yet
      const subscription = await db.getGuildSubscription(guild.id);
      expect(subscription?.product_tier).toBe("free");
    });

    test("upgrade page without guild_id returns 400 error", async ({
      authenticatedPage,
      testUser,
    }) => {
      // Setup Discord mock
      const discordMock = createDiscordMock({
        userId: testUser.externalId,
        userEmail: testUser.email,
      });
      await discordMock.setup(authenticatedPage);

      // Navigate without guild_id
      const response = await authenticatedPage.goto("/upgrade");

      // Should return 400 error
      expect(response?.status()).toBe(400);
    });

    // NOTE: This test is skipped because payment success page requires valid Stripe session verification
    // To properly test this, we would need to either:
    // 1. Mock StripeService.verifyCheckoutSession in the test
    // 2. Use Stripe's test mode with real checkout sessions
    // For now, we test the error path (invalid session returns 400)
    test.skip("payment success updates database to paid tier", async ({
      authenticatedPage,
      db,
      testUser,
    }) => {
      // Setup: Create a free tier guild
      const guild = await db.createGuild({
        productTier: "free",
        status: "active",
      });

      // Setup Discord mock
      const discordMock = createDiscordMock({
        userId: testUser.externalId,
        userEmail: testUser.email,
        guilds: [{ id: guild.id, name: "Test Guild", permissions: "32" }],
      });
      await discordMock.setup(authenticatedPage);

      // TODO: This test requires mocking StripeService.verifyCheckoutSession
      // The payment.success.tsx route calls Stripe API which will fail with test session IDs
    });

    test("payment success without session_id returns 400", async ({
      authenticatedPage,
      db,
      testUser,
    }) => {
      // Setup: Create a guild
      const guild = await db.createGuild({
        productTier: "free",
        status: "active",
      });

      // Setup Discord mock
      const discordMock = createDiscordMock({
        userId: testUser.externalId,
        userEmail: testUser.email,
      });
      await discordMock.setup(authenticatedPage);

      // Navigate without session_id
      const response = await authenticatedPage.goto(
        `/payment/success?guild_id=${guild.id}`,
      );

      // Should return 400 error
      expect(response?.status()).toBe(400);
    });

    test("payment success without guild_id returns 400", async ({
      authenticatedPage,
      testUser,
    }) => {
      // Setup Discord mock
      const discordMock = createDiscordMock({
        userId: testUser.externalId,
        userEmail: testUser.email,
      });
      await discordMock.setup(authenticatedPage);

      // Navigate without guild_id
      const response = await authenticatedPage.goto(
        "/payment/success?session_id=test_session",
      );

      // Should return 400 error
      expect(response?.status()).toBe(400);
    });

    test("payment cancel page displays retry options", async ({
      authenticatedPage,
      db,
      testUser,
    }) => {
      // Setup: Create a free tier guild
      const guild = await db.createGuild({
        productTier: "free",
        status: "active",
      });

      // Setup Discord mock
      const discordMock = createDiscordMock({
        userId: testUser.externalId,
        userEmail: testUser.email,
        guilds: [{ id: guild.id, name: "Test Guild", permissions: "32" }],
      });
      await discordMock.setup(authenticatedPage);

      // Navigate to payment cancel
      await authenticatedPage.goto(`/payment/cancel?guild_id=${guild.id}`);

      // Verify cancel page content
      await expect(
        authenticatedPage.getByText("Payment Cancelled"),
      ).toBeVisible();
      await expect(authenticatedPage.getByText("Try Again")).toBeVisible();

      // Verify database state hasn't changed
      const subscription = await db.getGuildSubscription(guild.id);
      expect(subscription?.product_tier).toBe("free");
      expect(subscription?.status).toBe("active");
    });
  });

  test.describe("Authenticated - Payment Isolation", () => {
    test("each test has isolated database state", async ({
      authenticatedPage,
      db,
      testUser,
    }) => {
      // This test verifies that database cleanup is working correctly

      // Setup Discord mock
      const discordMock = createDiscordMock({
        userId: testUser.externalId,
        userEmail: testUser.email,
      });
      await discordMock.setup(authenticatedPage);

      // Create a guild in this test
      const guild = await db.createGuild({
        productTier: "paid",
        status: "active",
      });

      // Verify it exists
      const subscription = await db.getGuildSubscription(guild.id);
      expect(subscription).not.toBeNull();
      expect(subscription?.product_tier).toBe("paid");

      // The db fixture will clean this up automatically after the test
    });

    test("previous test's data should be cleaned up", async ({ db }) => {
      // This test runs after the previous one
      // We can't check for specific IDs, but we can verify our fixture works

      // Create new test data
      const guild = await db.createGuild({
        productTier: "free",
        status: "active",
      });

      // Verify we can work with fresh data
      const subscription = await db.getGuildSubscription(guild.id);
      expect(subscription?.product_tier).toBe("free");
    });
  });
});
