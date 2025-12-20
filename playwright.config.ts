import { defineConfig, devices } from "@playwright/test";

// Check if running against a remote preview
const isRemote = !!process.env.E2E_PREVIEW_URL;
const baseURL = process.env.E2E_PREVIEW_URL ?? "http://localhost:3000";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  preserveOutput: "always",
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["github"],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    video: "on",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Only start local server if not running against remote preview
  webServer: isRemote
    ? undefined
    : {
        command: "npm run build; npm start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
