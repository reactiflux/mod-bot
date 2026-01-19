import type { MessageComponentInteraction, ThreadChannel } from "discord.js";
import { Effect } from "effect";

import {
  buildVoteButtons,
  buildVoteMessageContent,
} from "#~/commands/escalate/strings";
import { tallyVotes, type VoteTally } from "#~/commands/escalate/voting";
import { client } from "#~/discord/client.server";
import { DiscordApiError } from "#~/effects/errors";
import { logEffect } from "#~/effects/observability";
import {
  EscalationService,
  type Escalation,
} from "#~/effects/services/Escalation";
import { calculateScheduledFor } from "#~/helpers/escalationVotes";
import type { Features } from "#~/helpers/featuresFlags";
import { votingStrategies, type Resolution } from "#~/helpers/modResponse";
import {
  DEFAULT_QUORUM,
  fetchSettings,
  SETTINGS,
} from "#~/models/guilds.server";

export interface CreateEscalationResult {
  escalation: Escalation;
  voteMessageId: string;
}

/**
 * Create a new level 0 escalation with simple voting strategy.
 * Sends the vote message to the thread and creates the DB record.
 */
export const createEscalationEffect = (
  interaction: MessageComponentInteraction,
  reportedUserId: string,
  escalationId: string,
) =>
  Effect.gen(function* () {
    const escalationService = yield* EscalationService;
    const guildId = interaction.guildId!;
    const threadId = interaction.channelId;
    const features: Features[] = [];

    // Get settings
    const { moderator: modRoleId, restricted } = yield* Effect.tryPromise({
      try: () =>
        fetchSettings(guildId, [SETTINGS.moderator, SETTINGS.restricted]),
      catch: (error) =>
        new DiscordApiError({
          operation: "fetchSettings",
          discordError: error,
        }),
    });

    if (restricted) {
      features.push("restrict");
    }

    // Fetch guild and channel
    const guild = yield* Effect.tryPromise({
      try: () => client.guilds.fetch(guildId),
      catch: (error) =>
        new DiscordApiError({ operation: "fetchGuild", discordError: error }),
    });

    const channel = yield* Effect.tryPromise({
      try: () => guild.channels.fetch(interaction.channelId),
      catch: (error) =>
        new DiscordApiError({ operation: "fetchChannel", discordError: error }),
    });

    if (!channel || !("send" in channel)) {
      return yield* Effect.fail(
        new DiscordApiError({
          operation: "validateChannel",
          discordError: new Error("Invalid channel - cannot send messages"),
        }),
      );
    }

    const votingStrategy = votingStrategies.simple;
    const quorum = DEFAULT_QUORUM;
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

    // Send vote message to get its ID
    const voteMessage = yield* Effect.tryPromise({
      try: () =>
        (channel as ThreadChannel).send({
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
        }),
      catch: (error) =>
        new DiscordApiError({
          operation: "sendVoteMessage",
          discordError: error,
        }),
    });

    // Create escalation record with the correct message ID
    const escalation = yield* escalationService.createEscalation({
      id: escalationId,
      guildId,
      threadId,
      voteMessageId: voteMessage.id,
      reportedUserId,
      initiatorId: interaction.user.id,
      quorum,
      votingStrategy,
    });

    yield* logEffect("info", "EscalateHandler", "Created escalation", {
      escalationId,
      reportedUserId,
      guildId,
      voteMessageId: voteMessage.id,
    });

    return {
      escalation,
      voteMessageId: voteMessage.id,
    } satisfies CreateEscalationResult;
  }).pipe(
    Effect.withSpan("createEscalation", {
      attributes: { escalationId, reportedUserId },
    }),
  );

export interface UpgradeToMajorityResult {
  escalation: Escalation;
  tally: VoteTally;
  modRoleId: string | undefined;
  features: Features[];
}

/**
 * Upgrade an existing escalation to majority voting strategy.
 * Updates the vote message and DB record.
 */
export const upgradeToMajorityEffect = (
  interaction: MessageComponentInteraction,
  escalationId: string,
) =>
  Effect.gen(function* () {
    const escalationService = yield* EscalationService;
    const guildId = interaction.guildId!;
    const features: Features[] = [];

    // Get settings
    const { moderator: modRoleId, restricted } = yield* Effect.tryPromise({
      try: () =>
        fetchSettings(guildId, [SETTINGS.moderator, SETTINGS.restricted]),
      catch: (error) =>
        new DiscordApiError({
          operation: "fetchSettings",
          discordError: error,
        }),
    });

    if (restricted) {
      features.push("restrict");
    }

    // Fetch guild and channel
    const guild = yield* Effect.tryPromise({
      try: () => client.guilds.fetch(guildId),
      catch: (error) =>
        new DiscordApiError({ operation: "fetchGuild", discordError: error }),
    });

    const channel = yield* Effect.tryPromise({
      try: () => guild.channels.fetch(interaction.channelId),
      catch: (error) =>
        new DiscordApiError({ operation: "fetchChannel", discordError: error }),
    }) as Effect.Effect<ThreadChannel, DiscordApiError>;

    const votingStrategy = votingStrategies.majority;

    // Get existing escalation
    const escalation = yield* escalationService.getEscalation(escalationId);

    // Fetch the vote message
    const voteMessage = yield* Effect.tryPromise({
      try: () => channel.messages.fetch(escalation.vote_message_id),
      catch: (error) =>
        new DiscordApiError({
          operation: "fetchVoteMessage",
          discordError: error,
        }),
    });

    // Get current votes to display
    const votes = yield* escalationService.getVotesForEscalation(escalationId);
    const tally = tallyVotes(
      votes.map((v) => ({ vote: v.vote as Resolution, voter_id: v.voter_id })),
    );

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

    // Update the vote message
    yield* Effect.tryPromise({
      try: () =>
        voteMessage.edit({
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
            false, // Never in early resolution state when upgrading to majority
          ),
        }),
      catch: (error) =>
        new DiscordApiError({
          operation: "editVoteMessage",
          discordError: error,
        }),
    });

    // Update the escalation's voting strategy and scheduled_for
    yield* escalationService.updateEscalationStrategy(
      escalationId,
      votingStrategy,
    );
    yield* escalationService.updateScheduledFor(escalationId, newScheduledFor);

    yield* logEffect("info", "EscalateHandler", "Upgraded to majority voting", {
      escalationId,
      previousStrategy: escalation.voting_strategy,
      newScheduledFor,
    });

    return {
      escalation: updatedEscalation,
      tally,
      modRoleId,
      features,
    } satisfies UpgradeToMajorityResult;
  }).pipe(
    Effect.withSpan("upgradeToMajority", { attributes: { escalationId } }),
  );
