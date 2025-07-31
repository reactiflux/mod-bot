import { test, expect } from "@playwright/test";

test.describe("Landing Page", () => {
  test("loads the landing page successfully", async ({ page }) => {
    await page.goto("/");

    // Check that the main heading is visible
    await expect(page.locator("h1")).toContainText("Euno");

    // Check that the description is present
    await expect(
      page.locator("text=A community-in-a-box bot for large Discord servers"),
    ).toBeVisible();

    // Check that the main CTA button is present
    await expect(page.locator("text=🚀 Add to Discord Server")).toBeVisible();

    // Check that the login link is present
    await expect(
      page.locator("text=Already have an account? Log in"),
    ).toBeVisible();
  });

  test("has animated emoji background", async ({ page }) => {
    await page.goto("/");

    // Check that the animated background element exists
    await expect(page.locator(".animate-slide")).toBeVisible();
  });

  test("navigates to auth flow when clicking Add to Discord", async ({
    page,
  }) => {
    await page.goto("/");

    // Click the "Add to Discord Server" button
    await page.click("text=🚀 Add to Discord Server");

    // Should navigate to auth flow
    await expect(page).toHaveURL(/\/auth\?flow=signup/);
  });

  test("shows login form when clicking login link", async ({ page }) => {
    await page.goto("/");

    // Click the login link
    await page.click("text=Already have an account? Log in");

    // Should show Discord OAuth login button
    await expect(page.locator("text=Login with Discord")).toBeVisible();
  });
});
