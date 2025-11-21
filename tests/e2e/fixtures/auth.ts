/* eslint-disable react-hooks/rules-of-hooks */

import { test as base, type Cookie, type Page } from "@playwright/test";

import { DbFixture, type TestUser } from "./db";

/**
 * Extended test fixture with authentication support
 */
export const test = base.extend<{
  db: DbFixture;
  authenticatedPage: Page;
  testUser: TestUser;
  sessionCookies: Cookie[];
}>({
  // Database fixture - available in all tests
  // eslint-disable-next-line no-empty-pattern
  db: async ({}, use) => {
    const dbFixture = new DbFixture();
    await use(dbFixture);
  },

  // Test user - created for each test
  testUser: async ({ db }, use) => {
    const user = await db.createUser();
    await use(user);
  },

  // Session cookies for authenticated requests
  sessionCookies: async ({ db, testUser }, use) => {
    // Create a session in the database
    const sessionId = await db.createSession(testUser.id);

    // Encode session ID as base64-encoded JSON (React Router session format)
    const encodedSessionId = Buffer.from(JSON.stringify(sessionId)).toString(
      "base64",
    );

    // Create cookies that match what the app expects
    const cookies: Cookie[] = [
      {
        name: "__session",
        value: encodedSessionId,
        domain: "localhost",
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days from now
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ];

    await use(cookies);
  },

  // Authenticated page with session cookies
  authenticatedPage: async ({ context, sessionCookies }, use) => {
    // Add session cookies to the existing context (inherits video/viewport from config)
    await context.addCookies(sessionCookies);

    const page = await context.newPage();
    await use(page);
  },
});

export { expect } from "@playwright/test";
