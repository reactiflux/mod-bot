import type { Client, Guild } from "discord.js";
import { REST } from "@discordjs/rest";
import { ApplicationCommandType, Routes } from "discord-api-types/v10";
import type { APIApplicationCommand } from "discord-api-types/v10";

import { applicationId, discordToken } from "~/helpers/env";
import { difference } from "~/helpers/sets";
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

/**
 * deployCommands notifies Discord of the latest commands to use and registers
 * interaction event handlers.
 * @param client A discord.js client
 */
export const deployCommands = async (client: Client) => {
  const guilds = await client.guilds.fetch();
  await Promise.all(
    guilds.map(async (guild) => deployCommandsToGuild(await guild.fetch())),
  );

  client.on("interactionCreate", (interaction) => {
    if (
      !interaction ||
      (!interaction.isMessageContextMenu() && !interaction.isCommand())
    ) {
      return;
    }
    const config = commands.get(interaction.commandName);
    if (!config) {
      throw new Error(`No command found for ${interaction.commandName}`);
    }
    if (isMessageContextCommand(config) && interaction.isMessageContextMenu()) {
      config.handler(interaction);
    } else if (
      isUserContextCommand(config) &&
      interaction.isUserContextMenu()
    ) {
      config.handler(interaction);
    } else if (isSlashCommand(config) && interaction.isCommand()) {
      config.handler(interaction);
    } else {
      throw new Error("Didn't find a handler for an interaction");
    }
  });
};

const commands = new Map<
  string,
  MessageContextCommand | UserContextCommand | SlashCommand
>();
export const registerCommand = (
  config: MessageContextCommand | UserContextCommand | SlashCommand,
) => {
  commands.set(config.command.name, config);
};

const rest = new REST({ version: "10" }).setToken(discordToken);

// TODO: make this a global command in production
export const deployCommandsToGuild = async (guild: Guild) => {
  const remoteCommands = (await rest.get(
    Routes.applicationGuildCommands(applicationId, guild.id),
  )) as APIApplicationCommand[];
  const names = new Set(commands.keys());

  // Take the list of names to delete and swap it out for IDs to delete
  const remoteNames = new Set(remoteCommands.map((c) => c.name));
  const deleteNames = [...difference(remoteNames, names)];
  const toDelete = deleteNames
    .map((x) => remoteCommands.find((y) => y.name === x)?.id)
    .filter((x): x is string => Boolean(x));

  console.log(
    "DEPLOY",
    `local: [${[...names].join(",")}], remote: [${[...remoteNames].join(",")}]`,
  );

  await Promise.allSettled(
    toDelete.map((commandId) =>
      rest.delete(
        Routes.applicationGuildCommand(applicationId, guild.id, commandId),
      ),
    ),
  );

  let localCommands = [...commands.values()].map(({ command }) => command);
  // Grab a list of commands that need to be updated
  const toUpdate = remoteCommands.filter(
    (c) =>
      // Check all necessary fields to see if any changed. User and Message
      // commands don't have a description.
      !localCommands
        .map((x) => x.toJSON())
        .find((x) => {
          const { type = ApplicationCommandType.ChatInput, name } = x;
          switch (x.type as ApplicationCommandType) {
            case ApplicationCommandType.User:
            case ApplicationCommandType.Message:
              return name === c.name && type === c.type;
            case ApplicationCommandType.ChatInput:
            default:
              return (
                name === c.name &&
                type === c.type &&
                ("description" in x ? x.description === c.description : true) &&
                c.options?.every((o) =>
                  x.options?.some((o2) => o.name === o2.name),
                ) &&
                x.options?.every((o) =>
                  c.options?.some((o2) => o.name === o2.name),
                )
              );
          }
        }),
  );

  console.log(
    "DEPLOY",
    `Found ${toUpdate.length} changes: [${toUpdate
      .map((x) => x.name)
      .join(",")}], and ${deleteNames.length} to delete: [${deleteNames.join(
      ",",
    )}]`,
  );

  if (toUpdate.length === 0 && remoteCommands.length === localCommands.length) {
    console.log("DEPLOY", `No changes found, not upserting.`);
    return;
  }

  console.log("DEPLOY", `Upserting ${localCommands.length} commands`);
  await rest.put(Routes.applicationGuildCommands(applicationId, guild.id), {
    body: localCommands,
  });
};
