/**
 * Shared fixture constants for e2e tests and staging environments.
 * Single source of truth for test data IDs across the codebase.
 */

// Discord-format snowflake IDs for realism
// These are fake but follow the snowflake format
export const FIXTURE_IDS = {
  // Users
  users: {
    testUser: {
      id: "3486c000-6af3-45db-81f4-98bcff8806c9",
      externalId: "103525876892708864",
      email: "vcarl@example.com",
    },
  },

  // Guilds
  guilds: {
    free: {
      id: "614601782152265748",
      name: "Test Server",
    },
    paid: {
      id: "1442358269497577665",
      name: "Euno",
    },
  },

  // Channels (for historical data)
  channels: {
    testing: "1442382154511155401",
  },

  // Sessions
  sessions: {
    testSession: "test-session-e2e",
  },

  // Stripe (test mode)
  stripe: {
    customerId: "cus_test_e2e",
    subscriptionId: "sub_test_e2e",
  },
} as const;

// Legacy aliases for backwards compatibility with existing tests
export const TEST_USER_ID = FIXTURE_IDS.users.testUser.id;
export const TEST_USER_EXTERNAL_ID = FIXTURE_IDS.users.testUser.externalId;
export const TEST_USER_EMAIL = FIXTURE_IDS.users.testUser.email;
export const TEST_SESSION_ID = FIXTURE_IDS.sessions.testSession;
export const TEST_GUILD_FREE_ID = FIXTURE_IDS.guilds.free.id;
export const TEST_GUILD_PAID_ID = FIXTURE_IDS.guilds.paid.id;
