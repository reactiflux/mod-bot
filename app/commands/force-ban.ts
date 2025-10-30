import { ApplicationCommandType } from "discord-api-types/v10";
import {
  ContextMenuCommandBuilder,
  PermissionFlagsBits,
  type UserContextMenuCommandInteraction,
} from "discord.js";

import { commandStats } from "#~/helpers/metrics";
import { log, trackPerformance } from "#~/helpers/observability";

const command = new ContextMenuCommandBuilder()
  .setName("Force Ban")
  .setType(ApplicationCommandType.User)
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

const handler = async (interaction: UserContextMenuCommandInteraction) => {
  await trackPerformance(
    "forceBanCommand",
    async () => {
      const { targetUser } = interaction;

      log("info", "Commands", "Force ban command executed", {
        guildId: interaction.guildId,
        moderatorUserId: interaction.user.id,
        targetUserId: targetUser.id,
        targetUsername: targetUser.username,
      });

      const { bans } = interaction.guild ?? {};

      if (!bans) {
        log("error", "Commands", "No guild found on force ban interaction", {
          guildId: interaction.guildId,
          moderatorUserId: interaction.user.id,
          targetUserId: targetUser.id,
        });

        commandStats.commandFailed(interaction, "force-ban", "No guild found");

        await interaction.reply({
          ephemeral: true,
          content: "Failed to ban user, couldn't find guild",
        });
        return;
      }

      try {
        await interaction.guild?.bans.create(targetUser, {
          reason: "Force banned by staff",
        });

        log("info", "Commands", "User force banned successfully", {
          guildId: interaction.guildId,
          moderatorUserId: interaction.user.id,
          targetUserId: targetUser.id,
          targetUsername: targetUser.username,
          reason: "Force banned by staff",
        });

        commandStats.commandExecuted(interaction, "force-ban", true);

        await interaction.reply({
          ephemeral: true,
          content: "This member has been banned",
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        log("error", "Commands", "Force ban failed", {
          guildId: interaction.guildId,
          moderatorUserId: interaction.user.id,
          targetUserId: targetUser.id,
          targetUsername: targetUser.username,
          error: err.message,
          stack: err.stack,
        });

        commandStats.commandFailed(interaction, "force-ban", err.message);

        await interaction.reply({
          ephemeral: true,
          content:
            "Failed to ban user, try checking the bot's permissions. If they look okay, make sure that the bot's role is near the top of the roles list — bots can't ban users with roles above their own.",
        });
      }
    },
    {
      commandName: "force-ban",
      guildId: interaction.guildId,
      moderatorUserId: interaction.user.id,
      targetUserId: interaction.targetUser.id,
    },
  );
};

export const Command = { handler, command };
