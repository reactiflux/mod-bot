import type { Client, Guild } from "discord.js";
import { REST } from "@discordjs/rest";
import { ApplicationCommandType, Routes } from "discord-api-types/v10";
import type { APIApplicationCommand } from "discord-api-types/v10";

import { applicationId, discordToken } from "~/helpers/env";
import { difference } from "~/helpers/sets";

import setup from "~/commands/setup";

export const deployCommands = async (client: Client) => {
  const guilds = await client.guilds.fetch();
  await Promise.all(
    guilds.map(async (guild) => deployCommandsToGuild(await guild.fetch())),
  );
};

const commands = [setup].map((x) => x.toJSON());
const names = new Set(commands.map((c) => c.name));

const rest = new REST({ version: "10" }).setToken(discordToken);
const upsertUrl = (guildId: string) =>
  Routes.applicationGuildCommands(applicationId, guildId);
const deleteUrl = (guildId: string, commandId: string) =>
  Routes.applicationGuildCommand(applicationId, guildId, commandId);

// TODO: make this a global command in production
export const deployCommandsToGuild = async (guild: Guild) => {
  const remoteCommands = (await rest.get(
    upsertUrl(guild.id),
  )) as APIApplicationCommand[];

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
    toDelete.map((commandId) => rest.delete(deleteUrl(guild.id, commandId))),
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
              description === c.description &&
              c.options?.every((o) =>
                x.options?.some((o2) => o.name === o2.name),
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

  if (toUpdate.length === 0 && remoteCommands.length === commands.length) {
    console.log("DEPLOY", `No changes found, not upserting.`);
    return;
  }

  await rest.put(upsertUrl(guild.id), { body: commands });
};
