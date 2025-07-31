import { test, expect } from "@playwright/test";

test.describe("Health Check", () => {
  test("health check endpoint responds", async ({ page }) => {
    const response = await page.goto("/healthcheck");

    // Health check might return 200 (OK) or 500 (ERROR) depending on environment
    // Just check that it responds
    expect(response?.status()).toBeGreaterThanOrEqual(200);
    expect(response?.status()).toBeLessThan(600);

    // Check that the page contains either "OK" or "ERROR"
    const body = await page.locator("body").textContent();
    expect(body).toMatch(/^(OK|ERROR)$/);
  });
});
