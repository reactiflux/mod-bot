import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";

import { parseFlags } from "#~/helpers/escalationVotes";
import type { Features } from "#~/helpers/featuresFlags";
import {
  humanReadableResolutions,
  resolutions,
  type Resolution,
  type VotingStrategy,
} from "#~/helpers/modResponse";

import type { Escalation } from "./service";
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

function buildStatusText(
  votingStrategy: VotingStrategy,
  tally: VoteTally,
  quorum: number,
  scheduledFor: number | null,
): string {
  const isMajority = votingStrategy === "majority";

  if (isMajority) {
    if (tally.totalVotes === 0) {
      return scheduledFor
        ? `Majority voting. Resolves <t:${scheduledFor}:R> with a simple majority of participants.`
        : `Majority voting. Waiting for votes.`;
    } else if (tally.isTied) {
      return `Tied between: ${tally.tiedResolutions.map((r) => humanReadableResolutions[r]).join(", ")}. Tiebreak needed before timeout.`;
    } else {
      return scheduledFor
        ? `Leading: ${humanReadableResolutions[tally.leader!]} (${tally.leaderCount} votes). Resolves <t:${scheduledFor}:R>.`
        : `Leading: ${humanReadableResolutions[tally.leader!]} (${tally.leaderCount} votes).`;
    }
  } else if (tally.leaderCount >= quorum) {
    if (tally.isTied || !tally.leader) {
      return `Tied between: ${tally.tiedResolutions.map((r) => humanReadableResolutions[r]).join(", ")}. Waiting for tiebreaker.`;
    } else {
      return `Quorum reached. Leading: ${humanReadableResolutions[tally.leader]} (${tally.leaderCount} votes)`;
    }
  } else {
    let status = `${tally.totalVotes} voter(s), quorum at ${quorum}.`;
    if (tally.leaderCount > 0 && !tally.isTied && scheduledFor) {
      status += ` Auto-resolves with \`${tally.leader}\` <t:${scheduledFor}:R> if no more votes.`;
    } else if (tally.leaderCount > 0 && tally.isTied && scheduledFor) {
      status += ` Tiebreak needed <t:${scheduledFor}:R> if no more votes are cast`;
    }
    return status;
  }
}

function buildVoteActionRows(
  enabledFeatures: Features[],
  votingStrategy: VotingStrategy,
  escalation: Escalation,
  tally: VoteTally,
  earlyResolutionTriggered: boolean,
): ActionRowBuilder<ButtonBuilder>[] {
  const resolutionList: Resolution[] = [];
  resolutionList.push(resolutions.track);
  resolutionList.push(resolutions.timeout);
  if (enabledFeatures.includes("restrict")) {
    resolutionList.push(resolutions.restrict);
  }
  resolutionList.push(resolutions.kick);
  resolutionList.push(resolutions.ban);

  const buttons = resolutionList.map((resolution) => {
    const voteCount = tally.byResolution.get(resolution)?.length ?? 0;
    const label = `${humanReadableResolutions[resolution]}${voteCount > 0 ? ` (${voteCount})` : ""}`;

    const disabled =
      earlyResolutionTriggered &&
      tally.isTied &&
      !tally.tiedResolutions.includes(resolution);

    let style = ButtonStyle.Secondary;
    if (resolution === resolutions.ban) style = ButtonStyle.Danger;
    if (resolution === resolutions.track) style = ButtonStyle.Success;

    return new ButtonBuilder()
      .setCustomId(`vote-${resolution}|${escalation.id}`)
      .setLabel(label)
      .setStyle(style)
      .setDisabled(disabled);
  });

  const rows: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(buttons),
  ];

  if (votingStrategy !== "majority") {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `escalate-escalate|${escalation.reported_user_id}|1|${escalation.id}`,
          )
          .setLabel("Require majority vote")
          .setStyle(ButtonStyle.Primary),
      ),
    );
  }

  return rows;
}

/**
 * Build the full vote message as a Components v2 container.
 */
export function buildVoteMessageComponents(
  modRoleId: string,
  votingStrategy: VotingStrategy,
  escalation: Escalation,
  tally: VoteTally,
  enabledFeatures: Features[],
  earlyResolutionTriggered: boolean,
): ContainerBuilder {
  const createdTimestamp = Math.floor(
    new Date(escalation.created_at).getTime() / 1000,
  );
  const scheduledFor = escalation.scheduled_for
    ? Math.floor(new Date(escalation.scheduled_for).getTime() / 1000)
    : null;
  const flags = parseFlags(escalation.flags);
  const strategyLabel = votingStrategy === "majority" ? " (majority)" : "";

  const status = buildStatusText(
    votingStrategy,
    tally,
    flags.quorum,
    scheduledFor,
  );
  const votesList = buildVotesListContent(tally);

  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `<@${escalation.initiator_id}> called for a vote${strategyLabel} by <@&${modRoleId}> <t:${createdTimestamp}:R> regarding user <@${escalation.reported_user_id}>`,
      ),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(status))
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(votesList || "_No votes yet_"),
    );

  for (const row of buildVoteActionRows(
    enabledFeatures,
    votingStrategy,
    escalation,
    tally,
    earlyResolutionTriggered,
  )) {
    container.addActionRowComponents(row);
  }

  return container;
}

/**
 * Build the confirmed resolution message as a Components v2 container.
 */
export function buildConfirmedMessageComponents(
  escalation: Escalation,
  resolution: Resolution,
  tally: VoteTally,
): ContainerBuilder {
  const executeTimestamp = escalation.scheduled_for
    ? Math.floor(new Date(escalation.scheduled_for).getTime() / 1000)
    : null;

  const executesLine = executeTimestamp
    ? `Executes <t:${executeTimestamp}:R>`
    : "Executes soon";

  return new ContainerBuilder()
    .setAccentColor(0x00cc00)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${humanReadableResolutions[resolution]}** ✅ <@${escalation.reported_user_id}>`,
      ),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(executesLine))
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        buildVotesListContent(tally) || "_No votes_",
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`expedite|${escalation.id}`)
          .setLabel("Expedite")
          .setStyle(ButtonStyle.Primary),
      ),
    );
}
