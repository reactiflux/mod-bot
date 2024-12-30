import type {
  APIApplicationCommand,
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { ApplicationCommandType } from "discord.js";

import { difference } from "#~/helpers/sets";

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
      json.name === remoteCommand.name &&
      json.type === remoteCommand.type &&
      (json.default_member_permissions ?? null) ===
        (remoteCommand.default_member_permissions ?? null);

    return result;
  }
  if (json.type === ApplicationCommandType.ChatInput || !json.type) {
    const remoteOptions = remoteCommand.options;
    const localOptions = json.options;

    const typeMatches = !json.type || json.type === remoteCommand.type;
    if (!typeMatches) {
      return false;
    }
    const descriptionMatches =
      "description" in json
        ? json.description === remoteCommand.description
        : true;
    if (!descriptionMatches) {
      return false;
    }
    const remoteOptionsMatch = !remoteOptions
      ? true
      : remoteOptions.every((o) =>
          json.options?.some(
            (o2) =>
              o.name === o2.name &&
              o.description === o2.description &&
              o.type === o2.type,
          ),
        );
    if (!remoteOptionsMatch) {
      return false;
    }
    const localOptionsMatch = !localOptions
      ? true
      : localOptions.every((o) =>
          remoteCommand.options?.some(
            (o2) =>
              o.name === o2.name &&
              o.description === o2.description &&
              o.type === o2.type,
          ),
        );
    if (!localOptionsMatch) {
      return false;
    }
    return true;
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
  const toUpdate = localCommands.filter((localCommand) =>
    // Check all necessary fields to see if any changed. User and Message
    // commands don't have a description.
    {
      const dupe = remoteCommands.find((remoteCommand) =>
        compareCommands(localCommand, remoteCommand),
      );
      return !dupe;
    },
  );

  return { toDelete, didCommandsChange: toUpdate.length > 0 };
};
