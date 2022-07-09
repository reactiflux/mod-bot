import { Message } from "discord.js";
import type { MessageContextMenuInteraction } from "discord.js";
import { ContextMenuCommandBuilder } from "@discordjs/builders";
import { ApplicationCommandType } from "discord-api-types/v10";

import { ReportReasons, reportUser } from "~/helpers/modLog";

export default new ContextMenuCommandBuilder()
  .setName("Track")
  .setType(ApplicationCommandType.Message);

export const handler = async (interaction: MessageContextMenuInteraction) => {
  const { targetMessage: message, member } = interaction;
  if (!(message instanceof Message) || !member) {
    return;
  }

  await reportUser({
    reason: ReportReasons.track,
    message,
    staff: [member],
  });

  await interaction.reply({ ephemeral: true, content: "Tracked" });
};
