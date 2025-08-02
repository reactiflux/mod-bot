#!/usr/bin/env node

/**
 * Interactive script to capture real Discord OAuth tokens for e2e testing
 *
 * This script:
 * 1. Starts a temporary server to handle OAuth callback
 * 2. Opens the Discord OAuth flow in your browser
 * 3. Captures the real auth token when you complete the flow
 * 4. Stores it in the database for use in tests
 */

import "dotenv/config";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express from "express";
import open from "open";
import { randomUUID } from "crypto";
import { AuthorizationCode } from "simple-oauth2";
import fs from "fs/promises";
import Database from "better-sqlite3";

// Import our app modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
process.chdir(join(__dirname, ".."));

// We'll import these dynamically after process.cwd() is set
let db, applicationId, discordSecret;
let config, authorization;
const CALLBACK_PORT = 3001;
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`;

let server;
let capturedToken = null;
let capturedUser = null;

async function initializeModules() {
  console.log("🔧 Loading application modules...");

  try {
    // Simple approach - just get config from environment variables
    applicationId = process.env.DISCORD_APP_ID;
    discordSecret = process.env.DISCORD_SECRET;

    if (!applicationId || !discordSecret) {
      throw new Error(
        "Missing DISCORD_APP_ID or DISCORD_SECRET environment variables",
      );
    }

    // Use SQLite directly
    db = new Database("mod-bot.sqlite3");

    config = {
      client: {
        id: applicationId,
        secret: discordSecret,
      },
      auth: {
        tokenHost: "https://discord.com",
        tokenPath: "/api/oauth2/token",
        authorizePath: "/api/oauth2/authorize",
        revokePath: "/api/oauth2/revoke",
      },
    };

    authorization = new AuthorizationCode(config);
    console.log("✅ Modules loaded successfully");
  } catch (error) {
    console.error("❌ Failed to load modules:", error.message);
    console.error(
      "Make sure you have .env file with DISCORD_APP_ID and DISCORD_SECRET",
    );
    throw error;
  }
}

// Helper functions to replace the app module imports
async function fetchDiscordUser(token) {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Discord API error: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

async function createUserInDb(email, externalId) {
  const userId = randomUUID();
  const stmt = db.prepare(`
    INSERT INTO users (id, email, external_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    userId,
    email,
    externalId,
    new Date().toISOString(),
    new Date().toISOString(),
  );
  return userId;
}

async function getUserByExternalIdFromDb(externalId) {
  const stmt = db.prepare(`
    SELECT id, email, external_id 
    FROM users 
    WHERE external_id = ?
  `);

  return stmt.get(externalId);
}

async function startCallbackServer() {
  const app = express();

  return new Promise((resolve, reject) => {
    app.get("/callback", async (req, res) => {
      try {
        const { code } = req.query;

        if (!code) {
          throw new Error("No authorization code received");
        }

        console.log("📝 Authorization code received, exchanging for token...");

        // Exchange code for token
        const token = await authorization.getToken({
          scope: "identify email guilds guilds.members.read",
          code,
          redirect_uri: CALLBACK_URL,
        });

        console.log("🎉 Token received successfully!");

        // Fetch user info from Discord
        const discordUser = await fetchDiscordUser(token);
        console.log(
          `👤 Authenticated as: ${discordUser.username} (${discordUser.email})`,
        );

        capturedToken = token;
        capturedUser = discordUser;

        res.send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>✅ Authentication Successful!</h1>
              <p>You can close this window now.</p>
              <p>Token captured for: <strong>${discordUser.username}</strong></p>
            </body>
          </html>
        `);

        // Close server after successful auth
        setTimeout(() => {
          server.close();
          resolve();
        }, 1000);
      } catch (error) {
        console.error("❌ Error during OAuth callback:", error);
        res.status(500).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>❌ Authentication Failed</h1>
              <p>Error: ${error.message}</p>
            </body>
          </html>
        `);
        reject(error);
      }
    });

    server = app.listen(CALLBACK_PORT, () => {
      console.log(
        `🚀 Callback server started on http://localhost:${CALLBACK_PORT}`,
      );
      resolve();
    });
  });
}

async function initiateOAuthFlow() {
  const state = randomUUID();

  const authUrl = authorization.authorizeURL({
    redirect_uri: CALLBACK_URL,
    state,
    scope: "identify email guilds guilds.members.read",
  });

  console.log("\n🔗 Opening Discord OAuth in your browser...");
  console.log("If it doesn't open automatically, visit:");
  console.log(authUrl);
  console.log("\n📋 Please complete the OAuth flow in your browser.");

  try {
    await open(authUrl);
  } catch (error) {
    console.log(
      "⚠️  Could not automatically open browser. Please visit the URL above manually.",
    );
  }
}

async function storeAuthInDatabase() {
  if (!capturedToken || !capturedUser) {
    throw new Error("No token or user data captured");
  }

  console.log("\n💾 Storing authentication data in database...");

  // Check if user already exists
  let userId;
  const existingUser = await getUserByExternalIdFromDb(capturedUser.id);
  if (existingUser) {
    userId = existingUser.id;
    console.log(`👤 Using existing user: ${existingUser.id}`);
  } else {
    userId = await createUserInDb(capturedUser.email, capturedUser.id);
    console.log(`👤 Created new user: ${userId}`);
  }

  // Create a session with the captured token
  const sessionId = randomUUID();
  const sessionData = {
    userId,
    discordToken: capturedToken.toJSON(),
  };

  const sessionStmt = db.prepare(`
    INSERT INTO sessions (id, data, expires)
    VALUES (?, ?, ?)
  `);

  sessionStmt.run(
    sessionId,
    JSON.stringify(sessionData),
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
  );

  console.log(`💾 Session created: ${sessionId}`);

  // Store the session info in a file for tests to use
  const authData = {
    userId,
    sessionId,
    userEmail: capturedUser.email,
    userExternalId: capturedUser.id,
    username: capturedUser.username,
    createdAt: new Date().toISOString(),
  };

  await fs.writeFile("test-auth-data.json", JSON.stringify(authData, null, 2));

  console.log("\n✅ Authentication data saved to test-auth-data.json");
  console.log("🧪 Tests can now use this real authentication data");

  return authData;
}

async function main() {
  console.log("🔐 Discord OAuth Token Capture Script");
  console.log("=====================================\n");

  try {
    // Initialize modules first
    await initializeModules();

    // Start the callback server
    await startCallbackServer();

    // Initiate OAuth flow
    await initiateOAuthFlow();

    // Wait for callback (server will resolve when done)
    console.log("⏳ Waiting for OAuth completion...");

    // Wait for the callback to complete
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (capturedToken && capturedUser) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });

    // Store in database
    const authData = await storeAuthInDatabase();

    console.log("\n🎊 SUCCESS! Auth token captured and stored.");
    console.log(`👤 User: ${authData.username} (${authData.userEmail})`);
    console.log(`🆔 User ID: ${authData.userId}`);
    console.log(`🔑 Session ID: ${authData.sessionId}`);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    process.exit(0);
  }
}

main();
