import Database from "better-sqlite3";
import { createCookieSessionStorage, createSessionStorage } from "react-router";
import { randomUUID } from "crypto";

export interface BorrowedSession {
  sessionCookie: string;
  userEmail: string;
  userExternalId: string;
  userId: string;
  tokenValid: boolean;
}

/**
 * Simple session borrowing that works directly with the database
 * This avoids complex import issues while providing the core functionality
 */
export async function borrowLiveSessionSimple(): Promise<BorrowedSession | null> {
  const db = new Database("mod-bot.sqlite3");

  try {
    // Get the most recent session with a Discord token
    const session = db
      .prepare(
        `
      SELECT id, data, expires FROM sessions 
      WHERE data LIKE '%discordToken%' AND data LIKE '%userId%'
      ORDER BY id DESC
      LIMIT 1
    `,
      )
      .get() as { id: string; data: string; expires?: string } | undefined;

    if (!session) {
      console.log("⚠️  No sessions with Discord tokens found");
      return null;
    }

    const sessionData = JSON.parse(session.data);

    if (!sessionData.userId || !sessionData.discordToken) {
      console.log("⚠️  Session missing required data");
      return null;
    }

    // Get user info
    const user = db
      .prepare("SELECT email, externalId FROM users WHERE id = ?")
      .get(sessionData.userId) as
      | { email: string | null; externalId: string }
      | undefined;

    if (!user) {
      console.log("⚠️  User not found for session");
      return null;
    }

    // Check if token is still valid (not expired)
    let tokenValid = false;
    if (sessionData.discordToken.expires_at) {
      const expiresAt = new Date(sessionData.discordToken.expires_at);
      tokenValid = expiresAt > new Date();
    }

    console.log(
      `🔄 Found session for user: ${user.email} (${user.externalId}) - Token valid: ${tokenValid}`,
    );

    // Create session storage instances
    const sessionSecret = process.env.SESSION_SECRET || "test-secret-key";

    const { commitSession: commitCookieSession, getSession: getCookieSession } =
      createCookieSessionStorage({
        cookie: {
          name: "__client-session",
          httpOnly: true,
          maxAge: 0,
          path: "/",
          sameSite: "lax",
          secrets: [sessionSecret],
          secure: false, // false for testing
        },
      });

    const { commitSession: commitDbSession, getSession: getDbSession } =
      createSessionStorage({
        cookie: {
          name: "__session",
          sameSite: "lax",
        },
        async createData(data, expires) {
          const result = db
            .prepare(
              "INSERT INTO sessions (id, data, expires) VALUES (?, ?, ?) RETURNING id",
            )
            .get(randomUUID(), JSON.stringify(data), expires?.toString()) as {
            id: string;
          };
          return result.id;
        },
        async readData(id) {
          const result = db
            .prepare("SELECT data FROM sessions WHERE id = ?")
            .get(id) as { data: string } | undefined;
          return result ? JSON.parse(result.data) : null;
        },
        async updateData(id, data, expires) {
          db.prepare(
            "UPDATE sessions SET data = ?, expires = ? WHERE id = ?",
          ).run(JSON.stringify(data), expires?.toString() || null, id);
        },
        async deleteData(id) {
          db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
        },
      });

    // Create new test sessions
    const cookieSession = await getCookieSession("");
    const dbSession = await getDbSession("");

    // Set the session data
    dbSession.set("userId", sessionData.userId);
    dbSession.set("discordToken", sessionData.discordToken);

    // Commit sessions
    const [cookieCookie, dbCookie] = await Promise.all([
      commitCookieSession(cookieSession, { maxAge: 60 * 60 * 24 }),
      commitDbSession(dbSession),
    ]);

    const sessionCookie = [cookieCookie, dbCookie].join("; ");

    console.log(`✅ Created test session cookie`);

    return {
      sessionCookie,
      userEmail: user.email || "",
      userExternalId: user.externalId,
      userId: sessionData.userId,
      tokenValid,
    };
  } catch (error) {
    console.error("❌ Error borrowing session:", error);
    return null;
  } finally {
    db.close();
  }
}

/**
 * Helper function to set cookies in Playwright page
 */
export async function setCookiesFromSession(
  page: {
    context(): {
      addCookies(
        cookies: Array<{
          name: string;
          value: string;
          domain: string;
          path: string;
        }>,
      ): Promise<void>;
    };
  },
  sessionCookie: string,
) {
  // Parse cookies properly, handling attributes
  const cookieParts = sessionCookie.split("; ");
  const cookies = [];

  for (const part of cookieParts) {
    const equalsIndex = part.indexOf("=");
    if (equalsIndex === -1) {
      // Skip attributes like "HttpOnly", "Secure", etc.
      continue;
    }

    const name = part.substring(0, equalsIndex);
    const value = part.substring(equalsIndex + 1);

    // Skip cookie attributes, only keep actual cookies
    if (
      ![
        "Path",
        "Domain",
        "Expires",
        "Max-Age",
        "HttpOnly",
        "Secure",
        "SameSite",
      ].includes(name)
    ) {
      cookies.push({
        name,
        value,
        domain: "localhost",
        path: "/",
      });
    }
  }

  await page.context().addCookies(cookies);
  console.log(`🍪 Set ${cookies.length} cookies`);
  return cookies.length;
}

/**
 * Main helper for tests - handles the full flow with fallback
 */
export async function setupTestAuth(page: {
  context(): {
    addCookies(
      cookies: Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
      }>,
    ): Promise<void>;
  };
}): Promise<{
  authMethod: "live" | "none";
  userInfo?: BorrowedSession;
}> {
  const sessionResult = await borrowLiveSessionSimple();

  if (!sessionResult) {
    console.log("⚠️  No live sessions available for testing");
    return { authMethod: "none" };
  }

  await setCookiesFromSession(page, sessionResult.sessionCookie);
  console.log(`🔐 Using live session for: ${sessionResult.userEmail}`);

  return {
    authMethod: "live",
    userInfo: sessionResult,
  };
}
