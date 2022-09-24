import type { CommandInteraction } from "discord.js";
import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
} from "discord.js";

export const command = new SlashCommandBuilder()
  .setName("demo")
  .setDescription("TODO: replace everything in here");

export const handler = async (interaction: CommandInteraction) => {
  await interaction.reply({
    ephemeral: true,
    content: "ok",
  });
};

export const UserCommand = new ContextMenuCommandBuilder()
  .setName("demo")
  .setType(ApplicationCommandType.User);
export const MessageCommand = new ContextMenuCommandBuilder()
  .setName("demo")
  .setType(ApplicationCommandType.Message);
