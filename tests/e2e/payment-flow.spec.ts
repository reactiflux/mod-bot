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
  });
});
