import { ApplicationCommandType } from "discord-api-types/v10";
import {
  ContextMenuCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type MessageContextMenuCommandInteraction,
} from "discord.js";

import { logUserMessageLegacy } from "#~/commands/report/userLog.ts";
import { commandStats } from "#~/helpers/metrics";
import { log, trackPerformance } from "#~/helpers/observability";
import { ReportReasons } from "#~/models/reportedMessages.ts";

const command = new ContextMenuCommandBuilder()
  .setName("Report")
  .setType(ApplicationCommandType.Message)
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

const handler = async (interaction: MessageContextMenuCommandInteraction) => {
  // Defer immediately to avoid 3-second timeout - creating threads can take time
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  await trackPerformance(
    "reportCommand",
    async () => {
      const { targetMessage: message } = interaction;

      log("info", "Commands", "Report command executed", {
        guildId: interaction.guildId,
        reporterUserId: interaction.user.id,
        targetUserId: message.author.id,
        targetMessageId: message.id,
        channelId: interaction.channelId,
      });

      try {
        await logUserMessageLegacy({
          reason: ReportReasons.anonReport,
          message,
          staff: false,
        });

        log("info", "Commands", "Report submitted successfully", {
          guildId: interaction.guildId,
          reporterUserId: interaction.user.id,
          targetUserId: message.author.id,
          targetMessageId: message.id,
          reason: ReportReasons.anonReport,
        });

        // Track successful report in business analytics
        commandStats.reportSubmitted(interaction, message.author.id);

        // Track command success
        commandStats.commandExecuted(interaction, "report", true);

        await interaction.editReply({
          content: "This message has been reported anonymously",
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        log("error", "Commands", "Report command failed", {
          guildId: interaction.guildId,
          reporterUserId: interaction.user.id,
          targetUserId: message.author.id,
          targetMessageId: message.id,
          error: err.message,
          stack: err.stack,
        });

        // Track command failure in business analytics
        commandStats.commandFailed(interaction, "report", err.message);

        await interaction.editReply({
          content: "Failed to submit report. Please try again later.",
        });
      }
    },
    {
      commandName: "report",
      guildId: interaction.guildId,
      reporterUserId: interaction.user.id,
      targetUserId: interaction.targetMessage.author.id,
    },
  );
};

export const Command = { handler, command };
