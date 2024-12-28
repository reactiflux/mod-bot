import type { MessageContextMenuCommandInteraction } from "discord.js";
import { PermissionFlagsBits, ContextMenuCommandBuilder } from "discord.js";
import { ApplicationCommandType } from "discord-api-types/v10";
import { ReportReasons, reportUser } from "#~/helpers/modLog";

export const command = new ContextMenuCommandBuilder()
  .setName("Report")
  .setType(ApplicationCommandType.Message)
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

export const handler = async (
  interaction: MessageContextMenuCommandInteraction,
) => {
  const { targetMessage: message } = interaction;

  await reportUser({
    reason: ReportReasons.anonReport,
    message,
    staff: false,
  });

  await interaction.reply({
    ephemeral: true,
    content: "This message has been reported anonymously",
  });
};
