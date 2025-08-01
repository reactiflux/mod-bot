import { test, expect } from "@playwright/test";

test.describe("Auth Flow", () => {
  test("unauthenticated users see login form on protected routes", async ({
    page,
  }) => {
    // Try to access a protected route without authentication
    await page.goto("/app/123456789/settings");

    // Should show login form instead of the protected content
    await expect(page.locator("form")).toBeVisible();

    // Should have login button or similar auth mechanism
    const hasAuthButton = await page
      .locator("button, a")
      .filter({ hasText: /login|discord/i })
      .isVisible();

    expect(hasAuthButton).toBe(true);
  });

  test("auth route with signup flow parameter responds correctly", async ({
    page,
  }) => {
    // Access the auth route with flow parameter
    const response = await page.goto("/auth?flow=signup");

    // Should respond without error (might redirect to Discord, but shouldn't 500)
    expect(response?.status()).toBeLessThan(500);
  });

  test("auth route rejects invalid flow parameters", async ({ page }) => {
    await page.goto("/auth?flow=invalid");

    // Should redirect to home page for invalid flows
    await page.waitForURL("/", { timeout: 5000 });
    expect(page.url()).toBe("http://localhost:3000/");
  });
});
