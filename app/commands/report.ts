import type { MessageContextMenuCommandInteraction } from "discord.js";
import { PermissionFlagsBits, ContextMenuCommandBuilder } from "discord.js";
import { ApplicationCommandType } from "discord-api-types/v10";
import { reportUser } from "#~/helpers/modLog";
import { ReportReasons } from "#~/models/reportedMessages.server";
import { log, trackPerformance } from "#~/helpers/observability";
import { commandStats } from "#~/helpers/metrics";

const command = new ContextMenuCommandBuilder()
  .setName("Report")
  .setType(ApplicationCommandType.Message)
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

const handler = async (interaction: MessageContextMenuCommandInteraction) => {
  await trackPerformance(
    "reportCommand",
    async () => {
      const { targetMessage: message } = interaction;

      log("info", "Commands", "Report command executed", {
        guildId: interaction.guildId,
        reporterUserId: interaction.user.id,
        targetUserId: message.author?.id,
        targetMessageId: message.id,
        channelId: interaction.channelId,
      });

      try {
        await reportUser({
          reason: ReportReasons.anonReport,
          message,
          staff: false,
        });

        log("info", "Commands", "Report submitted successfully", {
          guildId: interaction.guildId,
          reporterUserId: interaction.user.id,
          targetUserId: message.author?.id,
          targetMessageId: message.id,
          reason: ReportReasons.anonReport,
        });

        // Track successful report in business analytics
        commandStats.reportSubmitted(
          interaction,
          message.author?.id ?? "unknown",
        );

        // Track command success
        commandStats.commandExecuted(interaction, "report", true);

        await interaction.reply({
          ephemeral: true,
          content: "This message has been reported anonymously",
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        log("error", "Commands", "Report command failed", {
          guildId: interaction.guildId,
          reporterUserId: interaction.user.id,
          targetUserId: message.author?.id,
          targetMessageId: message.id,
          error: err.message,
          stack: err.stack,
        });

        // Track command failure in business analytics
        commandStats.commandFailed(interaction, "report", err.message);

        await interaction.reply({
          ephemeral: true,
          content: "Failed to submit report. Please try again later.",
        });
      }
    },
    {
      commandName: "report",
      guildId: interaction.guildId,
      reporterUserId: interaction.user.id,
      targetUserId: interaction.targetMessage.author?.id,
    },
  );
};

export const Command = { handler, command };
