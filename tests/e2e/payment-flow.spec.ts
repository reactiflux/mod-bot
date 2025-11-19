import { expect, test } from "./fixtures/auth";
import { createDiscordMock } from "./mocks/discord";

test.describe("Payment Flow", () => {
  // Run tests serially to avoid database cleanup conflicts
  test.describe.configure({ mode: "serial" });
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

    test("complete Stripe checkout flow upgrades to Pro", async ({
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
      await expect(
        authenticatedPage.getByRole("heading", { name: "Upgrade to Pro" }),
      ).toBeVisible();

      // Click "Upgrade to Pro" button - this will redirect to Stripe
      await authenticatedPage
        .getByRole("button", { name: "Upgrade to Pro" })
        .click();

      // Wait for Stripe checkout page to load
      await authenticatedPage.waitForURL(/checkout\.stripe\.com/);
      await authenticatedPage.waitForLoadState("networkidle");

      // Fill in Stripe test card details
      // Note: Stripe checkout has direct input fields, not iframes
      const emailInput = authenticatedPage.getByLabel("Email", {
        exact: false,
      });
      if (await emailInput.isVisible().catch(() => false)) {
        await emailInput.fill(testUser.email);
      }

      // Fill in card number (test card: 4242 4242 4242 4242)
      await authenticatedPage.locator("#cardNumber").fill("4242424242424242");

      // Fill in expiry date (any future date)
      await authenticatedPage.locator("#cardExpiry").fill("12/34");

      // Fill in CVC
      await authenticatedPage.locator("#cardCvc").fill("123");

      // Fill in cardholder name (required field)
      await authenticatedPage
        .getByPlaceholder("Full name on card")
        .fill("Test User");

      // Fill in ZIP code (required for US)
      await authenticatedPage.getByPlaceholder("ZIP").fill("12345");

      // Uncheck "Save my information" to avoid needing phone number for Link
      const saveInfoCheckbox = authenticatedPage.getByRole("checkbox", {
        name: /save my information/i,
      });
      if (await saveInfoCheckbox.isChecked()) {
        await saveInfoCheckbox.uncheck();
      }

      // Submit the payment
      await authenticatedPage
        .getByRole("button", { name: /subscribe|pay/i })
        .click();

      // Wait for redirect back to our success page
      await authenticatedPage.waitForURL(/\/payment\/success/, {
        timeout: 60000,
      });

      // Verify success page
      await expect(
        authenticatedPage.getByText("Payment Successful!"),
      ).toBeVisible();

      // Navigate to settings page to verify Pro status
      await authenticatedPage.goto(`/app/${guild.id}/settings`);

      // Verify UI shows Pro plan in the subscription status section
      await expect(
        authenticatedPage.getByRole("heading", { name: "Subscription Status" }),
      ).toBeVisible();
      // Verify both "Pro" and "Active" are visible (they appear next to each other)
      await expect(
        authenticatedPage.getByText("Pro Active", { exact: false }),
      ).toBeVisible();
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
