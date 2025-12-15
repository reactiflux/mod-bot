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
      id: "test-user-e2e",
      externalId: "discord_test_e2e",
      email: "e2e-test@example.com",
    },
    botUser: {
      id: "bot-user-fixture",
      externalId: "987654321098765432",
      email: null,
    },
  },

  // Guilds
  guilds: {
    free: {
      id: "test-guild-free",
      name: "Test Guild Free",
    },
    paid: {
      id: "test-guild-paid",
      name: "Test Guild Paid",
    },
  },

  // Channels (for historical data)
  channels: {
    general: "100000000000000001",
    helpReact: "100000000000000002",
    modLog: "100000000000000003",
    helpJs: "100000000000000004",
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
