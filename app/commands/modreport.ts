import { PermissionFlagsBits, SlashCommandBuilder, time } from "discord.js";
import { Effect } from "effect";

import {
  interactionDeferReply,
  interactionEditReply,
} from "#~/effects/discordSdk.ts";
import { logEffect } from "#~/effects/observability.ts";
import type { SlashCommand } from "#~/helpers/discord";
import { commandStats } from "#~/helpers/metrics";
import { getUserReportSummary } from "#~/models/reportedMessages";
import { getUserThread } from "#~/models/userThreads";

const parseDate = (value: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const Command = {
  command: new SlashCommandBuilder()
    .setName("modreport")
    .setDescription("Show a summary of a user's moderation history")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((x) =>
      x.setName("user").setDescription("The user to look up").setRequired(true),
    ) as SlashCommandBuilder,

  handler: (interaction) =>
    Effect.gen(function* () {
      yield* interactionDeferReply(interaction);

      const targetUser = interaction.options.getUser("user", true);
      const guildId = interaction.guildId;

      if (!guildId) {
        yield* interactionEditReply(interaction, {
          content: "This command can only be used in a server.",
        });
        return;
      }

      yield* logEffect("info", "Commands", "Modreport command executed", {
        guildId,
        userId: interaction.user.id,
        targetUserId: targetUser.id,
      });

      const [summary, userThread] = yield* Effect.all([
        getUserReportSummary(targetUser.id, guildId),
        getUserThread(targetUser.id, guildId),
      ]);

      if (summary.reportCount === 0) {
        yield* interactionEditReply(interaction, {
          content: `No moderation reports found for <@${targetUser.id}>.`,
          allowedMentions: { users: [] },
        });
        commandStats.commandExecuted(interaction, "modreport", true);
        return;
      }

      const lines: string[] = [];

      const anonPart =
        summary.anonymousCount > 0
          ? ` (${summary.anonymousCount} anonymously)`
          : "";
      lines.push(
        `<@${targetUser.id}> has had ${summary.uniqueMessages} message${summary.uniqueMessages === 1 ? "" : "s"} reported ${summary.reportCount} time${summary.reportCount === 1 ? "" : "s"}${anonPart} across ${summary.uniqueChannels} channel${summary.uniqueChannels === 1 ? "" : "s"}`,
      );

      // Line 2: First reported <date>; most recently <date>. Most reports in a single day was K.
      const firstDate = parseDate(summary.firstReport);
      const lastDate = parseDate(summary.lastReport);
      if (firstDate && lastDate) {
        const peakPart =
          summary.peakDayCount > 1
            ? `. Most reports in a single day was ${summary.peakDayCount}`
            : "";
        if (summary.reportCount === 1) {
          lines.push(`Reported ${time(firstDate, "R")}${peakPart}`);
        } else {
          lines.push(
            `First reported ${time(firstDate, "D")}; most recently ${time(lastDate, "R")}${peakPart}`,
          );
        }
      }

      // Line 3: thread link as subtext
      if (userThread) {
        lines.push(`-# <#${userThread.thread_id}>`);
      }

      yield* interactionEditReply(interaction, {
        content: lines.join("\n"),
        allowedMentions: { users: [] },
      });

      commandStats.commandExecuted(interaction, "modreport", true);
    }).pipe(
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          const err = error instanceof Error ? error : new Error(String(error));

          yield* logEffect("error", "Commands", "Modreport command failed", {
            guildId: interaction.guildId,
            userId: interaction.user.id,
            error: err,
          });

          commandStats.commandFailed(interaction, "modreport", err.message);

          yield* interactionEditReply(interaction, {
            content: "Failed to fetch moderation summary.",
          }).pipe(Effect.catchAll(() => Effect.void));
        }),
      ),
      Effect.withSpan("modreportCommand", {
        attributes: {
          guildId: interaction.guildId,
          userId: interaction.user.id,
        },
      }),
    ),
} satisfies SlashCommand;
