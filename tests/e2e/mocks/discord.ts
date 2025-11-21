import type { Page, Route } from "@playwright/test";

export interface MockDiscordUser {
  id: string;
  username: string;
  discriminator: string;
  email: string;
  verified: boolean;
  locale: string;
  mfa_enabled: boolean;
  avatar: string;
}

export interface MockDiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  features: string[];
}

/**
 * Discord API mocker for E2E tests
 * Intercepts Discord API calls and returns mock responses
 */
export class DiscordApiMock {
  private mockUser: MockDiscordUser | null = null;
  private mockGuilds: MockDiscordGuild[] = [];

  /**
   * Set the mock user data returned by /users/@me
   */
  setUser(user: Partial<MockDiscordUser>) {
    this.mockUser = {
      id: user.id ?? "123456789012345678",
      username: user.username ?? "testuser",
      discriminator: user.discriminator ?? "0001",
      email: user.email ?? "test@example.com",
      verified: user.verified ?? true,
      locale: user.locale ?? "en-US",
      mfa_enabled: user.mfa_enabled ?? false,
      avatar: user.avatar ?? "avatar_hash",
    };
  }

  /**
   * Add a mock guild to the user's guilds list
   */
  addGuild(guild: Partial<MockDiscordGuild>) {
    this.mockGuilds.push({
      id: guild.id ?? `guild_${Math.random()}`,
      name: guild.name ?? "Test Guild",
      icon: guild.icon ?? null,
      owner: guild.owner ?? false,
      // Default permissions: MANAGE_GUILD + MANAGE_CHANNELS (good for testing)
      permissions: guild.permissions ?? "32",
      features: guild.features ?? [],
    });
  }

  /**
   * Clear all mock data
   */
  clear() {
    this.mockUser = null;
    this.mockGuilds = [];
  }

  /**
   * Setup route interception for Discord API calls
   */
  async setup(page: Page) {
    // Mock user info endpoint
    await page.route("https://discord.com/api/users/@me", (route: Route) => {
      if (this.mockUser) {
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(this.mockUser),
        });
      } else {
        void route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ message: "401: Unauthorized" }),
        });
      }
    });

    // Mock guilds endpoint
    await page.route(
      "https://discord.com/api/users/@me/guilds",
      (route: Route) => {
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(this.mockGuilds),
        });
      },
    );

    // Mock OAuth token endpoint (if needed for refresh)
    await page.route("https://discord.com/api/oauth2/token", (route: Route) => {
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "mock_access_token",
          token_type: "Bearer",
          expires_in: 604800,
          refresh_token: "mock_refresh_token",
          scope: "identify email guilds guilds.members.read",
        }),
      });
    });
  }
}

/**
 * Helper to create a Discord API mocker with default test user
 */
export function createDiscordMock(options?: {
  userId?: string;
  userEmail?: string;
  guilds?: Partial<MockDiscordGuild>[];
}): DiscordApiMock {
  const mock = new DiscordApiMock();

  // Set default user
  mock.setUser({
    id: options?.userId ?? "123456789012345678",
    email: options?.userEmail ?? "test@example.com",
  });

  // Add guilds if provided
  if (options?.guilds) {
    options.guilds.forEach((guild) => mock.addGuild(guild));
  }

  return mock;
}
