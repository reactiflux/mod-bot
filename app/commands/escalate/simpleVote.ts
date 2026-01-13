import {
  type MessageComponentInteraction,
  type ThreadChannel,
} from "discord.js";

import { client } from "#~/discord/client.server.ts";
import type { Features } from "#~/helpers/featuresFlags.js";
import { votingStrategies } from "#~/helpers/modResponse";
import {
  calculateScheduledFor,
  createEscalation as createEscalationRecord,
  type Escalation,
} from "#~/models/escalationVotes.server";
import {
  DEFAULT_QUORUM,
  fetchSettings,
  SETTINGS,
} from "#~/models/guilds.server";

import { buildVoteButtons, buildVoteMessageContent } from "./strings";
import { type VoteTally } from "./voting";

/**
 * Creates a level 0 escalation with simple voting strategy
 */
export const createEscalation = async (
  interaction: MessageComponentInteraction,
  reportedUserId: string,
  escalationId: string,
) => {
  const guildId = interaction.guildId!;
  const threadId = interaction.channelId;
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

  const votingStrategy = votingStrategies.simple;
  const quorum = DEFAULT_QUORUM;

  const channel = (await guild.channels.fetch(
    interaction.channelId,
  )) as ThreadChannel;

  // Send vote message first to get its ID
  if (!channel || !("send" in channel)) {
    await interaction.editReply({
      content: "Failed to create escalation vote: invalid channel",
    });
    return;
  }

  const createdAt = new Date().toISOString();
  // Create a temporary escalation-like object for initial message
  const tempEscalation: Escalation = {
    id: escalationId,
    guild_id: guildId,
    thread_id: threadId,
    vote_message_id: "", // Will be set after message is sent
    reported_user_id: reportedUserId,
    initiator_id: interaction.user.id,
    flags: JSON.stringify({ quorum }),
    created_at: createdAt,
    resolved_at: null,
    resolution: null,
    voting_strategy: votingStrategy,
    scheduled_for: calculateScheduledFor(createdAt, 0),
  };
  const emptyTally: VoteTally = {
    totalVotes: 0,
    byResolution: new Map(),
    leader: null,
    leaderCount: 0,
    isTied: false,
    tiedResolutions: [],
  };

  const voteMessage = await channel.send({
    content: buildVoteMessageContent(
      modRoleId,
      votingStrategy,
      tempEscalation,
      emptyTally,
    ),
    components: buildVoteButtons(
      features,
      votingStrategy,
      tempEscalation,
      emptyTally,
      false,
    ),
  });
  tempEscalation.vote_message_id = voteMessage.id;
  // Now create escalation record with the correct message ID
  await createEscalationRecord(tempEscalation);

  // Send notification
  await interaction.editReply("Escalation started");
};
