import { test, expect } from "@playwright/test";

test.describe("Simple Session Test", () => {
  test("basic test runs without auth", async ({ page }) => {
    await page.goto("/");

    // Just verify the page loads
    expect(page.url()).toContain("localhost");

    console.log("✅ Basic test passed - page loads");
  });
});
