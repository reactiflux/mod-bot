import { readFile } from "fs/promises";
import { createCookieSessionStorage, createSessionStorage } from "react-router";
import { randomUUID } from "crypto";
import db from "#~/db.server";
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

export interface CapturedAuthData {
  userId: string;
  sessionId: string;
  userEmail: string;
  userExternalId: string;
  username: string;
  createdAt: string;
}

/**
 * Loads the captured auth data from the capture script
 */
export async function loadCapturedAuthData(): Promise<CapturedAuthData> {
  try {
    const data = await readFile("test-auth-data.json", "utf-8");
    return JSON.parse(data);
  } catch (error) {
    throw new Error(
      "No captured auth data found. Please run 'npm run capture-auth' first to authenticate with Discord.",
    );
  }
}

/**
 * Creates session cookies using the captured real authentication data
 */
export async function createRealAuthSession(): Promise<string> {
  const authData = await loadCapturedAuthData();

  // Check if the session still exists in the database
  const existingSession = await db
    .selectFrom("sessions")
    .where("id", "=", authData.sessionId)
    .selectAll()
    .executeTakeFirst();

  if (!existingSession) {
    throw new Error(
      "Captured session no longer exists in database. Please run 'npm run capture-auth' again.",
    );
  }

  // Create new cookie sessions that reference the existing database session
  const cookieSession = await getCookieSession("");
  const dbSession = await getDbSession("");

  // Set the user ID to link to the database session
  dbSession.set("userId", authData.userId);

  // Get the Discord token from the existing session
  const sessionData = JSON.parse(existingSession.data as string);
  dbSession.set("discordToken", sessionData.discordToken);

  // Commit the sessions
  const [cookieCookie, dbCookie] = await Promise.all([
    commitCookieSession(cookieSession, {
      maxAge: 60 * 60 * 24 * 7, // 7 days
    }),
    commitDbSession(dbSession),
  ]);

  return [cookieCookie, dbCookie].join("; ");
}

/**
 * Checks if captured auth data is available and valid
 */
export async function hasValidCapturedAuth(): Promise<boolean> {
  try {
    const authData = await loadCapturedAuthData();

    // Check if the session still exists
    const session = await db
      .selectFrom("sessions")
      .where("id", "=", authData.sessionId)
      .selectAll()
      .executeTakeFirst();

    return !!session;
  } catch {
    return false;
  }
}

/**
 * Utility to get user info from captured auth
 */
export async function getCapturedUserInfo(): Promise<{
  username: string;
  email: string;
  userId: string;
}> {
  const authData = await loadCapturedAuthData();
  return {
    username: authData.username,
    email: authData.userEmail,
    userId: authData.userId,
  };
}
