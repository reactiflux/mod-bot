import { ApplicationCommandType } from "discord-api-types/v10";
import {
  ContextMenuCommandBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { Effect } from "effect";

import type {
  EffectMessageContextCommand,
  EffectSlashCommand,
  EffectUserContextCommand,
} from "#~/helpers/discord";

export const Command = [
  {
    type: "effect",
    command: new SlashCommandBuilder()
      .setName("demo")
      .setDescription("TODO: replace everything in here"),
    handler: (interaction) =>
      Effect.tryPromise(() =>
        interaction.reply({
          flags: [MessageFlags.Ephemeral],
          content: "ok",
        }),
      ).pipe(Effect.catchAll(() => Effect.void)),
  } satisfies EffectSlashCommand,
  {
    type: "effect",
    command: new ContextMenuCommandBuilder()
      .setName("demo")
      .setType(ApplicationCommandType.User),
    handler: (interaction) =>
      Effect.tryPromise(() =>
        interaction.reply({
          flags: [MessageFlags.Ephemeral],
          content: "ok",
        }),
      ).pipe(Effect.catchAll(() => Effect.void)),
  } satisfies EffectUserContextCommand,
  {
    type: "effect",
    command: new ContextMenuCommandBuilder()
      .setName("demo")
      .setType(ApplicationCommandType.Message),
    handler: (interaction) =>
      Effect.tryPromise(() =>
        interaction.reply({
          flags: [MessageFlags.Ephemeral],
          content: "ok",
        }),
      ).pipe(Effect.catchAll(() => Effect.void)),
  } satisfies EffectMessageContextCommand,
];
