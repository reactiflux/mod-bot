import { test, expect } from "@playwright/test";

test.describe("Health Check", () => {
  test("health check endpoint returns OK", async ({ page }) => {
    const response = await page.goto("/healthcheck");

    // Check that the response is successful
    expect(response?.status()).toBe(200);

    // Check that the page contains "OK" or similar health check response
    await expect(page.locator("body")).toContainText("OK");
  });
});
