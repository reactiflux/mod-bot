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

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express from "express";
import open from "open";
import { randomUUID } from "crypto";
import { AuthorizationCode } from "simple-oauth2";

// Import our app modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
process.chdir(join(__dirname, ".."));

// Dynamic imports to handle ES modules
const { default: db } = await import("../app/db.server.js");
const { createUser, getUserByExternalId } = await import(
  "../app/models/user.server.js"
);
const { fetchUser } = await import("../app/models/discord.server.js");
const { applicationId, discordSecret } = await import(
  "../app/helpers/env.server.js"
);

const config = {
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

const authorization = new AuthorizationCode(config);
const CALLBACK_PORT = 3001;
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`;

let server;
let capturedToken = null;
let capturedUser = null;

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
        const discordUser = await fetchUser(token);
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
  try {
    const existingUser = await getUserByExternalId(capturedUser.id);
    if (existingUser) {
      userId = existingUser.id;
      console.log(`👤 Using existing user: ${existingUser.id}`);
    }
  } catch (error) {
    // User doesn't exist, will create below
  }

  if (!userId) {
    userId = await createUser(capturedUser.email, capturedUser.id);
    console.log(`👤 Created new user: ${userId}`);
  }

  // Create a session with the captured token
  const sessionId = randomUUID();
  const sessionData = {
    userId,
    discordToken: capturedToken.toJSON(),
  };

  await db
    .insertInto("sessions")
    .values({
      id: sessionId,
      data: JSON.stringify(sessionData),
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    })
    .execute();

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

  const fs = await import("fs/promises");
  await fs.writeFile("test-auth-data.json", JSON.stringify(authData, null, 2));

  console.log("\n✅ Authentication data saved to test-auth-data.json");
  console.log("🧪 Tests can now use this real authentication data");

  return authData;
}

async function main() {
  console.log("🔐 Discord OAuth Token Capture Script");
  console.log("=====================================\n");

  try {
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
