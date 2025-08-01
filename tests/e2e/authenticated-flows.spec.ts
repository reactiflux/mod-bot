import { test, expect } from "@playwright/test";
import { createTestUser, cleanupTestUsers } from "../helpers/auth";

test.describe("Authenticated User Flows", () => {
  let testUserEmail: string;

  test.beforeEach(async () => {
    // Generate unique email for each test to avoid conflicts
    testUserEmail = `test-${Date.now()}@example.com`;
  });

  test.afterEach(async () => {
    // Clean up test users after each test
    await cleanupTestUsers([testUserEmail]);
  });

  test("authenticated user redirects from home to auth layout", async ({
    page,
  }) => {
    // Create a test user and get session cookies
    const testUser = await createTestUser(testUserEmail);

    // Set the session cookies
    const cookies = testUser.sessionCookie.split("; ").map((cookie) => {
      const [name, value] = cookie.split("=");
      return {
        name,
        value,
        domain: "localhost",
        path: "/",
      };
    });

    await page.context().addCookies(cookies);

    // Visit the home page
    await page.goto("/");

    // Should redirect to authenticated area (not show landing page)
    // The exact redirect behavior depends on the auth layout implementation
    // We'll check that we don't see the unauthenticated landing page content
    const hasLandingContent = await page
      .locator("text=A community-in-a-box bot for large Discord servers")
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    expect(hasLandingContent).toBe(false);
  });

  test("authenticated user can access dashboard route", async ({ page }) => {
    const testUser = await createTestUser(testUserEmail);

    const cookies = testUser.sessionCookie.split("; ").map((cookie) => {
      const [name, value] = cookie.split("=");
      return {
        name,
        value,
        domain: "localhost",
        path: "/",
      };
    });

    await page.context().addCookies(cookies);

    // Try to access a dashboard route (using a fake guild ID)
    const response = await page.goto(
      "/app/123456789/sh?start=2024-01-01&end=2024-01-31",
    );

    // Should not redirect to login (status should be 200 or redirect to valid page)
    expect(response?.status()).toBeLessThan(400);

    // Should not show login form
    const hasLoginForm = await page
      .locator("text=Login with Discord")
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    expect(hasLoginForm).toBe(false);
  });

  test("authenticated user can access settings route", async ({ page }) => {
    const testUser = await createTestUser(testUserEmail);

    const cookies = testUser.sessionCookie.split("; ").map((cookie) => {
      const [name, value] = cookie.split("=");
      return {
        name,
        value,
        domain: "localhost",
        path: "/",
      };
    });

    await page.context().addCookies(cookies);

    // Try to access settings route
    const response = await page.goto("/app/123456789/settings");

    // Should load successfully
    expect(response?.status()).toBeLessThan(400);

    // Should not redirect to login
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/app/123456789/settings");
  });

  test("logout clears session and redirects to home", async ({ page }) => {
    const testUser = await createTestUser(testUserEmail);

    const cookies = testUser.sessionCookie.split("; ").map((cookie) => {
      const [name, value] = cookie.split("=");
      return {
        name,
        value,
        domain: "localhost",
        path: "/",
      };
    });

    await page.context().addCookies(cookies);

    // Go to logout route
    await page.goto("/logout");

    // Should redirect to home page
    await page.waitForURL("/");
    expect(page.url()).toBe("http://localhost:3000/");

    // Should show unauthenticated landing page content
    await expect(page.locator("h1")).toContainText("Euno");
    await expect(
      page.locator("text=A community-in-a-box bot for large Discord servers"),
    ).toBeVisible();
  });
});
