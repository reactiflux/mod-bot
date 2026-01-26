import { randomUUID } from "crypto";
import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import db from "#~/db.server.js";
import { type SlashCommand } from "#~/helpers/discord";
import { featureStats } from "#~/helpers/metrics";

export const Command = {
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

  handler: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: [MessageFlags.Ephemeral],
      });
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
      await interaction.reply({
        content: "Please provide a valid emoji.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    try {
      // Upsert: update if exists, insert if not
      await db
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
        .execute();

      featureStats.reactjiChannelSetup(
        guildId,
        configuredById,
        emoji,
        threshold,
      );

      const thresholdText =
        threshold === 1 ? "" : ` (after ${threshold} reactions)`;
      await interaction.reply({
        content: `Configured by <@${configuredById}>: messages reacted with ${emoji} will be forwarded to this channel${thresholdText}.`,
      });
    } catch (e) {
      console.error("Error configuring reactji channeler:", e);
      await interaction.reply({
        content:
          "Something went wrong while configuring the reactji channeler.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
} as SlashCommand;
