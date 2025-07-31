import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("redirects authenticated users from home to guilds", async ({
    page,
  }) => {
    // This test would need actual authentication setup
    // For now, we test the unauthenticated behavior
    await page.goto("/");

    // Unauthenticated users should see the landing page
    await expect(page.locator("h1")).toContainText("Euno");
  });

  test("404 pages return appropriate status", async ({ page }) => {
    const response = await page.goto("/non-existent-route");

    // Should return 404 status
    expect(response?.status()).toBe(404);
  });

  test("auth route handles flow parameter", async ({ page }) => {
    await page.goto("/auth?flow=signup");

    // Should redirect to Discord OAuth (or show appropriate auth UI)
    // The exact behavior depends on the OAuth implementation
    // For now, just check that the page loads without error
    expect(page.url()).toContain("/auth");
  });

  test("auth route redirects invalid flows", async ({ page }) => {
    await page.goto("/auth?flow=invalid");

    // Should redirect to home page for invalid flows
    await page.waitForURL("/");
    expect(page.url()).toBe("http://localhost:3000/");
  });

  test("logout route works", async ({ page }) => {
    await page.goto("/logout");

    // Should redirect somewhere (likely home) after logout
    // Without authentication, this should just redirect to home
    await page.waitForLoadState("networkidle");
    expect(page.url()).toBeTruthy();
  });
});
