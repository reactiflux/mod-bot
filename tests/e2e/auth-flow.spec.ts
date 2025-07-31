import { test, expect } from "@playwright/test";

test.describe("Auth Flow", () => {
  test("auth flow redirects to Discord OAuth correctly", async ({ page }) => {
    // Intercept Discord OAuth requests to prevent external navigation
    let oauthUrl = "";
    await page.route("**/discord.com/oauth2/**", (route) => {
      oauthUrl = route.request().url();
      // Return a simple response instead of following the redirect
      route.fulfill({
        status: 200,
        body: "OAuth redirect intercepted",
      });
    });

    await page.goto("/auth?flow=signup");

    // Wait a bit for any redirects to happen
    await page.waitForTimeout(1000);

    // Verify that a Discord OAuth URL was attempted
    expect(oauthUrl).toContain("discord.com/oauth2/authorize");
    expect(oauthUrl).toContain("client_id=");
    expect(oauthUrl).toContain("response_type=code");
  });

  test("clicking Add to Discord initiates OAuth flow", async ({ page }) => {
    // Intercept Discord OAuth requests
    let oauthUrl = "";
    await page.route("**/discord.com/oauth2/**", (route) => {
      oauthUrl = route.request().url();
      route.fulfill({
        status: 200,
        body: "OAuth redirect intercepted",
      });
    });

    await page.goto("/");

    // Click the Add to Discord button
    await page.click("text=🚀 Add to Discord Server");

    // Wait for the OAuth redirect to be intercepted
    await page.waitForTimeout(1000);

    // Verify OAuth was initiated
    expect(oauthUrl).toContain("discord.com/oauth2/authorize");
    expect(oauthUrl).toContain("flow=signup");
  });
});
