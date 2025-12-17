import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import { parseFlags } from "#~/helpers/escalationVotes";
import type { Features } from "#~/helpers/featuresFlags.js";
import {
  humanReadableResolutions,
  resolutions,
  type Resolution,
  type VotingStrategy,
} from "#~/helpers/modResponse";
import type { Escalation } from "#~/models/escalationVotes.server";

import type { VoteTally } from "./voting";

export function buildVotesListContent(tally: VoteTally) {
  return (
    (tally.totalVotes > 0 ? "-# Vote record:\n" : "") +
    Array.from(tally.byResolution.entries())
      .filter(([, voters]) => voters.length > 0)
      .map(
        ([resolution, voters]) =>
          `-# • ${humanReadableResolutions[resolution]}: ${voters.map((id) => `<@${id}>`).join(", ")}`,
      )
      .join("\n")
  );
}

/**
 * Build the voting message content showing current vote state.
 */
export function buildVoteMessageContent(
  modRoleId: string,
  escalation: Escalation,
  tally: VoteTally,
  votingStrategy: VotingStrategy | null = null,
): string {
  const createdTimestamp = Math.floor(
    new Date(escalation.created_at).getTime() / 1000,
  );
  const scheduledFor = escalation.scheduled_for
    ? Math.floor(new Date(escalation.scheduled_for).getTime() / 1000)
    : null;
  const flags = parseFlags(escalation.flags);
  const quorum = flags.quorum;
  const isMajority = votingStrategy === "majority";

  let status: string;
  if (isMajority) {
    // Majority voting: always wait for timeout, plurality wins
    if (tally.totalVotes === 0) {
      status = scheduledFor
        ? `Majority voting. Resolves <t:${scheduledFor}:R> with leading option.`
        : `Majority voting. Waiting for votes.`;
    } else if (tally.isTied) {
      status = `Tied between: ${tally.tiedResolutions.map((r) => humanReadableResolutions[r]).join(", ")}. Tiebreak needed before timeout.`;
    } else {
      status = scheduledFor
        ? `Leading: ${humanReadableResolutions[tally.leader!]} (${tally.leaderCount} votes). Resolves <t:${scheduledFor}:R>.`
        : `Leading: ${humanReadableResolutions[tally.leader!]} (${tally.leaderCount} votes).`;
    }
  } else if (tally.leaderCount >= quorum) {
    // Simple voting: quorum reached
    if (tally.isTied || !tally.leader) {
      status = `Tied between: ${tally.tiedResolutions.map((r) => humanReadableResolutions[r]).join(", ")}. Waiting for tiebreaker.`;
    } else {
      status = `Quorum reached. Leading: ${humanReadableResolutions[tally.leader]} (${tally.leaderCount} votes)`;
    }
  } else {
    // Simple voting: quorum not reached
    status = `${tally.leaderCount} voter(s), quorum at ${quorum}.`;
    if (tally.leaderCount > 0 && !tally.isTied && scheduledFor) {
      status += ` Auto-resolves with \`${tally.leader}\` <t:${scheduledFor}:R> if no more votes.`;
    } else if (tally.leaderCount > 0 && tally.isTied && scheduledFor) {
      status += ` Tiebreak needed <t:${scheduledFor}:R> if no more votes are cast`;
    }
  }

  const votesList = buildVotesListContent(tally);
  const strategyLabel = isMajority ? " (majority)" : "";

  return `<@${escalation.initiator_id}> called for a vote${strategyLabel} by <@&${modRoleId}> <t:${createdTimestamp}:R> regarding user <@${escalation.reported_user_id}>
${status}

${votesList || "_No votes yet_"}`;
}

/**
 * Build the voting buttons, optionally disabling non-tied options during a tie.
 */
export function buildVoteButtons(
  enabledFeatures: Features[],
  escalationId: string,
  reportedUserId: string,
  tally: VoteTally,
  earlyResolutionTriggered: boolean,
  votingStrategy: VotingStrategy | null = null,
): ActionRowBuilder<ButtonBuilder>[] {
  const resolutionList: Resolution[] = [];
  resolutionList.push(resolutions.track);
  // resolutionList.push(resolutions.warning)
  resolutionList.push(resolutions.timeout);
  if (enabledFeatures.includes("restrict")) {
    resolutionList.push(resolutions.restrict);
  }
  resolutionList.push(resolutions.kick);
  resolutionList.push(resolutions.ban);

  const buttons = resolutionList.map((resolution) => {
    const voteCount = tally.byResolution.get(resolution)?.length ?? 0;
    const label = `${humanReadableResolutions[resolution]}${voteCount > 0 ? ` (${voteCount})` : ""}`;

    // During a tie at quorum (simple voting), disable non-tied options
    const disabled =
      earlyResolutionTriggered &&
      tally.isTied &&
      !tally.tiedResolutions.includes(resolution);

    let style = ButtonStyle.Secondary;
    if (resolution === resolutions.ban) style = ButtonStyle.Danger;
    if (resolution === resolutions.track) style = ButtonStyle.Success;
    // if (resolution === resolutions.warning) style = ButtonStyle.Primary;

    return new ButtonBuilder()
      .setCustomId(`vote-${resolution}|${escalationId}`)
      .setLabel(label)
      .setStyle(style)
      .setDisabled(disabled);
  });

  const rows: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(buttons),
  ];

  // Only show "Require majority vote" button if not already using majority strategy
  if (votingStrategy !== "majority") {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`escalate-escalate|${reportedUserId}|1|${escalationId}`)
          .setLabel("Require majority vote")
          .setStyle(ButtonStyle.Primary),
      ),
    );
  }

  return rows;
}

/**
 * Build message content for a confirmed resolution (quorum reached, awaiting execution).
 */
export function buildConfirmedMessageContent(
  escalation: Escalation,
  resolution: Resolution,
  tally: VoteTally,
): string {
  const executeTimestamp = escalation.scheduled_for
    ? Math.floor(new Date(escalation.scheduled_for).getTime() / 1000)
    : null;

  const executesLine = executeTimestamp
    ? `Executes <t:${executeTimestamp}:R>`
    : "Executes soon";

  return `**${humanReadableResolutions[resolution]}** ✅ <@${escalation.reported_user_id}>
${executesLine}

${buildVotesListContent(tally)}`;
}
