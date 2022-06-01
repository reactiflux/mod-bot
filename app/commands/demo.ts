import { ApplicationCommandType } from "discord-api-types/v10";
import type { MessageContextMenuInteraction } from "discord.js";
import { Message } from "discord.js";

export const name = "demo";
export const description = "TODO: replace everything in here";
export const type = ApplicationCommandType.Message;
export const handler = async (interaction: MessageContextMenuInteraction) => {
  const message = interaction.targetMessage;
  if (!(message instanceof Message)) {
    return;
  }

  await interaction.reply({
    ephemeral: true,
    content: "some shit",
  });
};
