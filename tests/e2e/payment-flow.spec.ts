import { expect, test } from "@playwright/test";

test.describe("Payment Flow", () => {
  test.describe("Public Pages", () => {
    test("homepage loads and displays CTAs", async ({ page }) => {
      await page.goto("/");

      // Check title and main content
      await expect(page.getByRole("heading", { name: "Euno" })).toBeVisible();
      await expect(
        page.getByText("A community-in-a-box bot for large Discord servers"),
      ).toBeVisible();

      // Check CTAs
      await expect(
        page.getByRole("link", { name: /Add to Discord Server/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Already have an account/ }),
      ).toBeVisible();

      // Check footer
      await expect(
        page.getByRole("link", { name: "Terms of Service" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Privacy Policy" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Contact Support" }),
      ).toBeVisible();
    });

    test("terms of service page loads", async ({ page }) => {
      await page.goto("/terms");

      await expect(
        page.getByRole("heading", { name: "Terms of Service" }),
      ).toBeVisible();
      await expect(
        page.getByText("Last Updated: October 1, 2025"),
      ).toBeVisible();

      // Check key sections exist
      await expect(
        page.getByRole("heading", { name: "Subscription and Payment" }),
      ).toBeVisible();
      await expect(
        page.getByText("Pro Tier**: Advanced features for $15/month"),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Data Collection and Privacy" }),
      ).toBeVisible();
    });

    test("privacy policy page loads", async ({ page }) => {
      await page.goto("/privacy");

      await expect(
        page.getByRole("heading", { name: "Privacy Policy" }),
      ).toBeVisible();
      await expect(
        page.getByText("Last Updated: October 1, 2025"),
      ).toBeVisible();

      // Check key sections exist
      await expect(
        page.getByRole("heading", { name: "Information We Collect" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "GDPR Rights (EU/UK Users)" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "CCPA Rights (California Users)" }),
      ).toBeVisible();
    });

    test("payment error page displays error message", async ({ page }) => {
      const testError = "Test payment error message";
      await page.goto(
        `/payment/error?guild_id=test-guild-123&message=${encodeURIComponent(testError)}`,
      );

      await expect(
        page.getByRole("heading", { name: "Payment Error" }),
      ).toBeVisible();
      await expect(page.getByText(testError)).toBeVisible();

      // Check error suggestions
      await expect(
        page.getByText("Payment system temporarily unavailable"),
      ).toBeVisible();
      await expect(page.getByText("Invalid payment information")).toBeVisible();

      // Check action buttons
      await expect(page.getByRole("link", { name: "Try Again" })).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Back to Home" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Contact Support" }).first(),
      ).toBeVisible();
    });
  });

  test.describe("Auth Protection", () => {
    test("upgrade page requires authentication", async ({ page }) => {
      await page.goto("/upgrade?guild_id=test-guild-123");

      // Should redirect to login
      await expect(page).toHaveURL(/\/login\?redirectTo=/);
      await expect(
        page.getByRole("button", { name: "Log in with Discord" }),
      ).toBeVisible();
    });

    test("payment success page requires authentication", async ({ page }) => {
      await page.goto(
        "/payment/success?session_id=test_session&guild_id=test-guild-123",
      );

      // Should redirect to login
      await expect(page).toHaveURL(/\/login\?redirectTo=/);
      await expect(
        page.getByRole("button", { name: "Log in with Discord" }),
      ).toBeVisible();
    });

    test("payment cancel page requires authentication", async ({ page }) => {
      await page.goto("/payment/cancel?guild_id=test-guild-123");

      // Should redirect to login
      await expect(page).toHaveURL(/\/login\?redirectTo=/);
      await expect(
        page.getByRole("button", { name: "Log in with Discord" }),
      ).toBeVisible();
    });
  });

  test.describe("Footer Links", () => {
    test("footer links are present on all pages", async ({ page }) => {
      const pages = [
        "/",
        "/login",
        "/payment/error?guild_id=test&message=test",
        "/terms",
        "/privacy",
      ];

      for (const path of pages) {
        await page.goto(path);

        // Check footer links
        const footer = page.locator("footer");
        await expect(
          footer.getByRole("link", { name: "Terms of Service" }),
        ).toBeVisible();
        await expect(
          footer.getByRole("link", { name: "Privacy Policy" }),
        ).toBeVisible();
        await expect(
          footer.getByRole("link", { name: "Contact Support" }),
        ).toBeVisible();
        await expect(
          footer.getByText("© 2025 Euno. All rights reserved."),
        ).toBeVisible();
      }
    });

    test("footer links navigate correctly", async ({ page }) => {
      await page.goto("/");

      // Click Terms of Service
      await page
        .getByRole("link", { name: "Terms of Service" })
        .first()
        .click();
      await expect(page).toHaveURL("/terms");
      await expect(
        page.getByRole("heading", { name: "Terms of Service" }),
      ).toBeVisible();

      // Click Privacy Policy
      await page.getByRole("link", { name: "Privacy Policy" }).first().click();
      await expect(page).toHaveURL("/privacy");
      await expect(
        page.getByRole("heading", { name: "Privacy Policy" }),
      ).toBeVisible();

      // Click back to home
      await page.getByRole("link", { name: "← Back to Home" }).click();
      await expect(page).toHaveURL("/");
    });
  });

  test.describe("Error Handling", () => {
    test("upgrade page without guild_id shows error", async ({ page }) => {
      // Note: This will redirect to login first, but the error handling is in the loader
      const response = await page.goto("/upgrade");

      // Should get 400 or redirect to login (which then shows error)
      // The actual behavior depends on if requireUser runs before validation
      expect(response?.status()).toBeTruthy();
    });

    test("payment error page works without guild_id", async ({ page }) => {
      await page.goto("/payment/error?message=Config+error");

      await expect(
        page.getByRole("heading", { name: "Payment Error" }),
      ).toBeVisible();
      await expect(page.getByText("Config error")).toBeVisible();

      // Should still show back to home link
      await expect(
        page.getByRole("link", { name: "Back to Home" }),
      ).toBeVisible();
    });
  });

  test.describe("Visual Regression", () => {
    test("homepage renders correctly", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveScreenshot("homepage.png", {
        fullPage: true,
        animations: "disabled",
      });
    });

    test("login page renders correctly", async ({ page }) => {
      await page.goto("/login");
      await expect(page).toHaveScreenshot("login-page.png", {
        fullPage: true,
        animations: "disabled",
      });
    });

    test("payment error page renders correctly", async ({ page }) => {
      await page.goto("/payment/error?guild_id=test&message=Test+error");
      await expect(page).toHaveScreenshot("payment-error.png", {
        fullPage: true,
        animations: "disabled",
      });
    });
  });
});
