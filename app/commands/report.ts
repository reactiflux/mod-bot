import type { MessageContextMenuCommandInteraction } from "discord.js";
import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  Message,
} from "discord.js";
import { ReportReasons, reportUser } from "~/helpers/modLog";

export const command = new ContextMenuCommandBuilder()
  .setName("Report")
  .setType(ApplicationCommandType.Message);

export const handler = async (
  interaction: MessageContextMenuCommandInteraction,
) => {
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
