import Sentry from "#~/helpers/sentry.server";
import { log, trackPerformance } from "#~/helpers/observability";
import { botStats } from "#~/helpers/metrics";

import { client, login } from "#~/discord/client.server";
import { deployCommands } from "#~/discord/deployCommands.server";

import automod from "#~/discord/automod";
import onboardGuild from "#~/discord/onboardGuild";
import { startActivityTracking } from "#~/discord/activityTracker";

// Track if gateway is already initialized to prevent duplicate logins during HMR
// Use globalThis so the flag persists across module reloads
declare global {
  // eslint-disable-next-line no-var
  var __discordGatewayInitialized: boolean | undefined;
}

export default function init() {
  if (globalThis.__discordGatewayInitialized) {
    log(
      "info",
      "Gateway",
      "Gateway already initialized, skipping duplicate init",
      {},
    );
    return;
  }

  log("info", "Gateway", "Initializing Discord gateway", {});
  globalThis.__discordGatewayInitialized = true;

  login();

  client.on("ready", async () => {
    await trackPerformance(
      "gateway_startup",
      async () => {
        log("info", "Gateway", "Bot ready event triggered", {
          guildCount: client.guilds.cache.size,
          userCount: client.users.cache.size,
        });

        await Promise.all([
          onboardGuild(client),
          automod(client),
          deployCommands(client),
          startActivityTracking(client),
        ]);

        log("info", "Gateway", "Gateway initialization completed", {
          guildCount: client.guilds.cache.size,
          userCount: client.users.cache.size,
        });

        // Track bot startup in business analytics
        botStats.botStarted(client.guilds.cache.size, client.users.cache.size);
      },
      {
        guildCount: client.guilds.cache.size,
        userCount: client.users.cache.size,
      },
    );
  });

  // client.on("messageReactionAdd", () => {});

  client.on("threadCreate", (thread) => {
    log("info", "Gateway", "Thread created", {
      threadId: thread.id,
      guildId: thread.guild?.id,
      channelId: thread.parentId,
      threadName: thread.name,
    });

    // Track thread creation in business analytics
    botStats.threadCreated(thread);

    thread.join().catch((error) => {
      log("error", "Gateway", "Failed to join thread", {
        threadId: thread.id,
        guildId: thread.guild?.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });

  // client.on("messageCreate", async (msg) => {
  //   if (msg.author?.id === client.user?.id) return;

  //   //
  // });

  const errorHandler = (error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);

    log("error", "Gateway", "Gateway error occurred", {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      guildCount: client.guilds.cache.size,
      userCount: client.users.cache.size,
    });

    // Track gateway errors in business analytics
    botStats.gatewayError(errorMessage, client.guilds.cache.size);

    Sentry.captureException(error);
  };

  client.on("error", errorHandler);

  // Add connection monitoring
  client.on("disconnect", () => {
    log("warn", "Gateway", "Client disconnected", {
      guildCount: client.guilds.cache.size,
      userCount: client.users.cache.size,
    });
  });

  client.on("reconnecting", () => {
    log("info", "Gateway", "Client reconnecting", {
      guildCount: client.guilds.cache.size,
      userCount: client.users.cache.size,
    });

    // Track reconnections in business analytics
    botStats.reconnection(client.guilds.cache.size, client.users.cache.size);
  });
}
