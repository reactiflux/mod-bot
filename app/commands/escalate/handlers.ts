import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionsBitField,
  type MessageComponentInteraction,
} from "discord.js";

import { executeResolution } from "#~/discord/escalationResolver.js";
import { hasModRole } from "#~/helpers/discord.js";
import { parseFlags } from "#~/helpers/escalationVotes.js";
import type { Features } from "#~/helpers/featuresFlags.js";
import {
  humanReadableResolutions,
  type Resolution,
} from "#~/helpers/modResponse";
import { log } from "#~/helpers/observability";
import { applyRestriction, ban, kick, timeout } from "#~/models/discord.server";
import {
  createEscalation,
  getEscalation,
  getVotesForEscalation,
  recordVote,
  resolveEscalation,
} from "#~/models/escalationVotes.server";
import {
  DEFAULT_QUORUM,
  fetchSettings,
  SETTINGS,
} from "#~/models/guilds.server";
import { deleteAllReportedForUser } from "#~/models/reportedMessages.server";

import {
  buildConfirmedMessageContent,
  buildVoteButtons,
  buildVoteMessageContent,
  buildVotesListContent,
} from "./strings";
import { tallyVotes, type VoteTally } from "./voting";

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
      log("error", "EscalationHandlers", "Error deleting reported messages", {
        error: error instanceof Error ? error.message : String(error),
      });
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
      log("error", "EscalationHandlers", "Error kicking user", {
        error: error instanceof Error ? error.message : String(error),
      });
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
      log("error", "EscalationHandlers", "Error banning user", {
        error: error instanceof Error ? error.message : String(error),
      });
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
      log("error", "EscalationHandlers", "Error restricting user", {
        error: error instanceof Error ? error.message : String(error),
      });
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
      log("error", "EscalationHandlers", "Error timing out user", {
        error: error instanceof Error ? error.message : String(error),
      });
      await interaction.reply({
        content: "Failed to timeout user",
        flags: [MessageFlags.Ephemeral],
      });
    }
  },

  expedite: async (interaction: MessageComponentInteraction): Promise<void> => {
    const escalationId = interaction.customId.split("|")[1];
    const guildId = interaction.guildId!;
    const expeditedBy = interaction.user.id;

    // Get settings and check mod role
    const { moderator: modRoleId } = await fetchSettings(guildId, [
      SETTINGS.moderator,
    ]);

    if (!hasModRole(interaction, modRoleId)) {
      await interaction.reply({
        content: "Only moderators can expedite resolutions.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    // Get escalation
    const escalation = await getEscalation(escalationId);
    if (!escalation) {
      await interaction.reply({
        content: "Escalation not found.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    if (escalation.resolved_at) {
      await interaction.reply({
        content: "This escalation has already been resolved.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    // Get current votes and determine the leading resolution
    const votes = await getVotesForEscalation(escalationId);
    const tally = tallyVotes(votes);

    if (!tally.leader) {
      await interaction.reply({
        content: "Cannot expedite: no clear leading resolution.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    // Execute the resolution
    await interaction.deferUpdate();
    try {
      await executeResolution(tally.leader, escalation, interaction.guild!);

      await resolveEscalation(escalationId, tally.leader);
      const expediteNote = expeditedBy
        ? `\nResolved early by <@${expeditedBy}> at <t:${Math.floor(Date.now() / 1000)}:f>`
        : "";
      await interaction.message.edit({
        content: `**${humanReadableResolutions[tally.leader]}** ✅ <@${escalation.reported_user_id}>${expediteNote}
${buildVotesListContent(tally)}`,
        components: [], // Remove buttons
      });
    } catch (error) {
      log("error", "Expedite failed", JSON.stringify({ error }));
      await interaction.editReply(
        "Something went wrong while executing the resolution",
      );
    }
  },

  vote: (resolution: Resolution) =>
    async function handleVote(
      interaction: MessageComponentInteraction,
    ): Promise<void> {
      const guildId = interaction.guildId!;
      const escalationId = interaction.customId.split("|")[1];
      const features: Features[] = [];

      // Get settings
      const { moderator: modRoleId, restricted } = await fetchSettings(
        guildId,
        [SETTINGS.moderator, SETTINGS.restricted],
      );
      if (restricted) {
        features.push("restrict");
      }

      // Check mod role
      if (!hasModRole(interaction, modRoleId)) {
        await interaction.reply({
          content: "Only moderators can vote on escalations.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      // Get escalation
      const escalation = await getEscalation(escalationId);
      if (!escalation) {
        await interaction.reply({
          content: "Escalation not found.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      if (escalation.resolved_at) {
        await interaction.reply({
          content: "This escalation has already been resolved.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      // Record the vote
      await recordVote({
        escalationId,
        voterId: interaction.user.id,
        vote: resolution,
      });

      // Get updated votes and tally
      const votes = await getVotesForEscalation(escalationId);
      const tally = tallyVotes(votes);
      const flags = parseFlags(escalation.flags);
      const quorum = flags.quorum;
      const quorumReached = tally.totalVotes >= quorum;

      // Check if quorum reached with clear winner - show confirmed state
      if (quorumReached && !tally.isTied && tally.leader) {
        await interaction.update({
          content: buildConfirmedMessageContent(
            escalation.reported_user_id,
            tally.leader,
            tally,
            escalation.created_at,
          ),
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`expedite|${escalationId}`)
                .setLabel("Expedite")
                .setStyle(ButtonStyle.Primary),
            ),
          ],
        });
        return;
      }

      // Update the message with new vote state
      await interaction.update({
        content: buildVoteMessageContent(
          escalation.reported_user_id,
          tally,
          quorum,
          escalation.created_at,
        ),
        components: buildVoteButtons(
          features,
          escalationId,
          tally,
          quorumReached,
        ),
      });
    },

  // Escalate button - creates a new vote
  escalate: async (interaction: MessageComponentInteraction) => {
    const reportedUserId = interaction.customId.split("|")[1];
    const guildId = interaction.guildId!;
    const threadId = interaction.channelId;

    // Get settings
    const settings = await fetchSettings(guildId, [
      SETTINGS.moderator,
      SETTINGS.quorum,
      SETTINGS.restricted,
    ]);
    const modRoleId = settings.moderator;
    const hasRestrictions = Boolean(settings.restricted);
    const quorum = settings.quorum ?? DEFAULT_QUORUM;

    try {
      // Acknowledge immediately
      await interaction.deferReply();

      const emptyTally: VoteTally = {
        totalVotes: 0,
        byResolution: new Map(),
        leader: null,
        leaderCount: 0,
        isTied: false,
        tiedResolutions: [],
      };

      // Generate escalation ID upfront so we can use it in the message buttons
      const escalationId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      // Send vote message first to get its ID
      const channel = interaction.channel;
      if (!channel || !("send" in channel)) {
        await interaction.editReply({
          content: "Failed to create escalation vote: invalid channel",
        });
        return;
      }

      const voteMessage = await channel.send({
        content: buildVoteMessageContent(
          reportedUserId,
          emptyTally,
          quorum,
          createdAt,
        ),
        components: buildVoteButtons(
          hasRestrictions ? ["restrict"] : [],
          escalationId,
          emptyTally,
          false,
        ),
      });

      // Now create escalation record with the correct message ID
      await createEscalation({
        id: escalationId,
        guildId,
        threadId,
        voteMessageId: voteMessage.id,
        reportedUserId,
        quorum,
      });

      // Send notification
      await interaction.editReply({
        content: `Escalation started. <@&${modRoleId}> please vote on how to handle <@${reportedUserId}>.`,
      });
    } catch (error) {
      log("error", "EscalationHandlers", "Error creating escalation vote", {
        error: error instanceof Error ? error.message : String(error),
      });
      await interaction.editReply({
        content: "Failed to create escalation vote",
      });
    }
  },
};
