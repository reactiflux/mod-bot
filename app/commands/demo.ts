import { ApplicationCommandType } from "discord-api-types/v10";
import {
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
  type CommandInteraction,
} from "discord.js";

export const command = new SlashCommandBuilder()
  .setName("demo")
  .setDescription("TODO: replace everything in here");

export const handler = async (interaction: CommandInteraction) => {
  await interaction.reply({
    flags: "Ephemeral",
    content: "ok",
  });
};

export const UserCommand = new ContextMenuCommandBuilder()
  .setName("demo")
  .setType(ApplicationCommandType.User);
export const MessageCommand = new ContextMenuCommandBuilder()
  .setName("demo")
  .setType(ApplicationCommandType.Message);
