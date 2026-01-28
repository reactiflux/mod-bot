import { randomUUID } from "crypto";
import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { Effect } from "effect";

import db from "#~/db.server.js";
import { logEffect } from "#~/effects/observability.ts";
import type { EffectSlashCommand } from "#~/helpers/discord";
import { featureStats } from "#~/helpers/metrics";

export const Command = {
  type: "effect",
  command: new SlashCommandBuilder()
    .setName("setup-reactji-channel")
    .addStringOption((o) => {
      o.setName("emoji");
      o.setDescription(
        "The emoji that will trigger forwarding to this channel",
      );
      o.setRequired(true);
      return o;
    })
    .addIntegerOption((o) => {
      o.setName("threshold");
      o.setDescription(
        "How many reactions are needed to trigger forwarding (default: 1)",
      );
      o.setMinValue(1);
      o.setRequired(false);
      return o;
    })
    .setDescription(
      "Configure an emoji to forward reacted messages to this channel",
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator,
    ) as SlashCommandBuilder,

  handler: (interaction) =>
    Effect.gen(function* () {
      if (!interaction.guild) {
        yield* Effect.tryPromise(() =>
          interaction.reply({
            content: "This command can only be used in a server.",
            flags: [MessageFlags.Ephemeral],
          }),
        );
        return;
      }

      const emojiInput = interaction.options.getString("emoji", true);
      const threshold = interaction.options.getInteger("threshold") ?? 1;
      const channelId = interaction.channelId;
      const guildId = interaction.guild.id;
      const configuredById = interaction.user.id;

      // Parse the emoji - handle both unicode and custom emoji formats
      // Custom emojis come in as <:name:id> or <a:name:id> for animated
      const customEmojiRegex = /^<a?:(\w+):(\d+)>$/;
      const emoji = customEmojiRegex.exec(emojiInput)
        ? emojiInput
        : emojiInput.trim();

      if (!emoji) {
        yield* Effect.tryPromise(() =>
          interaction.reply({
            content: "Please provide a valid emoji.",
            flags: [MessageFlags.Ephemeral],
          }),
        );
        return;
      }

      // Upsert: update if exists, insert if not
      yield* Effect.tryPromise(() =>
        db
          .insertInto("reactji_channeler_config")
          .values({
            id: randomUUID(),
            guild_id: guildId,
            channel_id: channelId,
            emoji,
            configured_by_id: configuredById,
            threshold,
          })
          .onConflict((oc) =>
            oc.columns(["guild_id", "emoji"]).doUpdateSet({
              channel_id: channelId,
              configured_by_id: configuredById,
              threshold,
            }),
          )
          .execute(),
      );

      featureStats.reactjiChannelSetup(
        guildId,
        configuredById,
        emoji,
        threshold,
      );

      const thresholdText =
        threshold === 1 ? "" : ` (after ${threshold} reactions)`;
      yield* Effect.tryPromise(() =>
        interaction.reply({
          content: `Configured by <@${configuredById}>: messages reacted with ${emoji} will be forwarded to this channel${thresholdText}.`,
        }),
      );
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* logEffect(
            "error",
            "Commands",
            "Error configuring reactji channeler",
            { error: String(error) },
          );

          yield* Effect.tryPromise(() =>
            interaction.reply({
              content:
                "Something went wrong while configuring the reactji channeler.",
              flags: [MessageFlags.Ephemeral],
            }),
          ).pipe(Effect.catchAll(() => Effect.void));
        }),
      ),
      Effect.withSpan("setupReactjiChannelCommand", {
        attributes: {
          guildId: interaction.guildId,
          userId: interaction.user.id,
          channelId: interaction.channelId,
        },
      }),
    ),
} satisfies EffectSlashCommand;
