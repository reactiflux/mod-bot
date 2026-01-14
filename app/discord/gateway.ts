import { Events } from "discord.js";

import { startActivityTracking } from "#~/discord/activityTracker";
import automod from "#~/discord/automod";
import { client, login } from "#~/discord/client.server";
import { deployCommands } from "#~/discord/deployCommands.server";
import { startEscalationResolver } from "#~/discord/escalationResolver";
import onboardGuild from "#~/discord/onboardGuild";
import { startReactjiChanneler } from "#~/discord/reactjiChanneler";
import { botStats, shutdownMetrics } from "#~/helpers/metrics";
import { log, trackPerformance } from "#~/helpers/observability";
import Sentry from "#~/helpers/sentry.server";

import { startHoneypotTracking } from "./honeypotTracker";

// Track if gateway is already initialized to prevent duplicate logins during HMR
// Use globalThis so the flag persists across module reloads
declare global {
  var __discordGatewayInitialized: boolean | undefined;
}

export default function init() {
  if (globalThis.__discordGatewayInitialized) {
    log(
      "info",
      "Gateway",
      "Gateway already initialized, skipping duplicate init",
    );
    return;
  }

  log("info", "Gateway", "Initializing Discord gateway");
  globalThis.__discordGatewayInitialized = true;

  void login();

  // Diagnostic: log all raw gateway events
  client.on(
    Events.Raw,
    (packet: { t?: string; op?: number; d?: Record<string, unknown> }) => {
      log("debug", "Gateway.Raw", packet.t ?? "unknown", {
        op: packet.op,
        guildId: packet.d?.guild_id,
        channelId: packet.d?.channel_id,
        userId: packet.d?.user_id,
      });
    },
  );

  client.on(Events.ClientReady, async () => {
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
          startHoneypotTracking(client),
          startReactjiChanneler(client),
        ]);

        // Start escalation resolver scheduler (must be after client is ready)
        startEscalationResolver(client);

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

  // client.on(Events.messageReactionAdd, () => {});

  client.on(Events.ThreadCreate, (thread) => {
    log("info", "Gateway", "Thread created", {
      threadId: thread.id,
      guildId: thread.guild.id,
      channelId: thread.parentId,
      threadName: thread.name,
    });

    // Track thread creation in business analytics
    botStats.threadCreated(thread);

    thread.join().catch((error) => {
      log("error", "Gateway", "Failed to join thread", {
        threadId: thread.id,
        guildId: thread.guild.id,
        error,
      });
    });
  });

  // client.on(Events.messageCreate, async (msg) => {
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

  client.on(Events.Error, errorHandler);

  // Add connection monitoring
  client.on(Events.ShardDisconnect, () => {
    log("warn", "Gateway", "Client disconnected", {
      guildCount: client.guilds.cache.size,
      userCount: client.users.cache.size,
    });
  });

  client.on(Events.ShardReconnecting, () => {
    log("info", "Gateway", "Client reconnecting", {
      guildCount: client.guilds.cache.size,
      userCount: client.users.cache.size,
    });

    // Track reconnections in business analytics
    botStats.reconnection(client.guilds.cache.size, client.users.cache.size);
  });

  // Graceful shutdown handler to flush metrics
  const handleShutdown = async (signal: string) => {
    log("info", "Gateway", `Received ${signal}, shutting down gracefully`, {});
    await shutdownMetrics();
    process.exit(0);
  };

  process.on("SIGTERM", () => void handleShutdown("SIGTERM"));
  process.on("SIGINT", () => void handleShutdown("SIGINT"));
}
