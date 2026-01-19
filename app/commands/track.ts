import { ApplicationCommandType } from "discord-api-types/v10";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContextMenuCommandBuilder,
  InteractionType,
  PermissionFlagsBits,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import { Effect } from "effect";

import { logUserMessageLegacy } from "#~/commands/report/userLog.ts";
import { DatabaseServiceLive } from "#~/Database.ts";
import { client } from "#~/discord/client.server";
import { runEffect } from "#~/effects/runtime.ts";
import type {
  MessageComponentCommand,
  MessageContextCommand,
} from "#~/helpers/discord";
import { featureStats } from "#~/helpers/metrics";
import {
  getReportById,
  markMessageAsDeleted,
  ReportReasons,
} from "#~/models/reportedMessages";

export const Command = [
  {
    command: new ContextMenuCommandBuilder()
      .setName("Track")
      .setType(ApplicationCommandType.Message)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    handler: async (interaction: MessageContextMenuCommandInteraction) => {
      const { targetMessage: message, user } = interaction;

      if (interaction.guildId) {
        featureStats.userTracked(
          interaction.guildId,
          user.id,
          message.author.id,
        );
      }

      const { reportId, thread } = await logUserMessageLegacy({
        reason: ReportReasons.track,
        message,
        staff: user,
      });

      await interaction.reply({
        content: `Tracked <#${thread.id}>`,
        ephemeral: true,
        components: reportId
          ? [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`delete-tracked|${reportId}`)
                  .setLabel("Delete message")
                  .setStyle(ButtonStyle.Danger),
              ),
            ]
          : [],
      });
    },
  } as MessageContextCommand,
  {
    command: { type: InteractionType.MessageComponent, name: "delete-tracked" },
    handler: async (
      interaction: MessageComponentCommand["handler"] extends (
        i: infer I,
      ) => unknown
        ? I
        : never,
    ) => {
      const [, reportId] = interaction.customId.split("|");

      const report = await runEffect(
        Effect.provide(getReportById(reportId), DatabaseServiceLive),
      );

      if (!report) {
        await interaction.update({
          content: "Report not found",
          components: [],
        });
        return;
      }

      try {
        const channel = await client.channels.fetch(report.reported_channel_id);
        if (channel && "messages" in channel) {
          const originalMessage = await channel.messages.fetch(
            report.reported_message_id,
          );
          await originalMessage.delete();
        }
      } catch {
        // Message may already be deleted, that's fine
      }

      await runEffect(
        Effect.provide(
          markMessageAsDeleted(report.reported_message_id, report.guild_id),
          DatabaseServiceLive,
        ),
      );

      // Update the log message to show deletion
      try {
        const logChannel = await client.channels.fetch(report.log_channel_id);
        if (logChannel && "messages" in logChannel) {
          const logMessage = await logChannel.messages.fetch(
            report.log_message_id,
          );
          await logMessage.reply({
            allowedMentions: { users: [] },
            content: `deleted by ${interaction.user.username}`,
          });
        }
      } catch {
        // Log message may not be accessible
      }

      await interaction.update({
        content: `Tracked <#${report.log_channel_id}>`,
        components: [],
      });
    },
  } as MessageComponentCommand,
];
