import {
  ChannelType,
  InteractionType,
  MessageFlags,
  type MessageComponentInteraction,
  type TextChannel,
} from "discord.js";

import { hasModRole, type MessageComponentCommand } from "#~/helpers/discord";
import {
  humanReadableResolutions,
  resolutions,
  type Resolution,
} from "#~/helpers/modResponse";
import { log } from "#~/helpers/observability";
import { applyRestriction, ban, kick, timeout } from "#~/models/discord.server";
import {
  getEscalation,
  getVotesForEscalation,
  parseFlags,
  recordVote,
  resolveEscalation,
  tallyVotes,
  type VoteTally,
} from "#~/models/escalationVotes.server";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";

import { EscalationHandlers } from "./escalate/handlers";
import {
  buildVoteButtons,
  buildVoteMessageContent,
  buildVotesListContent,
} from "./escalate/strings";

/**
 * Execute a resolution action on a user.
 */
async function executeResolution(
  resolution: Resolution,
  interaction: MessageComponentInteraction,
  reportedUserId: string,
  escalationId: string,
  tally: VoteTally,
): Promise<void> {
  const guild = interaction.guild!;
  const guildId = guild.id;

  log("info", "EscalationControls", "Executing resolution", {
    resolution,
    reportedUserId,
    escalationId,
  });

  try {
    const reportedMember = await guild.members
      .fetch(reportedUserId)
      .catch(() => null);
    if (!reportedMember) {
      log(
        "debug",
        "Failed to find reported member",
        JSON.stringify({
          escalationId,
          reportedUserId,
        }),
      );
      return;
    }

    switch (resolution) {
      case resolutions.track:
        // No action needed, just track
        break;

      case resolutions.warning: {
        // Create private thread for formal warning
        const channel = interaction.channel;
        if (channel && "threads" in channel) {
          const textChannel = channel as TextChannel;
          const thread = await textChannel.threads.create({
            name: `Warning: ${reportedMember.user.username}`,
            autoArchiveDuration: 60,
            type: ChannelType.PrivateThread,
            reason: "Private moderation thread for formal warning",
          });
          const { moderator: modRoleId } = await fetchSettings(guildId, [
            SETTINGS.moderator,
          ]);
          await thread.members.add(reportedMember.id);
          await thread.send(
            `The <@&${modRoleId}> team has determined that your behavior is not okay in the community.
Your actions concerned the moderators enough that they felt it necessary to intervene. This message was sent by a bot, but all moderators can view this thread and are available to discuss what concerned them.`,
          );
        }
        break;
      }

      case resolutions.timeout:
        await timeout(reportedMember);
        break;

      case resolutions.restrict:
        await applyRestriction(reportedMember);
        break;

      case resolutions.kick:
        await kick(reportedMember);
        break;

      case resolutions.ban:
        await ban(reportedMember);
        break;
    }

    // Mark escalation as resolved in database
    await resolveEscalation(escalationId, resolution);

    // Update the vote message to show resolution
    if (interaction.message) {
      await interaction.message.edit({
        content: `**Escalation Resolved** ✅\nAction taken: **${humanReadableResolutions[resolution]}** on <@${reportedUserId}>
${buildVotesListContent(tally)}`,
        components: [], // Remove buttons
      });
    }
  } catch (error) {
    log("error", "EscalationControls", "Failed to execute resolution", {
      resolution,
      reportedUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Handle a vote being cast.
 */
async function handleVote(
  interaction: MessageComponentInteraction,
  resolution: Resolution,
  escalationId: string,
): Promise<void> {
  const guildId = interaction.guildId!;

  // Get settings
  const { moderator: modRoleId } = await fetchSettings(guildId, [
    SETTINGS.moderator,
  ]);

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
    odId: interaction.user.id,
    vote: resolution,
  });

  // Get updated votes and tally
  const votes = await getVotesForEscalation(escalationId);
  const tally = tallyVotes(votes);
  const flags = parseFlags(escalation.flags);
  const quorum = flags.quorum;
  const quorumReached = tally.totalVotes >= quorum;

  // Check if we should resolve
  if (quorumReached && !tally.isTied && tally.leader) {
    // Quorum reached with clear winner - execute resolution
    await interaction.deferUpdate();
    try {
      await executeResolution(
        tally.leader as Resolution,
        interaction,
        escalation.reported_user_id,
        escalationId,
        tally,
      );
    } catch (error) {
      log("error", "resolution failed", JSON.stringify({ error }));
      await interaction.editReply(
        "Something went wrong while executing the resolution",
      );
    }
    return;
  }
  console.log(escalation.created_at);
  // Update the message with new vote state

  await interaction.update({
    content: buildVoteMessageContent(
      escalation.reported_user_id,
      tally,
      quorum,
      escalation.created_at,
    ),
    components: buildVoteButtons(escalationId, tally, quorumReached),
  });
}

const button = (name: string) => ({
  type: InteractionType.MessageComponent as const,
  name,
});

const h = EscalationHandlers;

export const EscalationCommands: MessageComponentCommand[] = [
  { command: button("escalate-escalate"), handler: h.escalate },

  // Direct action commands (no voting)
  { command: button("escalate-delete"), handler: h.delete },
  { command: button("escalate-kick"), handler: h.kick },
  { command: button("escalate-ban"), handler: h.ban },
  { command: button("escalate-restrict"), handler: h.restrict },
  { command: button("escalate-timeout"), handler: h.timeout },

  // Create vote handlers for each resolution
  ...Object.values(resolutions).map((resolution) => ({
    command: {
      type: InteractionType.MessageComponent as const,
      name: `vote-${resolution}`,
    },
    handler: async (interaction: MessageComponentInteraction) => {
      const escalationId = interaction.customId.split("|")[1];
      await handleVote(interaction, resolution, escalationId);
    },
  })),
];
