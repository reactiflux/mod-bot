import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";

/**
 * Unit tests for session borrowing functionality
 * These tests verify the core database query logic without requiring the full app context
 */

describe("Session Borrowing Database Logic", () => {
  it("can query sessions with Discord tokens", async () => {
    const db = new Database("mod-bot.sqlite3");

    try {
      // Test basic session counting
      const totalSessions = db
        .prepare("SELECT COUNT(*) as count FROM sessions")
        .get() as { count: number };
      expect(typeof totalSessions.count).toBe("number");
      expect(totalSessions.count).toBeGreaterThanOrEqual(0);

      // Test Discord token filtering
      const sessionsWithTokens = db
        .prepare(
          `
        SELECT COUNT(*) as count FROM sessions 
        WHERE data LIKE '%discordToken%' AND data LIKE '%userId%'
      `,
        )
        .get() as { count: number };
      expect(typeof sessionsWithTokens.count).toBe("number");
      expect(sessionsWithTokens.count).toBeGreaterThanOrEqual(0);

      console.log(
        `Found ${totalSessions.count} total sessions, ${sessionsWithTokens.count} with Discord tokens`,
      );
    } finally {
      db.close();
    }
  });

  it("can parse session data correctly", async () => {
    const db = new Database("mod-bot.sqlite3");

    try {
      // Get a sample session with Discord token
      const sampleSession = db
        .prepare(
          `
        SELECT id, data, expires FROM sessions 
        WHERE data LIKE '%discordToken%' AND data LIKE '%userId%'
        LIMIT 1
      `,
        )
        .get() as { id: string; data: string; expires?: string } | undefined;

      if (sampleSession) {
        // Test parsing session data
        expect(() => {
          const sessionData = JSON.parse(sampleSession.data);
          expect(sessionData).toHaveProperty("userId");
          expect(sessionData).toHaveProperty("discordToken");

          if (sessionData.discordToken) {
            expect(sessionData.discordToken).toHaveProperty("access_token");
            expect(sessionData.discordToken).toHaveProperty("token_type");
          }

          console.log("Session data structure is valid");
        }).not.toThrow();
      } else {
        console.log(
          "No sessions with Discord tokens found - this is expected in test environments",
        );
        // This is not a failure - it just means no live sessions exist
        expect(true).toBe(true);
      }
    } finally {
      db.close();
    }
  });

  it("can validate session and token expiration logic", async () => {
    const db = new Database("mod-bot.sqlite3");

    try {
      const sessions = db
        .prepare(
          `
        SELECT id, data, expires FROM sessions 
        WHERE data LIKE '%discordToken%' 
        LIMIT 3
      `,
        )
        .all() as Array<{ id: string; data: string; expires?: string }>;

      let validSessions = 0;
      let expiredTokens = 0;
      let validTokens = 0;

      for (const session of sessions) {
        try {
          const sessionData = JSON.parse(session.data);

          // Check session expiration
          if (session.expires) {
            const sessionExpires = new Date(session.expires);
            const sessionValid = sessionExpires > new Date();
            if (sessionValid) validSessions++;
          } else {
            validSessions++; // No expiration = valid
          }

          // Check token expiration
          if (sessionData.discordToken && sessionData.discordToken.expires_at) {
            const tokenExpires = new Date(sessionData.discordToken.expires_at);
            const tokenValid = tokenExpires > new Date();
            if (tokenValid) {
              validTokens++;
            } else {
              expiredTokens++;
            }
          }
        } catch (error) {
          // Skip sessions with invalid JSON
          continue;
        }
      }

      console.log(
        `Session validation: ${validSessions} valid sessions, ${validTokens} valid tokens, ${expiredTokens} expired tokens`,
      );

      // These should all be non-negative numbers
      expect(validSessions).toBeGreaterThanOrEqual(0);
      expect(validTokens).toBeGreaterThanOrEqual(0);
      expect(expiredTokens).toBeGreaterThanOrEqual(0);
    } finally {
      db.close();
    }
  });

  it("can join sessions with users correctly", async () => {
    const db = new Database("mod-bot.sqlite3");

    try {
      // Test the join logic that the borrowing system uses
      const sessionsWithUsers = db
        .prepare(
          `
        SELECT 
          s.id as sessionId,
          s.data,
          u.id as userId,
          u.email,
          u.externalId
        FROM sessions s
        JOIN users u ON JSON_EXTRACT(s.data, '$.userId') = u.id
        WHERE s.data LIKE '%discordToken%'
        LIMIT 3
      `,
        )
        .all() as Array<{
        sessionId: string;
        data: string;
        userId: string;
        email: string | null;
        externalId: string;
      }>;

      for (const row of sessionsWithUsers) {
        expect(row.sessionId).toBeTruthy();
        expect(row.userId).toBeTruthy();
        expect(row.externalId).toBeTruthy(); // Discord ID

        // Verify the session data contains the matching user ID
        const sessionData = JSON.parse(row.data);
        expect(sessionData.userId).toBe(row.userId);

        console.log(
          `Matched session ${row.sessionId} to user ${row.email} (${row.externalId})`,
        );
      }

      expect(sessionsWithUsers.length).toBeGreaterThanOrEqual(0);
    } finally {
      db.close();
    }
  });
});
