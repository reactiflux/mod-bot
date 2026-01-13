import {
  type MessageComponentInteraction,
  type ThreadChannel,
} from "discord.js";

import { client } from "#~/discord/client.server.ts";
import type { Features } from "#~/helpers/featuresFlags.js";
import { votingStrategies } from "#~/helpers/modResponse";
import {
  calculateScheduledFor,
  getEscalation,
  getVotesForEscalation,
  updateEscalationStrategy,
  updateScheduledFor,
  type Escalation,
} from "#~/models/escalationVotes.server";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";

import { buildVoteButtons, buildVoteMessageContent } from "./strings";
import { tallyVotes } from "./voting";

/**
 * Upgrades an existing escalation to majority voting strategy (level 1+)
 */
export const upgradeToMajority = async (
  interaction: MessageComponentInteraction,
  escalationId: string,
) => {
  const guildId = interaction.guildId!;
  const features: Features[] = [];

  // Get settings
  const { moderator: modRoleId, restricted } = await fetchSettings(guildId, [
    SETTINGS.moderator,
    SETTINGS.restricted,
  ]);
  if (restricted) {
    features.push("restrict");
  }
  const guild = await client.guilds.fetch(guildId);

  const votingStrategy = votingStrategies.majority;

  const channel = (await guild.channels.fetch(
    interaction.channelId,
  )) as ThreadChannel;

  // Re-escalation: update existing escalation's voting strategy
  const escalation = await getEscalation(escalationId);
  if (!escalation) {
    await interaction.editReply({
      content: "Failed to re-escalate, couldn't find escalation",
    });
    return;
  }
  const voteMessage = await channel.messages.fetch(escalation.vote_message_id);
  if (!voteMessage) {
    await interaction.editReply({
      content: "Failed to re-escalate: couldn't find vote message",
    });
    return;
  }

  // Get current votes to display
  const votes = await getVotesForEscalation(escalationId);
  const tally = tallyVotes(votes);

  // Recalculate scheduled_for based on current vote count
  const newScheduledFor = calculateScheduledFor(
    escalation.created_at,
    tally.totalVotes,
  );

  // Create updated escalation object
  const updatedEscalation: Escalation = {
    ...escalation,
    voting_strategy: votingStrategy,
    scheduled_for: newScheduledFor,
  };

  await voteMessage.edit({
    content: buildVoteMessageContent(
      modRoleId,
      votingStrategy,
      updatedEscalation,
      tally,
    ),
    components: buildVoteButtons(
      features,
      votingStrategy,
      escalation,
      tally,
      false, // Never in early resolution state when re-escalating to majority
    ),
  });

  // Update the escalation's voting strategy
  await updateEscalationStrategy(escalationId, votingStrategy);
  await updateScheduledFor(escalationId, newScheduledFor);

  // Send notification
  await interaction.editReply("Escalation upgraded to majority voting");
};
