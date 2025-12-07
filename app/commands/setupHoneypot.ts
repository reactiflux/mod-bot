// create slash command that triggers a popup modal to capture:
// - channel (does discord let you select from list?)
// - message to send in channel (provide a default)
// - anything else needed?

import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";

import db from "#~/db.server.js";
import type { AnyCommand } from "#~/helpers/discord.js";

const DEFAULT_MESSAGE_TEXT =
  "This channel is used to catch spambots. Do not send a message in this channel or you will be kicked automatically.";
export const Command = [
  {
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
    handler: async (interaction: ChatInputCommandInteraction) => {
      if (!interaction.guild || !interaction.guildId)
        throw new Error("Interaction has no guild");
      const honeypotChannel = interaction.options.getChannel("channel");
      const messageText =
        interaction.options.getString("message-text") ?? DEFAULT_MESSAGE_TEXT;
      if (!honeypotChannel?.id) {
        await interaction.reply({
          content: `You must provide a channel!`,
        });
        return;
      }
      if (honeypotChannel && honeypotChannel.type !== ChannelType.GuildText) {
        await interaction.reply({
          content: `The channel configured must be a text channel!`,
        });
        return;
      }
      try {
        const castedChannel = honeypotChannel as TextChannel;
        await castedChannel.send(messageText);
        await db
          .insertInto("honeypot_config")
          .values({
            guild_id: interaction.guildId,
            channel_id: honeypotChannel.id,
          })
          .execute();
        await interaction.reply({
          content: "Honeypot setup completed successfully!",
          ephemeral: true,
        });
      } catch (e) {
        console.error(`error:`, e);
        await interaction.reply({
          content: "Failed to setup honeypot. Please try again.",
          ephemeral: true,
        });
      }
    },
  },
] as AnyCommand[];
