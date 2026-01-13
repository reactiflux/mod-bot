import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type MessageComponentInteraction,
} from "discord.js";

import { hasModRole } from "#~/helpers/discord";
import { parseFlags } from "#~/helpers/escalationVotes";
import type { Features } from "#~/helpers/featuresFlags";
import { type Resolution, type VotingStrategy } from "#~/helpers/modResponse";
import { log } from "#~/helpers/observability";
import {
  calculateScheduledFor,
  getEscalation,
  getVotesForEscalation,
  recordVote,
  updateScheduledFor,
  type Escalation,
} from "#~/models/escalationVotes.server";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";

import {
  buildConfirmedMessageContent,
  buildVoteButtons,
  buildVoteMessageContent,
} from "./strings";

export interface VoteTally {
  totalVotes: number;
  byResolution: Map<Resolution, string[]>; // resolution -> voter IDs
  leader: Resolution | null;
  leaderCount: number;
  isTied: boolean;
  tiedResolutions: Resolution[];
}

interface VoteRecord {
  vote: Resolution;
  voter_id: string;
}

export const vote = (resolution: Resolution) =>
  async function handleVote(
    interaction: MessageComponentInteraction,
  ): Promise<void> {
    const guildId = interaction.guildId!;
    const escalationId = interaction.customId.split("|")[1];
    const features: Features[] = [];

    // Get settings
    const { moderator: modRoleId, restricted } = await fetchSettings(guildId, [
      SETTINGS.moderator,
      SETTINGS.restricted,
    ]);
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
    const votingStrategy =
      (escalation.voting_strategy as VotingStrategy) ?? "simple";

    // Update scheduled_for based on new vote count
    const newScheduledFor = calculateScheduledFor(
      escalation.created_at,
      tally.totalVotes,
    );
    await updateScheduledFor(escalationId, newScheduledFor);

    // Create updated escalation object with new scheduled_for
    const updatedEscalation: Escalation = {
      ...escalation,
      scheduled_for: newScheduledFor,
    };

    const earlyResolution = shouldTriggerEarlyResolution(
      tally,
      quorum,
      votingStrategy,
    );

    // Check if early resolution triggered with clear winner - show confirmed state
    if (earlyResolution && !tally.isTied && tally.leader) {
      await interaction.update({
        content: buildConfirmedMessageContent(
          updatedEscalation,
          tally.leader,
          tally,
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
        modRoleId,
        votingStrategy,
        updatedEscalation,
        tally,
      ),
      components: buildVoteButtons(
        features,
        votingStrategy,
        updatedEscalation,
        tally,
        earlyResolution,
      ),
    });
  };

export function tallyVotes(votes: VoteRecord[]): VoteTally {
  const byResolution = new Map<Resolution, string[]>();

  for (const vote of votes) {
    const voters = byResolution.get(vote.vote) ?? [];
    voters.push(vote.voter_id);
    byResolution.set(vote.vote, voters);
  }

  let leader: Resolution | null = null;
  let leaderCount = 0;
  const tiedResolutions: Resolution[] = [];

  for (const [resolution, voters] of byResolution) {
    if (voters.length > leaderCount) {
      leader = resolution;
      leaderCount = voters.length;
      tiedResolutions.length = 0;
      tiedResolutions.push(resolution);
    } else if (voters.length === leaderCount && leaderCount > 0) {
      tiedResolutions.push(resolution);
    }
  }

  const isTied = tiedResolutions.length > 1;

  const output = {
    // Count unique voters
    totalVotes: votes.reduce((o, v) => {
      if (o.includes(v.voter_id)) {
        return o;
      }
      o.push(v.voter_id);
      return o;
    }, [] as string[]).length,
    byResolution,
    leader: isTied ? null : leader,
    leaderCount,
    isTied,
    tiedResolutions,
  };
  log("info", "Voting", "Tallied votes", output);

  return output;
}

/**
 * Check if early resolution should trigger based on voting strategy.
 * - simple: triggers when any option hits quorum (e.g., 3 votes)
 * - majority: never triggers early; must wait for timeout
 */
export function shouldTriggerEarlyResolution(
  tally: VoteTally,
  quorum: number,
  strategy: VotingStrategy | null,
): boolean {
  // Majority strategy never triggers early - must wait for timeout
  if (strategy === "majority") {
    return false;
  }
  // Simple strategy (or null/default): trigger when any option hits quorum
  return tally.leaderCount >= quorum;
}
