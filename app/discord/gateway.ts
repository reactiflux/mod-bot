import { Events } from "discord.js";

import { startActivityTracking } from "#~/discord/activityTracker";
import automod from "#~/discord/automod";
import {
  clearScheduledTasks,
  client,
  isClientReady,
  login,
  setClientReady,
} from "#~/discord/client.server";
import { deployCommands } from "#~/discord/deployCommands.server";
import { startEscalationResolver } from "#~/discord/escalationResolver";
import {
  registerListener,
  removeAllListeners,
} from "#~/discord/listenerRegistry";
import modActionLogger from "#~/discord/modActionLogger";
import onboardGuild from "#~/discord/onboardGuild";
import { startReactjiChanneler } from "#~/discord/reactjiChanneler";
import { botStats, shutdownMetrics } from "#~/helpers/metrics";
import { log, trackPerformance } from "#~/helpers/observability";
import Sentry from "#~/helpers/sentry.server";

import { startHoneypotTracking } from "./honeypotTracker";

// Track if login has been initiated to prevent duplicate logins during HMR
declare global {
  var __discordLoginStarted: boolean | undefined;
}

/**
 * Initialize all sub-modules that depend on the client being ready.
 */
async function initializeSubModules() {
  await trackPerformance(
    "gateway_startup",
    async () => {
      log("info", "Gateway", "Initializing sub-modules", {
        guildCount: client.guilds.cache.size,
        userCount: client.users.cache.size,
      });

      await Promise.all([
        onboardGuild(client),
        automod(client),
        modActionLogger(client),
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
}

export default function init() {
  // Login only happens once - persists across HMR
  if (!globalThis.__discordLoginStarted) {
    log("info", "Gateway", "Initializing Discord gateway (first time)");
    globalThis.__discordLoginStarted = true;
    void login();

    // Set ready state when ClientReady fires (only needs to happen once)
    client.once(Events.ClientReady, () => {
      setClientReady();
    });
  } else {
    log("info", "Gateway", "HMR detected, rebinding listeners");
  }

  // Clean up old listeners and scheduled tasks before rebinding
  removeAllListeners(client);
  clearScheduledTasks();

  // Bind all listeners (runs on every HMR reload)
  bindListeners();

  // Initialize sub-modules if client is already ready, otherwise wait
  if (isClientReady()) {
    void initializeSubModules();
  } else {
    // Use once() here since this is a one-time initialization per login
    client.once(Events.ClientReady, () => {
      void initializeSubModules();
    });
  }
}

/**
 * Bind all gateway-level listeners. Called on initial load and every HMR reload.
 */
function bindListeners() {
  // Diagnostic: log all raw gateway events
  // Note: Events.Raw is not part of ClientEvents, so we register it manually
  // and track it separately for cleanup
  const rawHandler = (packet: {
    t?: string;
    op?: number;
    d?: Record<string, unknown>;
  }) => {
    log("debug", "Gateway.Raw", packet.t ?? "unknown", {
      op: packet.op,
      guildId: packet.d?.guild_id,
      channelId: packet.d?.channel_id,
      userId: packet.d?.user_id,
    });
  };
  client.on(Events.Raw, rawHandler);
  // Manually track for removal (cast needed since Raw isn't in ClientEvents)
  globalThis.__discordListenerRegistry ??= [];
  globalThis.__discordListenerRegistry.push({
    event: Events.Raw,
    listener: rawHandler as (...args: unknown[]) => void,
  });

  registerListener(client, Events.ThreadCreate, (thread) => {
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

  registerListener(client, Events.Error, errorHandler);

  // Add connection monitoring
  registerListener(client, Events.ShardDisconnect, () => {
    log("warn", "Gateway", "Client disconnected", {
      guildCount: client.guilds.cache.size,
      userCount: client.users.cache.size,
    });
  });

  registerListener(client, Events.ShardReconnecting, () => {
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
