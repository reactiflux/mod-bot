import { InteractionType, PermissionsBitField } from "discord.js";

import type { MessageComponentCommand } from "#~/helpers/discord";
import { applyRestriction, ban, kick, timeout } from "#~/models/discord.server";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";
import { deleteAllReportedForUser } from "#~/models/reportedMessages.server";

export const EscalationCommands = [
  {
    command: {
      type: InteractionType.MessageComponent,
      name: "escalate-delete",
    },
    handler: async (interaction) => {
      await interaction.deferReply();
      const reportedUserId = interaction.customId.split("|")[1];
      const guildId = interaction.guildId!;

      // Permission check
      const member = await interaction.guild!.members.fetch(
        interaction.user.id,
      );
      if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.editReply({
          content: "Insufficient permissions",
        });
      }

      try {
        const result = await deleteAllReportedForUser(reportedUserId, guildId);
        await interaction.editReply(
          `Messages deleted by ${interaction.user.username} (${result.deleted}/${result.total} successful)`,
        );
      } catch (error) {
        console.error("Error deleting reported messages:", error);
        await interaction.editReply({
          content: "Failed to delete messages",
        });
      }
    },
  },

  {
    command: { type: InteractionType.MessageComponent, name: "escalate-kick" },
    handler: async (interaction) => {
      const reportedUserId = interaction.customId.split("|")[1];
      const guildId = interaction.guildId!;

      // Get moderator role for permission check
      const { moderator: modRoleId } = await fetchSettings(guildId, [
        SETTINGS.moderator,
      ]);

      const member = interaction.member;
      if (
        !member ||
        (Array.isArray(member.roles)
          ? !member.roles.includes(modRoleId)
          : !member.roles.cache.has(modRoleId))
      ) {
        return interaction.reply({
          content: "Insufficient permissions",
          ephemeral: true,
        });
      }

      try {
        const reportedMember =
          await interaction.guild!.members.fetch(reportedUserId);
        await Promise.allSettled([
          kick(reportedMember),
          interaction.reply(
            `<@${reportedUserId}> kicked by ${interaction.user.username}`,
          ),
        ]);
      } catch (error) {
        console.error("Error kicking user:", error);
        await interaction.reply({
          content: "Failed to kick user",
          ephemeral: true,
        });
      }
    },
  },

  {
    command: { type: InteractionType.MessageComponent, name: "escalate-ban" },
    handler: async (interaction) => {
      const reportedUserId = interaction.customId.split("|")[1];
      const guildId = interaction.guildId!;

      // Get moderator role for permission check
      const { moderator: modRoleId } = await fetchSettings(guildId, [
        SETTINGS.moderator,
      ]);

      const member = interaction.member;
      if (
        !member ||
        (Array.isArray(member.roles)
          ? !member.roles.includes(modRoleId)
          : !member.roles.cache.has(modRoleId))
      ) {
        return interaction.reply({
          content: "Insufficient permissions",
          ephemeral: true,
        });
      }

      try {
        const reportedMember =
          await interaction.guild!.members.fetch(reportedUserId);
        await Promise.allSettled([
          ban(reportedMember),
          interaction.reply(
            `<@${reportedUserId}> banned by ${interaction.user.username}`,
          ),
        ]);
      } catch (error) {
        console.error("Error banning user:", error);
        await interaction.reply({
          content: "Failed to ban user",
          ephemeral: true,
        });
      }
    },
  },

  {
    command: {
      type: InteractionType.MessageComponent,
      name: "escalate-restrict",
    },
    handler: async (interaction) => {
      const reportedUserId = interaction.customId.split("|")[1];
      const guildId = interaction.guildId!;

      // Get moderator role for permission check
      const { moderator: modRoleId } = await fetchSettings(guildId, [
        SETTINGS.moderator,
      ]);

      const member = interaction.member;
      if (
        !member ||
        (Array.isArray(member.roles)
          ? !member.roles.includes(modRoleId)
          : !member.roles.cache.has(modRoleId))
      ) {
        return interaction.reply({
          content: "Insufficient permissions",
          ephemeral: true,
        });
      }

      try {
        const reportedMember =
          await interaction.guild!.members.fetch(reportedUserId);
        await Promise.allSettled([
          applyRestriction(reportedMember),
          interaction.reply(
            `<@${reportedUserId}> restricted by ${interaction.user.username}`,
          ),
        ]);
      } catch (error) {
        console.error("Error restricting user:", error);
        await interaction.reply({
          content: "Failed to restrict user",
          ephemeral: true,
        });
      }
    },
  },

  {
    command: {
      type: InteractionType.MessageComponent,
      name: "escalate-timeout",
    },
    handler: async (interaction) => {
      const reportedUserId = interaction.customId.split("|")[1];
      const guildId = interaction.guildId!;

      // Get moderator role for permission check
      const { moderator: modRoleId } = await fetchSettings(guildId, [
        SETTINGS.moderator,
      ]);

      const member = interaction.member;
      if (
        !member ||
        (Array.isArray(member.roles)
          ? !member.roles.includes(modRoleId)
          : !member.roles.cache.has(modRoleId))
      ) {
        return interaction.reply({
          content: "Insufficient permissions",
          ephemeral: true,
        });
      }

      try {
        const reportedMember =
          await interaction.guild!.members.fetch(reportedUserId);
        await Promise.allSettled([
          timeout(reportedMember),
          interaction.reply(
            `<@${reportedUserId}> timed out by ${interaction.user.username}`,
          ),
        ]);
      } catch (error) {
        console.error("Error timing out user:", error);
        await interaction.reply({
          content: "Failed to timeout user",
          ephemeral: true,
        });
      }
    },
  },

  {
    command: {
      type: InteractionType.MessageComponent,
      name: "escalate-escalate",
    },
    handler: async (interaction) => {
      const guildId = interaction.guildId!;

      // Get moderator role for mentions
      const { moderator: modRoleId } = await fetchSettings(guildId, [
        SETTINGS.moderator,
      ]);

      try {
        const member = await interaction.guild!.members.fetch(
          interaction.user.id,
        );

        await Promise.all([
          interaction.channel && "send" in interaction.channel
            ? interaction.channel.send(
                `Report escalated by <@${member.id}>, <@&${modRoleId}> please respond.`,
              )
            : Promise.resolve(),
          interaction.reply({
            content: `Report escalated successfully`,
            ephemeral: true,
          }),
        ]);

        // Note: The full escalate() function with ModResponse voting would need
        // more complex refactoring to work without Reacord. For now, this provides
        // basic escalation notification functionality.
      } catch (error) {
        console.error("Error escalating report:", error);
        await interaction.reply({
          content: "Failed to escalate report",
          ephemeral: true,
        });
      }
    },
  },
] as MessageComponentCommand[];
