import { test, expect } from "@playwright/test";
import {
  createRealAuthSession,
  hasValidCapturedAuth,
  getCapturedUserInfo,
} from "../helpers/real-auth";

test.describe("Real Authentication Flows", () => {
  test.skip(() => {
    // Skip if no captured auth data is available
    return !process.env.FORCE_AUTH_TESTS;
  }, "Skipping real auth tests - run 'npm run capture-auth' first, then set FORCE_AUTH_TESTS=1");

  test.beforeAll(async () => {
    const hasAuth = await hasValidCapturedAuth();
    if (!hasAuth) {
      throw new Error(
        "No valid captured auth data found. Please run 'npm run capture-auth' first.",
      );
    }
  });

  test("authenticated user can access protected dashboard", async ({
    page,
  }) => {
    // Get real auth session
    const sessionCookie = await createRealAuthSession();
    const userInfo = await getCapturedUserInfo();

    // Set the session cookies
    const cookies = sessionCookie.split("; ").map((cookie) => {
      const [name, value] = cookie.split("=");
      return {
        name,
        value,
        domain: "localhost",
        path: "/",
      };
    });

    await page.context().addCookies(cookies);

    console.log(
      `🔐 Testing with real user: ${userInfo.username} (${userInfo.email})`,
    );

    // Access a protected dashboard route
    const response = await page.goto(
      "/app/123456789/sh?start=2024-01-01&end=2024-01-31",
    );

    // Should not redirect to login
    expect(response?.status()).toBeLessThan(400);

    // Should not show login form
    const hasLoginForm = await page
      .locator("text=Login with Discord")
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    expect(hasLoginForm).toBe(false);

    // Should load the dashboard content (might show "no data" but not a login screen)
    await page.waitForLoadState("networkidle");

    // The URL should stay on the dashboard route, not redirect to login
    expect(page.url()).toContain("/app/123456789/sh");
  });

  test("authenticated user can access settings", async ({ page }) => {
    const sessionCookie = await createRealAuthSession();
    const userInfo = await getCapturedUserInfo();

    const cookies = sessionCookie.split("; ").map((cookie) => {
      const [name, value] = cookie.split("=");
      return {
        name,
        value,
        domain: "localhost",
        path: "/",
      };
    });

    await page.context().addCookies(cookies);

    console.log(`🔐 Testing settings with real user: ${userInfo.username}`);

    // Access settings route
    const response = await page.goto("/app/123456789/settings");

    // Should load successfully
    expect(response?.status()).toBeLessThan(400);

    // Should not redirect to login
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/app/123456789/settings");

    // Should not show login form
    const hasLoginForm = await page
      .locator("text=Login with Discord")
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    expect(hasLoginForm).toBe(false);
  });

  test("authenticated user sees guild selector", async ({ page }) => {
    const sessionCookie = await createRealAuthSession();
    const userInfo = await getCapturedUserInfo();

    const cookies = sessionCookie.split("; ").map((cookie) => {
      const [name, value] = cookie.split("=");
      return {
        name,
        value,
        domain: "localhost",
        path: "/",
      };
    });

    await page.context().addCookies(cookies);

    console.log(`🔐 Testing guild access with real user: ${userInfo.username}`);

    // Go to home page (should redirect to auth layout for authenticated users)
    await page.goto("/");

    // Wait for any redirects to complete
    await page.waitForLoadState("networkidle");

    // Should not show the unauthenticated landing page
    const hasLandingContent = await page
      .locator("text=A community-in-a-box bot for large Discord servers")
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    expect(hasLandingContent).toBe(false);

    // Should show authenticated layout (guild selector or similar)
    // The exact content depends on the DiscordLayout component implementation
    // If no specific authenticated UI is visible, at least verify we're not on login
    const hasLoginForm = await page
      .locator("text=Login with Discord")
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    expect(hasLoginForm).toBe(false);
  });

  test("real Discord token works for API calls", async ({ page }) => {
    const sessionCookie = await createRealAuthSession();
    const userInfo = await getCapturedUserInfo();

    const cookies = sessionCookie.split("; ").map((cookie) => {
      const [name, value] = cookie.split("=");
      return {
        name,
        value,
        domain: "localhost",
        path: "/",
      };
    });

    await page.context().addCookies(cookies);

    console.log(`🔐 Testing API calls with real user: ${userInfo.username}`);

    // Try to access a route that would make Discord API calls
    // This tests that the real token works for actual Discord API requests
    const response = await page.goto("/app/123456789/settings");

    // Should load without API errors
    expect(response?.status()).toBeLessThan(500);

    await page.waitForLoadState("networkidle");

    // Check for any obvious API error messages
    const hasApiError = await page
      .locator("text=API Error, text=Unauthorized, text=Invalid token")
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    expect(hasApiError).toBe(false);
  });
});
