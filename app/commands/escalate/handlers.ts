import {
  MessageFlags,
  PermissionsBitField,
  type MessageComponentInteraction,
} from "discord.js";

import { hasModRole } from "#~/helpers/discord.js";
import { applyRestriction, ban, kick, timeout } from "#~/models/discord.server";
import {
  createEscalation,
  type VoteTally,
} from "#~/models/escalationVotes.server";
import {
  DEFAULT_QUORUM,
  fetchSettings,
  SETTINGS,
} from "#~/models/guilds.server";
import { deleteAllReportedForUser } from "#~/models/reportedMessages.server";

import { buildVoteButtons, buildVoteMessageContent } from "./strings";

export const EscalationHandlers = {
  // Direct action commands (no voting)
  delete: async (interaction: MessageComponentInteraction) => {
    await interaction.deferReply();
    const reportedUserId = interaction.customId.split("|")[1];
    const guildId = interaction.guildId!;

    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      await interaction.editReply({
        content: "Insufficient permissions",
      });
      return;
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

  kick: async (interaction: MessageComponentInteraction) => {
    const reportedUserId = interaction.customId.split("|")[1];
    const guildId = interaction.guildId!;

    const { moderator: modRoleId } = await fetchSettings(guildId, [
      SETTINGS.moderator,
    ]);

    if (!hasModRole(interaction, modRoleId)) {
      await interaction.reply({
        content: "Insufficient permissions",
        flags: [MessageFlags.Ephemeral],
      });
      return;
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
        flags: [MessageFlags.Ephemeral],
      });
    }
  },

  ban: async (interaction: MessageComponentInteraction) => {
    const reportedUserId = interaction.customId.split("|")[1];
    const guildId = interaction.guildId!;

    const { moderator: modRoleId } = await fetchSettings(guildId, [
      SETTINGS.moderator,
    ]);

    if (!hasModRole(interaction, modRoleId)) {
      await interaction.reply({
        content: "Insufficient permissions",
        flags: [MessageFlags.Ephemeral],
      });
      return;
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
        flags: [MessageFlags.Ephemeral],
      });
    }
  },

  restrict: async (interaction: MessageComponentInteraction) => {
    const reportedUserId = interaction.customId.split("|")[1];
    const guildId = interaction.guildId!;

    const { moderator: modRoleId } = await fetchSettings(guildId, [
      SETTINGS.moderator,
    ]);

    if (!hasModRole(interaction, modRoleId)) {
      await interaction.reply({
        content: "Insufficient permissions",
        flags: [MessageFlags.Ephemeral],
      });
      return;
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
        flags: [MessageFlags.Ephemeral],
      });
    }
  },

  timeout: async (interaction: MessageComponentInteraction) => {
    const reportedUserId = interaction.customId.split("|")[1];
    const guildId = interaction.guildId!;

    const { moderator: modRoleId } = await fetchSettings(guildId, [
      SETTINGS.moderator,
    ]);

    if (!hasModRole(interaction, modRoleId)) {
      await interaction.reply({
        content: "Insufficient permissions",
        flags: [MessageFlags.Ephemeral],
      });
      return;
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
        flags: [MessageFlags.Ephemeral],
      });
    }
  },

  // Escalate button - creates a new vote
  escalate: async (interaction: MessageComponentInteraction) => {
    const reportedUserId = interaction.customId.split("|")[1];
    const guildId = interaction.guildId!;
    const threadId = interaction.channelId;

    // Get settings
    let quorum = DEFAULT_QUORUM;
    let modRoleId: string;
    try {
      const settings = await fetchSettings(guildId, [
        SETTINGS.moderator,
        SETTINGS.quorum,
      ]);
      modRoleId = settings.moderator;
      if (settings.quorum !== undefined && settings.quorum !== null) {
        quorum = settings.quorum;
      }
    } catch {
      const settings = await fetchSettings(guildId, [SETTINGS.moderator]);
      modRoleId = settings.moderator;
    }

    try {
      // Acknowledge immediately
      await interaction.deferReply();

      // Create vote message first (we need its ID for the database)
      const emptyTally: VoteTally = {
        totalVotes: 0,
        byResolution: new Map(),
        leader: null,
        leaderCount: 0,
        isTied: false,
        tiedResolutions: [],
      };

      // Create escalation record
      const escalationId = await createEscalation({
        guildId,
        threadId,
        voteMessageId: interaction.message.id,
        reportedUserId,
        quorum,
      });

      // Now update the message with the real content and buttons
      const createdAt = new Date().toISOString();
      const channel = interaction.channel;
      if (channel && "send" in channel) {
        await channel.send({
          content: buildVoteMessageContent(
            reportedUserId,
            emptyTally,
            quorum,
            createdAt,
          ),
          components: buildVoteButtons(escalationId, emptyTally, false),
        });
      }

      // Send notification
      await interaction.editReply({
        content: `Escalation started. <@&${modRoleId}> please vote on how to handle <@${reportedUserId}>.`,
      });
    } catch (error) {
      console.error("Error creating escalation vote:", error);
      await interaction.editReply({
        content: "Failed to create escalation vote",
      });
    }
  },
};
