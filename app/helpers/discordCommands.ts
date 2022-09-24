import type {
  APIApplicationCommand,
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { ApplicationCommandType } from "discord.js";

import { difference } from "~/helpers/sets";

export const compareCommands = (
  localCommand: ContextMenuCommandBuilder | SlashCommandBuilder,
  remoteCommand: APIApplicationCommand,
): boolean => {
  const json = localCommand.toJSON();
  if (json.name !== remoteCommand.name) {
    return false;
  }

  if (
    json.type === ApplicationCommandType.User ||
    json.type === ApplicationCommandType.Message
  ) {
    const result =
      json.name === remoteCommand.name && json.type === remoteCommand.type;

    console.log({ result });
    return result;
  }
  if (json.type === ApplicationCommandType.ChatInput || !json.type) {
    const hasRemoteOptions =
      "options" in remoteCommand && remoteCommand.options!.length > 0;
    const hasLocalOptions = "options" in json && json.options!.length > 0;

    const typeMatches = !json.type || json.type === remoteCommand.type;
    const descriptionMatches =
      "description" in json
        ? json.description === remoteCommand.description
        : true;
    const remoteOptionsMatch = hasRemoteOptions
      ? remoteCommand.options!.every((o) =>
          json.options?.some(
            (o2) =>
              o.name === o2.name &&
              o.description === o2.description &&
              o.type === o2.type,
          ),
        )
      : true;
    const localOptionsMatch = hasLocalOptions
      ? json.options!.every((o) =>
          remoteCommand.options?.some(
            (o2) =>
              o.name === o2.name &&
              o.description === o2.description &&
              o.type === o2.type,
          ),
        )
      : true;
    console.log({
      typeMatches,
      descriptionMatches,
      remoteOptionsMatch,
      localOptionsMatch,
    });
    const result = Boolean(
      typeMatches &&
        descriptionMatches &&
        remoteOptionsMatch &&
        localOptionsMatch,
    );
    console.log({ result });
    return result;
  }
  throw new Error("Unexpected command type being compared");
};

export const calculateChangedCommands = (
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
  const toUpdate = remoteCommands.filter((remoteCommand) =>
    // Check all necessary fields to see if any changed. User and Message
    // commands don't have a description.
    {
      const dupe = localCommands.find((localCommand) =>
        compareCommands(localCommand, remoteCommand),
      );
      return !dupe;
    },
  );

  console.log({ toUpdate, remoteNames, names });

  return { toDelete, didCommandsChange: toUpdate.length > 0 };
};
