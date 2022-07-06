import { ContextMenuCommandBuilder } from "@discordjs/builders";
import { ApplicationCommandType } from "discord-api-types/v10";
import type { MessageContextMenuInteraction } from "discord.js";
import { Message } from "discord.js";
import { ReportReasons, reportUser } from "../helpers/modLog";

export default new ContextMenuCommandBuilder()
  .setName("Report")
  .setType(ApplicationCommandType.Message);

export const handler = async (interaction: MessageContextMenuInteraction) => {
  const message = interaction.targetMessage;
  if (!(message instanceof Message)) {
    return;
  }

  await reportUser({ reason: ReportReasons.anonReport, message });

  await interaction.reply({
    ephemeral: true,
    content: "This message has been reported anonymously",
  });
};
