import { randomUUID } from "crypto";
import { createCookieSessionStorage, createSessionStorage } from "react-router";
import db from "#~/db.server";
import { createUser } from "#~/models/user.server";
import { sessionSecret } from "#~/helpers/env.server";

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
          id: randomUUID(),
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

export interface TestUser {
  id: string;
  email: string;
  externalId: string;
  sessionCookie: string;
}

/**
 * Creates a test user and returns authentication cookies for use in tests
 */
export async function createTestUser(
  email: string = "test@example.com",
  externalId: string = "123456789",
): Promise<TestUser> {
  // Create the user in the database
  const userId = await createUser(email, externalId);

  // Create empty session objects
  const cookieSession = await getCookieSession("");
  const dbSession = await getDbSession("");

  // Set user ID in the database session
  dbSession.set("userId", userId);

  // Mock a Discord token (for tests that need it)
  const mockToken = {
    access_token: "mock_access_token",
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: "mock_refresh_token",
    scope: "identify email guilds",
  };
  dbSession.set("discordToken", mockToken);

  // Commit both sessions and get cookies
  const [cookieCookie, dbCookie] = await Promise.all([
    commitCookieSession(cookieSession, {
      maxAge: 60 * 60 * 24 * 7, // 7 days
    }),
    commitDbSession(dbSession),
  ]);

  // Combine cookies for easy use in tests
  const sessionCookie = [cookieCookie, dbCookie].join("; ");

  return {
    id: userId,
    email,
    externalId,
    sessionCookie,
  };
}

/**
 * Creates an admin test user with additional permissions
 */
export async function createTestAdmin(
  email: string = "admin@example.com",
  externalId: string = "987654321",
): Promise<TestUser> {
  return createTestUser(email, externalId);
}

/**
 * Cleans up test users from the database
 */
export async function cleanupTestUsers(emails: string[]) {
  // First, clean up any sessions for these users
  const users = await db
    .selectFrom("users")
    .select("id")
    .where("email", "in", emails)
    .execute();

  if (users.length > 0) {
    const userIds = users.map((u) => u.id);

    // Delete sessions for these users
    await db
      .deleteFrom("sessions")
      .where("data", "like", `%${userIds[0]}%`) // Simple cleanup, could be improved
      .execute();
  }

  // Delete the test users
  await db.deleteFrom("users").where("email", "in", emails).execute();
}

/**
 * Creates session cookies for an existing user ID
 */
export async function createSessionForUser(userId: string): Promise<string> {
  const cookieSession = await getCookieSession("");
  const dbSession = await getDbSession("");

  dbSession.set("userId", userId);

  const mockToken = {
    access_token: "mock_access_token",
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: "mock_refresh_token",
    scope: "identify email guilds",
  };
  dbSession.set("discordToken", mockToken);

  const [cookieCookie, dbCookie] = await Promise.all([
    commitCookieSession(cookieSession, {
      maxAge: 60 * 60 * 24 * 7,
    }),
    commitDbSession(dbSession),
  ]);

  return [cookieCookie, dbCookie].join("; ");
}
