import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import {
  humanReadableResolutions,
  resolutions,
  type Resolution,
} from "#~/helpers/modResponse";
import {
  calculateTimeoutHours,
  type VoteTally,
} from "#~/models/escalationVotes.server";

export function buildVotesListContent(tally: VoteTally) {
  return Array.from(tally.byResolution.entries())
    .filter(([, voters]) => voters.length > 0)
    .map(
      ([resolution, voters]) =>
        `• ${humanReadableResolutions[resolution as Resolution]}: ${voters.map((id) => `<@${id}>`).join(", ")}`,
    )
    .join("\n");
}

/**
 * Build the voting message content showing current vote state.
 */
export function buildVoteMessageContent(
  reportedUserId: string,
  tally: VoteTally,
  quorum: number,
  createdAt: string,
): string {
  const createdTimestamp = Math.floor(new Date(createdAt).getTime() / 1000);
  const timeoutHours = calculateTimeoutHours(tally.totalVotes);

  let status: string;
  if (tally.totalVotes >= quorum) {
    if (tally.isTied) {
      status = `⚖️ **Tied** between: ${tally.tiedResolutions.map((r) => humanReadableResolutions[r as Resolution]).join(", ")}. Waiting for tiebreaker.`;
    } else {
      status = `✅ **Quorum reached.** Leading: ${humanReadableResolutions[tally.leader as Resolution]} (${tally.leaderCount} votes)`;
    }
  } else {
    status = `⏳ **${tally.totalVotes}/${quorum} votes** toward quorum. Auto-resolve in ${timeoutHours}h if no more votes.`;
  }

  const votesList = buildVotesListContent(tally);

  return `**Escalation Vote** for <@${reportedUserId}>
Created: <t:${createdTimestamp}:R>
${status}

${votesList || "_No votes yet_"}`;
}

/**
 * Build the voting buttons, optionally disabling non-tied options during a tie.
 */
export function buildVoteButtons(
  escalationId: string,
  tally: VoteTally,
  quorumReached: boolean,
): ActionRowBuilder<ButtonBuilder>[] {
  const resolutionList: Resolution[] = [
    resolutions.track,
    resolutions.warning,
    resolutions.timeout,
    resolutions.restrict,
    resolutions.kick,
    resolutions.ban,
  ];

  const buttons = resolutionList.map((resolution) => {
    const voteCount = tally.byResolution.get(resolution)?.length ?? 0;
    const label = `${humanReadableResolutions[resolution]}${voteCount > 0 ? ` (${voteCount})` : ""}`;

    // During a tie at quorum, disable non-tied options
    const disabled =
      quorumReached &&
      tally.isTied &&
      !tally.tiedResolutions.includes(resolution);

    let style = ButtonStyle.Secondary;
    if (resolution === resolutions.ban) style = ButtonStyle.Danger;
    if (resolution === resolutions.track) style = ButtonStyle.Success;
    if (resolution === resolutions.warning) style = ButtonStyle.Primary;

    return new ButtonBuilder()
      .setCustomId(`vote-${resolution}|${escalationId}`)
      .setLabel(label)
      .setStyle(style)
      .setDisabled(disabled);
  });

  // Split into two rows (3 buttons each)
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(0, 3)),
    new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(3, 6)),
  ];
}
