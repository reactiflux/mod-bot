import type { APIApplicationCommand, Client } from "discord.js";
import { Routes, InteractionType } from "discord.js";

import type {
  MessageContextCommand,
  SlashCommand,
  UserContextCommand,
} from "~/helpers/discord";
import {
  isMessageContextCommand,
  isSlashCommand,
  isUserContextCommand,
} from "~/helpers/discord";
import { applicationId, isProd, testGuild } from "~/helpers/env";

import { rest } from "~/discord/api";
import { applyCommandChanges } from "~/helpers/discordCommands";

/**
 * deployCommands notifies Discord of the latest commands to use and registers
 * interaction event handlers.
 * @param client A discord.js client
 */
export const deployCommands = async (client: Client) => {
  const localCommands = [...commands.values()].map(({ command }) => command);

  if (isProd()) {
    // Fetch test guild + global commands
    const [remoteGuildCommands, remoteGlobalCommands] = await Promise.all([
      (await rest.get(
        Routes.applicationGuildCommands(applicationId, testGuild),
      )) as APIApplicationCommand[],
      (await rest.get(
        Routes.applicationCommands(applicationId),
      )) as APIApplicationCommand[],
    ]);

    // Deploy to test guild and globally
    await Promise.all([
      applyCommandChanges(
        "Global",
        localCommands,
        remoteGlobalCommands,
        () => Routes.applicationCommands(applicationId),
        (commandId: string) =>
          Routes.applicationCommand(applicationId, commandId),
      ),
      applyCommandChanges(
        "Test Guild",
        localCommands,
        remoteGuildCommands,
        () => Routes.applicationGuildCommands(applicationId, testGuild),
        (commandId: string) =>
          Routes.applicationGuildCommand(applicationId, testGuild, commandId),
      ),
    ]);
  }
  if (!isProd()) {
    // Deploy directly to all connected guilds
    const guilds = await client.guilds.fetch();
    await Promise.all(
      guilds.map(async (guild) => {
        const remoteCommands = (await rest.get(
          Routes.applicationGuildCommands(applicationId, guild.id),
        )) as APIApplicationCommand[];
        await applyCommandChanges(
          `${guild.name.slice(0, 10)}…`,
          localCommands,
          remoteCommands,
          () => Routes.applicationGuildCommands(applicationId, guild.id),
          (commandId: string) =>
            Routes.applicationGuildCommand(applicationId, guild.id, commandId),
        );
      }),
    );
  }

  client.on("interactionCreate", (interaction) => {
    if (
      !interaction ||
      interaction.type !== InteractionType.ApplicationCommand
    ) {
      return;
    }
    const config = commands.get(
      interaction.commandName || "null interaction.command",
    );
    if (!config) {
      throw new Error(`No command found for ${interaction.commandName}`);
    }
    if (
      isMessageContextCommand(config) &&
      interaction.isMessageContextMenuCommand()
    ) {
      config.handler(interaction);
    } else if (
      isUserContextCommand(config) &&
      interaction.isUserContextMenuCommand()
    ) {
      config.handler(interaction);
    } else if (isSlashCommand(config) && interaction.isChatInputCommand()) {
      config.handler(interaction);
    } else {
      throw new Error("Didn't find a handler for an interaction");
    }
  });
};

type Command = MessageContextCommand | UserContextCommand | SlashCommand;

const commands = new Map<string, Command>();
export const registerCommand = (config: Command) => {
  commands.set(config.command.name, config);
};
