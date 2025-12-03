import {
  InteractionType,
  MessageFlags,
  type MessageComponentInteraction,
} from "discord.js";

import { hasModRole, type MessageComponentCommand } from "#~/helpers/discord";
import { resolutions, type Resolution } from "#~/helpers/modResponse";
import {
  getEscalation,
  getVotesForEscalation,
  parseFlags,
  recordVote,
  tallyVotes,
} from "#~/models/escalationVotes.server";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";

import { EscalationHandlers } from "./escalate/handlers";
import {
  buildConfirmedMessageContent,
  buildExpediteButton,
  buildVoteButtons,
  buildVoteMessageContent,
} from "./escalate/strings";

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

  // Check if quorum reached with clear winner - show confirmed state
  if (quorumReached && !tally.isTied && tally.leader) {
    await interaction.update({
      content: buildConfirmedMessageContent(
        escalation.reported_user_id,
        tally.leader,
        tally,
        escalation.created_at,
      ),
      components: buildExpediteButton(escalationId),
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

  // Expedite handler
  { command: button("expedite"), handler: h.expedite },

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
