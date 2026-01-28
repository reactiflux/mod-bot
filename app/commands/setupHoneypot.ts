import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type TextChannel,
} from "discord.js";
import { Effect } from "effect";

import db from "#~/db.server.js";
import { logEffect } from "#~/effects/observability.ts";
import type { EffectSlashCommand } from "#~/helpers/discord.js";
import { featureStats } from "#~/helpers/metrics";

const DEFAULT_MESSAGE_TEXT =
  "This channel is used to catch spambots. Do not send a message in this channel or you will be kicked automatically.";

export const Command = [
  {
    type: "effect",
    command: new SlashCommandBuilder()
      .setName("honeypot-setup")
      .addChannelOption((o) => {
        o.setName("channel");
        o.setDescription(
          "Which channel (if not this one) should be used for the honeypot?",
        );
        return o;
      })
      .addStringOption((o) => {
        o.setName("message-text");
        o.setDescription(
          `What should the message in the channel say? If left blank, it will provide a default`,
        );
        return o;
      })
      .setDescription("Set up a trap channel for spam bots")
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator,
      ) as SlashCommandBuilder,

    handler: (interaction) =>
      Effect.gen(function* () {
        if (!interaction.guild || !interaction.guildId) {
          yield* Effect.fail(new Error("Interaction has no guild"));
          return;
        }

        const honeypotChannel =
          interaction.options.getChannel("channel") ?? interaction.channel;
        const messageText =
          interaction.options.getString("message-text") ?? DEFAULT_MESSAGE_TEXT;

        if (!honeypotChannel?.id) {
          yield* Effect.tryPromise(() =>
            interaction.reply({
              content: `You must provide a channel!`,
            }),
          );
          return;
        }

        if (honeypotChannel.type !== ChannelType.GuildText) {
          yield* Effect.tryPromise(() =>
            interaction.reply({
              content: `The channel configured must be a text channel!`,
            }),
          );
          return;
        }

        const castedChannel = honeypotChannel as TextChannel;
        const result = yield* Effect.tryPromise(() =>
          db
            .insertInto("honeypot_config")
            .values({
              guild_id: interaction.guildId!,
              channel_id: honeypotChannel.id,
            })
            .onConflict((c) => c.doNothing())
            .execute(),
        );

        if ((result[0].numInsertedOrUpdatedRows ?? 0) > 0) {
          yield* Effect.tryPromise(() => castedChannel.send(messageText));
          featureStats.honeypotSetup(
            interaction.guildId,
            interaction.user.id,
            honeypotChannel.id,
          );
        }

        yield* Effect.tryPromise(() =>
          interaction.reply({
            content: "Honeypot setup completed successfully!",
            flags: [MessageFlags.Ephemeral],
          }),
        );
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* logEffect(
              "error",
              "HoneypotSetup",
              "Error during honeypot action",
              {
                error: String(error),
              },
            );

            yield* Effect.tryPromise(() =>
              interaction.reply({
                content: "Failed to setup honeypot. Please try again.",
                flags: [MessageFlags.Ephemeral],
              }),
            ).pipe(Effect.catchAll(() => Effect.void));
          }),
        ),
        Effect.withSpan("honeypotSetupCommand", {
          attributes: {
            guildId: interaction.guildId,
            userId: interaction.user.id,
          },
        }),
      ),
  } satisfies EffectSlashCommand,
];
