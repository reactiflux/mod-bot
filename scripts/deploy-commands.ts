import "dotenv/config";
import {
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
} from "@discordjs/builders";
import { REST } from "@discordjs/rest";
import type { APIApplicationCommand } from "discord-api-types/v9";
import { ApplicationCommandType, Routes } from "discord-api-types/v9";

import { applicationId, discordToken, guildId } from "~/constants";
import { difference } from "~/helpers/sets";

import * as demo from "~/commands/demo";

// TODO: make this a global command in production
const upsertUrl = () => Routes.applicationGuildCommands(applicationId, guildId);
const deleteUrl = (commandId: string) =>
  Routes.applicationGuildCommand(applicationId, guildId, commandId);

interface CommandConfig {
  name: string;
  description: string;
  type: ApplicationCommandType;
}
const cmds: CommandConfig[] = [demo];

const commands = [
  ...cmds
    .filter((x) => x.type === ApplicationCommandType.ChatInput)
    .map((c) =>
      new SlashCommandBuilder()
        .setName(c.name)
        .setDescription(c.description)
        .toJSON(),
    ),
  ...cmds
    .filter((x) => x.type === ApplicationCommandType.Message)
    .map((c) =>
      new ContextMenuCommandBuilder()
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error Discord.js doesn't export the union we need
        .setType(ApplicationCommandType.Message)
        .setName(c.name)
        .toJSON(),
    ),
  ...cmds
    .filter((x) => x.type === ApplicationCommandType.User)
    .map((c) =>
      new ContextMenuCommandBuilder()
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error Discord.js doesn't export the union we need
        .setType(ApplicationCommandType.User)
        .setName(c.name)
        .toJSON(),
    ),
];
const names = new Set(commands.map((c) => c.name));

const rest = new REST({ version: "9" }).setToken(discordToken);
const deploy = async () => {
  const remoteCommands = (await rest.get(
    upsertUrl(),
  )) as APIApplicationCommand[];

  // Take the list of names to delete and swap it out for IDs to delete
  const remoteNames = new Set(remoteCommands.map((c) => c.name));
  const deleteNames = [...difference(remoteNames, names)];
  const toDelete = deleteNames
    .map((x) => remoteCommands.find((y) => y.name === x)?.id)
    .filter((x): x is string => Boolean(x));

  console.log(
    "DEPLOY",
    `local/remote:
[${[...names].join(",")}]
[${[...remoteNames].join(",")}]`,
  );

  console.log(
    "DEPLOY",
    `Removing ${toDelete.length} commands: [${deleteNames.join(",")}]`,
  );
  await Promise.allSettled(
    toDelete.map((commandId) => rest.delete(deleteUrl(commandId))),
  );

  // Grab a list of commands that need to be updated
  const toUpdate = remoteCommands.filter(
    (c) =>
      // Check all necessary fields to see if any changed. User and Message
      // commands don't have a description.
      !commands.find((x) => {
        const {
          type = ApplicationCommandType.ChatInput,
          name,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error Unions are weird
          description = "",
        } = x;
        switch (type as ApplicationCommandType) {
          case ApplicationCommandType.User:
          case ApplicationCommandType.Message:
            return name === c.name && type === c.type;
          case ApplicationCommandType.ChatInput:
          default:
            return (
              name === c.name &&
              type === c.type &&
              description === c.description
            );
        }
      }),
  );

  console.log(
    "DEPLOY",
    `Found changes to ${toUpdate.length} commands: [${toUpdate
      .map((x) => x.name)
      .join(",")}]`,
  );

  if (toUpdate.length === 0) {
    console.log("DEPLOY", `No changes found, not upserting.`);
    return;
  }

  console.log(
    "DEPLOY",
    `Found ${toUpdate.length} change: [${toUpdate
      .map((x) => x.name)
      .join(",")}], upserting ${commands.length}`,
  );

  await rest.put(upsertUrl(), { body: commands });
};
try {
  deploy();
} catch (e) {
  console.log("DEPLOY EXCEPTION", e as string);
}
