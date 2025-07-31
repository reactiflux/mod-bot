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

  test("Add to Discord button has correct href", async ({ page }) => {
    await page.goto("/");

    // Check that the "Add to Discord Server" button has the correct href
    const addButton = page.locator("text=🚀 Add to Discord Server");
    await expect(addButton).toBeVisible();

    const href = await addButton.getAttribute("href");
    expect(href).toContain("/auth?flow=signup");
  });

  test("login link opens login form", async ({ page }) => {
    await page.goto("/");

    // Click the login link
    await page.click("text=Already have an account? Log in");

    // Should show login form
    await expect(page.locator("form")).toBeVisible();

    // Should have a login button that would trigger OAuth
    const loginButton = page.locator("button").filter({ hasText: /login/i });
    await expect(loginButton).toBeVisible();
  });
});
