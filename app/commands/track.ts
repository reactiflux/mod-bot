import { ApplicationCommandType } from "discord-api-types/v10";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContextMenuCommandBuilder,
  InteractionType,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { Effect } from "effect";

import { logUserMessageLegacy } from "#~/commands/report/userLog.ts";
import { DatabaseLayer } from "#~/Database.ts";
import { client } from "#~/discord/client.server";
import { logEffect } from "#~/effects/observability.ts";
import type {
  EffectMessageComponentCommand,
  EffectMessageContextCommand,
} from "#~/helpers/discord";
import { featureStats } from "#~/helpers/metrics";
import {
  getReportById,
  markMessageAsDeleted,
  ReportReasons,
} from "#~/models/reportedMessages";

export const Command = [
  {
    type: "effect",
    command: new ContextMenuCommandBuilder()
      .setName("Track")
      .setType(ApplicationCommandType.Message)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    handler: (interaction) =>
      Effect.gen(function* () {
        // Defer immediately to avoid 3-second timeout - creating threads can take time
        yield* Effect.tryPromise(() =>
          interaction.deferReply({ flags: [MessageFlags.Ephemeral] }),
        );

        const { targetMessage: message, user } = interaction;

        if (interaction.guildId) {
          featureStats.userTracked(
            interaction.guildId,
            user.id,
            message.author.id,
          );
        }

        const { reportId, thread } = yield* Effect.tryPromise(() =>
          logUserMessageLegacy({
            reason: ReportReasons.track,
            message,
            staff: user,
          }),
        );

        yield* Effect.tryPromise(() =>
          interaction.editReply({
            content: `Tracked <#${thread.id}>`,
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
          }),
        );
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* logEffect("error", "Track", "Error tracking message", {
              error,
            });
            yield* Effect.tryPromise(() =>
              interaction.editReply({ content: "Failed to track message" }),
            ).pipe(Effect.catchAll(() => Effect.void));
          }),
        ),
      ),
  } satisfies EffectMessageContextCommand,
  {
    type: "effect",
    command: { type: InteractionType.MessageComponent, name: "delete-tracked" },
    handler: (interaction) =>
      Effect.gen(function* () {
        const [, reportId] = interaction.customId.split("|");

        const report = yield* getReportById(reportId).pipe(
          Effect.provide(DatabaseLayer),
        );

        if (!report) {
          yield* Effect.tryPromise(() =>
            interaction.update({
              content: "Report not found",
              components: [],
            }),
          );
          return;
        }

        // Try to delete the original message (may already be deleted)
        yield* Effect.tryPromise(async () => {
          const channel = await client.channels.fetch(
            report.reported_channel_id,
          );
          if (channel && "messages" in channel) {
            const originalMessage = await channel.messages.fetch(
              report.reported_message_id,
            );
            await originalMessage.delete();
          }
        }).pipe(Effect.catchAll(() => Effect.void));

        yield* markMessageAsDeleted(
          report.reported_message_id,
          report.guild_id,
        ).pipe(Effect.provide(DatabaseLayer));

        // Update the log message to show deletion (may not be accessible)
        yield* Effect.tryPromise(async () => {
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
        }).pipe(Effect.catchAll(() => Effect.void));

        yield* Effect.tryPromise(() =>
          interaction.update({
            content: `Tracked <#${report.log_channel_id}>`,
            components: [],
          }),
        );
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* logEffect(
              "error",
              "Track",
              "Error deleting tracked message",
              {
                error,
              },
            );
            yield* Effect.tryPromise(() =>
              interaction.update({
                content: "Failed to delete message",
                components: [],
              }),
            ).pipe(Effect.catchAll(() => Effect.void));
          }),
        ),
      ),
  } satisfies EffectMessageComponentCommand,
];
