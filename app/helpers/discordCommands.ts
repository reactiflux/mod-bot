import type {
  APIApplicationCommand,
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { ApplicationCommandType } from "discord.js";
import { rest } from "~/discord/api";

import { difference } from "~/helpers/sets";

const calculateChangedCommands = (
  deplayStage: string,
  localCommands: (ContextMenuCommandBuilder | SlashCommandBuilder)[],
  remoteCommands: APIApplicationCommand[],
) => {
  const names = new Set(localCommands.map((c) => c.name));

  // Take the list of names to delete and swap it out for IDs to delete
  const remoteNames = new Set(remoteCommands.map((c) => c.name));
  const deleteNames = [...difference(remoteNames, names)];
  const toDelete = deleteNames
    .map((x) => remoteCommands.find((y) => y.name === x)?.id)
    .filter((x): x is string => Boolean(x));

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
    deplayStage,
    `local: [${[...names].join(",")}], remote: [${[...remoteNames].join(",")}]`,
  );

  return { toDelete, toUpdate };
};

export const applyCommandChanges = async (
  deployStage: string,
  localCommands: (ContextMenuCommandBuilder | SlashCommandBuilder)[],
  remoteCommands: APIApplicationCommand[],
  put: () => `/${string}`,
  del: (id: string) => `/${string}`,
) => {
  const { toDelete, toUpdate } = calculateChangedCommands(
    deployStage,
    localCommands,
    remoteCommands,
  );

  await Promise.allSettled(
    toDelete.map((commandId) => rest.delete(del(commandId))),
  );

  console.log(
    "DEPLOY",
    deployStage,
    `Found ${toUpdate.length} changes: [${toUpdate
      .map((x) => x.name)
      .join(",")}], and ${toDelete.length} to delete: [${toDelete.join(",")}]`,
  );

  if (toUpdate.length === 0 && remoteCommands.length === localCommands.length) {
    console.log("DEPLOY", deployStage, `No changes found, not upserting.`);
    return;
  }

  console.log(
    "DEPLOY",
    deployStage,
    `Upserting ${localCommands.length} commands`,
  );
  await rest.put(put(), { body: localCommands });
};
