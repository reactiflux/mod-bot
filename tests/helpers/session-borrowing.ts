import { createCookieSessionStorage, createSessionStorage } from "react-router";
import db from "#~/db.server";
import { sessionSecret } from "#~/helpers/env.server";

export interface LiveSessionInfo {
  sessionId: string;
  userId: string;
  userEmail: string;
  userExternalId: string;
  discordToken: {
    access_token: string;
    token_type: string;
    expires_at?: string;
    refresh_token?: string;
    scope?: string;
  };
  createdAt?: Date;
  expiresAt?: Date;
  isValid: boolean;
}

export interface LiveSessionOptions {
  requireFreshToken?: boolean; // Token expires in > 1 hour
  guildId?: string; // User must have access to this guild (not implemented yet)
  maxAge?: number; // Session max age in hours (default: 24)
  excludeUserIds?: string[]; // Exclude specific users
}

const { commitSession: commitCookieSession, getSession: getCookieSession } =
  createCookieSessionStorage({
    cookie: {
      name: "__client-session",
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secrets: [sessionSecret],
      secure: process.env.NODE_ENV === "production",
    },
  });

const { commitSession: commitDbSession, getSession: getDbSession } =
  createSessionStorage({
    cookie: {
      name: "__session",
      sameSite: "lax",
    },
    async createData(data, expires) {
      const result = await db
        .insertInto("sessions")
        .values({
          id: crypto.randomUUID(),
          data: JSON.stringify(data),
          expires: expires?.toString(),
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      if (!result.id) {
        throw new Error("Failed to create session data");
      }
      return result.id;
    },
    async readData(id) {
      const result = await db
        .selectFrom("sessions")
        .where("id", "=", id)
        .selectAll()
        .executeTakeFirst();
      return (result?.data as unknown) ?? null;
    },
    async updateData(id, data, expires) {
      await db
        .updateTable("sessions")
        .set("data", JSON.stringify(data))
        .set("expires", expires?.toString() || null)
        .where("id", "=", id)
        .execute();
    },
    async deleteData(id) {
      await db.deleteFrom("sessions").where("id", "=", id).execute();
    },
  });

/**
 * Finds active sessions in the database with Discord tokens
 */
export async function findActiveSessionsInDb(
  options: LiveSessionOptions = {},
): Promise<LiveSessionInfo[]> {
  const { maxAge = 24, excludeUserIds = [] } = options;
  const _maxAgeDate = new Date(Date.now() - maxAge * 60 * 60 * 1000);

  // Query sessions that contain Discord tokens
  const sessions = await db
    .selectFrom("sessions")
    .select(["id as sessionId", "data", "expires"])
    .where("data", "like", "%discordToken%")
    .where("data", "like", "%userId%")
    .execute();

  const results: LiveSessionInfo[] = [];

  for (const row of sessions) {
    try {
      const sessionData = JSON.parse(row.data as string);

      // Skip if no Discord token or user ID
      if (!sessionData.discordToken || !sessionData.userId) continue;

      // Skip excluded users
      if (excludeUserIds.includes(sessionData.userId)) continue;

      // Find the actual user for this session
      const user = await db
        .selectFrom("users")
        .select(["id", "email", "externalId"])
        .where("id", "=", sessionData.userId)
        .executeTakeFirst();

      if (!user) continue;

      const token = sessionData.discordToken;
      let tokenExpiresAt: Date | undefined;
      let isTokenFresh = true;

      // Check token expiration
      if (token.expires_at) {
        tokenExpiresAt = new Date(token.expires_at);
        const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
        isTokenFresh = tokenExpiresAt > oneHourFromNow;
      }

      // Skip if fresh token required but token is expiring soon
      if (options.requireFreshToken && !isTokenFresh) continue;

      // Check session expiration
      let sessionExpiresAt: Date | undefined;
      if (row.expires) {
        sessionExpiresAt = new Date(row.expires);
        if (sessionExpiresAt < new Date()) continue; // Skip expired sessions
      }

      results.push({
        sessionId: row.sessionId ?? "",
        userId: user.id,
        userEmail: user.email ?? "",
        userExternalId: user.externalId,
        discordToken: token,
        expiresAt: tokenExpiresAt,
        isValid: isTokenFresh,
      });
    } catch (error) {
      console.warn(`Failed to parse session data for ${row.sessionId}:`, error);
      continue;
    }
  }

  return results.sort((a, b) => {
    // Sort by token validity and expiration
    if (a.isValid !== b.isValid) return a.isValid ? -1 : 1;
    if (a.expiresAt && b.expiresAt) {
      return b.expiresAt.getTime() - a.expiresAt.getTime(); // Latest expiration first
    }
    return 0;
  });
}

/**
 * Borrows a live session from the database and creates test session cookies
 */
export async function borrowLiveSession(
  options: LiveSessionOptions = {},
): Promise<{
  sessionCookie: string;
  userInfo: LiveSessionInfo;
} | null> {
  const availableSessions = await findActiveSessionsInDb(options);

  if (availableSessions.length === 0) {
    console.warn("⚠️  No suitable live sessions found in database");
    return null;
  }

  const sessionInfo = availableSessions[0]; // Use the best available session
  console.log(
    `🔄 Borrowing live session for user: ${sessionInfo.userEmail} (${sessionInfo.userExternalId})`,
  );

  // Create new test session cookies that reference the existing session data
  const cookieSession = await getCookieSession("");
  const dbSession = await getDbSession("");

  // Set session data
  dbSession.set("userId", sessionInfo.userId);
  dbSession.set("discordToken", sessionInfo.discordToken);

  // Commit sessions
  const [cookieCookie, dbCookie] = await Promise.all([
    commitCookieSession(cookieSession, {
      maxAge: 60 * 60 * 24, // 24 hours for test sessions
    }),
    commitDbSession(dbSession),
  ]);

  const sessionCookie = [cookieCookie, dbCookie].join("; ");

  return {
    sessionCookie,
    userInfo: sessionInfo,
  };
}

/**
 * Gets information about available live sessions without creating test sessions
 */
export async function getAvailableLiveUsers(
  options: LiveSessionOptions = {},
): Promise<LiveSessionInfo[]> {
  return findActiveSessionsInDb(options);
}

/**
 * Validates that a Discord token is still valid by making a test API call
 */
export async function validateDiscordToken(token: {
  access_token: string;
  token_type: string;
  expires_at?: string;
}): Promise<boolean> {
  try {
    const response = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.warn("Token validation failed:", error);
    return false;
  }
}

/**
 * Enhanced session borrowing with automatic fallback strategy
 */
export async function createTestUserWithFallback(
  options: LiveSessionOptions = {},
): Promise<{
  sessionCookie: string;
  userInfo: LiveSessionInfo;
  authMethod: "live" | "captured" | "mock";
}> {
  // Try 1: Borrow from live database sessions
  const liveSession = await borrowLiveSession(options);
  if (liveSession) {
    return {
      ...liveSession,
      authMethod: "live",
    };
  }

  // Try 2: Use captured auth data (existing functionality)
  try {
    const { hasValidCapturedAuth } = await import("./real-auth");
    if (await hasValidCapturedAuth()) {
      const { createRealAuthSession, loadCapturedAuthData } = await import(
        "./real-auth"
      );
      const authData = await loadCapturedAuthData();
      const sessionCookie = await createRealAuthSession();

      console.log("📦 Using captured auth data");
      return {
        sessionCookie,
        userInfo: {
          sessionId: authData.sessionId,
          userId: authData.userId,
          userEmail: authData.userEmail,
          userExternalId: authData.userExternalId,
          discordToken: {
            access_token: "captured-token",
            token_type: "Bearer",
          }, // Token details not exposed in captured data interface
          isValid: true,
        },
        authMethod: "captured",
      };
    }
  } catch (error) {
    console.warn("Could not use captured auth data:", error);
  }

  // Try 3: Fall back to mock data (existing functionality)
  const { createTestUser } = await import("./auth");
  const mockUser = await createTestUser();

  console.warn(
    "⚠️  Using mock authentication data. For real Discord API testing, run 'npm run capture-auth'",
  );
  return {
    sessionCookie: mockUser.sessionCookie,
    userInfo: {
      sessionId: "mock",
      userId: mockUser.id,
      userEmail: mockUser.email,
      userExternalId: mockUser.externalId,
      discordToken: { access_token: "mock-token", token_type: "Bearer" }, // Mock token details
      isValid: false, // Mock tokens are not valid for real API calls
    },
    authMethod: "mock",
  };
}
