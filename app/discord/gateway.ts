import onboardCommand, { handler as onboardHandler } from "~/commands/setup";
import reportCommand, { handler as reportHandler } from "~/commands/report";

import automod from "~/discord/automod";
import onboardGuild from "~/discord/onboardGuild";
import { client, login } from "~/discord/client";
import { deployCommands } from "~/discord/deployCommands.server";

export default function init() {
  login();

  client.on("ready", async () => {
    await Promise.all([
      onboardGuild(client),
      automod(client),
      deployCommands(client),
    ]);
  });

  client.on("interactionCreate", (interaction) => {
    if (interaction.isCommand()) {
      switch (interaction.commandName) {
        case onboardCommand.name:
          return onboardHandler(interaction);
      }
    } else if (interaction.isMessageContextMenu()) {
      switch (interaction.commandName) {
        case reportCommand.name:
          return reportHandler(interaction);
      }
    }
  });

  client.on("messageReactionAdd", () => {});

  client.on("threadCreate", (thread) => {
    thread.join();
  });

  client.on("messageCreate", async (msg) => {
    if (msg.author?.id === client.user?.id) return;

    //
  });

  const errorHandler = (error: unknown) => {
    if (error instanceof Error) {
      console.log("ERROR", error.message);
    } else if (typeof error === "string") {
      console.log("ERROR", error);
    }
  };

  client.on("error", errorHandler);
}
