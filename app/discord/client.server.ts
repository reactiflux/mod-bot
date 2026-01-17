import { ActivityType, Client, GatewayIntentBits, Partials } from "discord.js";
import { ReacordDiscordJs } from "reacord";

import { discordToken } from "#~/helpers/env.server";
import { log, trackPerformance } from "#~/helpers/observability";

// HMR state helpers - persisted across module reloads
declare global {
  var __discordClientReady: boolean | undefined;
  var __discordScheduledTasks: ReturnType<typeof setTimeout>[] | undefined;
}

export function isClientReady(): boolean {
  return globalThis.__discordClientReady ?? false;
}

export function setClientReady(): void {
  globalThis.__discordClientReady = true;
}

export function registerScheduledTask(
  timer: ReturnType<typeof setTimeout>,
): void {
  globalThis.__discordScheduledTasks ??= [];
  globalThis.__discordScheduledTasks.push(timer);
}

export function clearScheduledTasks(): void {
  const tasks = globalThis.__discordScheduledTasks ?? [];
  if (tasks.length > 0) {
    log("info", "Client", `Clearing ${tasks.length} scheduled tasks for HMR`);
  }
  for (const timer of tasks) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  globalThis.__discordScheduledTasks = [];
}

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.AutoModerationExecution,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

export const reacord = new ReacordDiscordJs(client);

export const login = () => {
  return trackPerformance(
    "discord_login",
    async () => {
      log("info", "Client", "Starting Discord client login", {});

      await client.login(discordToken);

      log("info", "Client", "Discord client login successful", {});

      client.user?.setActivity("server activity…", {
        type: ActivityType.Watching,
      });

      try {
        const guilds = await client.guilds.fetch();
        const guildNames = guilds.map(({ name }) => name);

        log("info", "Client", "Connected to Discord guilds", {
          guildCount: guilds.size,
          guildNames: guildNames.join(", "),
        });
      } catch (error) {
        log("error", "Client", "Failed to fetch guilds", { error });
      }

      if (client.application) {
        const { id } = client.application;
        log("info", "Client", "Discord application ready", {
          applicationId: id,
          inviteUrl: `https://discord.com/oauth2/authorize?client_id=${id}&permissions=8&scope=applications.commands%20bot`,
        });
      }
    },
    {},
  ).catch((e) => {
    log("error", "Client", "Discord client login failed", {
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
      tokenPresent: !!discordToken,
    });

    process.exit(1);
  });
};
