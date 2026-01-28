import {
  ActionRowBuilder,
  ButtonBuilder,
  ComponentType,
  type Client,
  type Message,
  type ThreadChannel,
} from "discord.js";
import { Effect } from "effect";

import {
  editMessage,
  fetchChannelFromClient,
  fetchGuild,
  fetchMemberOrNull,
  fetchMessage,
  fetchUserOrNull,
  replyAndForwardSafe,
} from "#~/effects/discordSdk";
import { logEffect } from "#~/effects/observability";
import {
  humanReadableResolutions,
  resolutions,
  type Resolution,
} from "#~/helpers/modResponse";
import { fetchSettingsEffect, SETTINGS } from "#~/models/guilds.server";

import { EscalationService, type Escalation } from "./service";
import { tallyVotes } from "./voting";

/**
 * Get disabled versions of all button components from a message.
 */
function getDisabledButtons(
  message: Message,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (const row of message.components) {
    if (!("components" in row)) continue;

    const buttons = row.components.filter(
      (c) => c.type === ComponentType.Button,
    );
    if (buttons.length === 0) continue;

    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        buttons.map((btn) => ButtonBuilder.from(btn).setDisabled(true)),
      ),
    );
  }

  return rows;
}

/**
 * Process a single escalation that is due for auto-resolution.
 * Fetches votes, determines resolution, executes it, and updates Discord.
 */
export const processEscalationEffect = (
  client: Client,
  escalation: Escalation,
) =>
  Effect.gen(function* () {
    const escalationService = yield* EscalationService;

    // Get votes and determine resolution
    const votes = yield* escalationService.getVotesForEscalation(escalation.id);
    const tally = tallyVotes(
      votes.map((v) => ({ vote: v.vote as Resolution, voter_id: v.voter_id })),
    );
    const votingStrategy = escalation.voting_strategy;

    // Determine the resolution to take
    let resolution: Resolution;

    if (tally.totalVotes === 0) {
      resolution = resolutions.track;
    } else if (tally.isTied) {
      yield* logEffect(
        "warn",
        "EscalationResolver",
        "Auto-resolve defaulting to track due to tie",
        { tiedResolutions: tally.tiedResolutions, votingStrategy },
      );
      resolution = resolutions.track;
    } else if (tally.leader) {
      resolution = tally.leader;
    } else {
      resolution = resolutions.track;
    }

    const [{ modLog }, reportedUser, guild, channel] = yield* Effect.all([
      fetchSettingsEffect(escalation.guild_id, [SETTINGS.modLog]),
      fetchUserOrNull(client, escalation.reported_user_id),
      fetchGuild(client, escalation.guild_id),
      fetchChannelFromClient<ThreadChannel>(client, escalation.thread_id),
      logEffect("info", "EscalationResolver", "Auto-resolving escalation", {
        resolution,
      }),
    ]).pipe(Effect.withConcurrency("unbounded"));

    const [reportedMember, voteMessage] = yield* Effect.all([
      fetchMemberOrNull(guild, escalation.reported_user_id),
      fetchMessage(channel, escalation.vote_message_id),
    ]);

    // Calculate timing info
    const now = Math.floor(Date.now() / 1000);
    const createdAt = Math.floor(
      Number(new Date(escalation.created_at)) / 1000,
    );
    const elapsedHours = Math.floor((now - createdAt) / 60 / 60);
    const voters = new Set(votes.map((v) => v.voter_id));

    const noticeText = `Resolved with ${votes.length} votes from ${voters.size} voters: **${humanReadableResolutions[resolution]}** <@${escalation.reported_user_id}> (${reportedUser?.displayName ?? "no user"})`;
    const timing = `-# Resolved <t:${now}:s>, ${elapsedHours}hrs after escalation`;

    // Handle case where user left the server or deleted their account
    const disabledButtons = getDisabledButtons(voteMessage);
    if (!reportedMember) {
      const userLeft = reportedUser !== null;
      const reason = userLeft ? "left the server" : "account no longer exists";
      const content = `${noticeText}\n${timing} (${reason})`;

      yield* Effect.all([
        logEffect(
          "info",
          "EscalationResolver",
          "Resolving escalation - user gone",
          { reason, userLeft },
        ),
        escalationService.resolveEscalation(escalation.id, resolutions.track),
        editMessage(voteMessage, { components: disabledButtons }),
        replyAndForwardSafe(voteMessage, content, modLog),
      ]).pipe(Effect.withConcurrency("unbounded"));

      return { resolution: resolutions.track, userGone: true };
    }

    // Execute mod action first, then update DB/Discord in parallel
    yield* escalationService.executeResolution(resolution, escalation, guild);
    yield* Effect.all([
      escalationService.resolveEscalation(escalation.id, resolution),
      editMessage(voteMessage, { components: disabledButtons }),
      replyAndForwardSafe(voteMessage, `${noticeText}\n${timing}`, modLog),
      logEffect(
        "info",
        "EscalationResolver",
        "Successfully auto-resolved escalation",
        { resolution },
      ),
    ]).pipe(Effect.withConcurrency("unbounded"));

    return { resolution, userGone: false };
  }).pipe(
    Effect.withSpan("processEscalation", {
      attributes: {
        escalationId: escalation.id,
        guildId: escalation.guild_id,
        reportedUserId: escalation.reported_user_id,
      },
    }),
  );

/**
 * Check all due escalations and auto-resolve them.
 * Uses scheduled_for column to determine which escalations are ready.
 */
export const checkPendingEscalationsEffect = (client: Client) =>
  Effect.gen(function* () {
    const escalationService = yield* EscalationService;

    const due = yield* escalationService.getDueEscalations();
    yield* Effect.annotateCurrentSpan({ processed: due.length });

    if (due.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    yield* logEffect("debug", "EscalationResolver", "Processing escalations");

    // Process escalations sequentially to avoid rate limits
    // TODO: In the future, we should have a smarter fetch that manages that
    const results = yield* Effect.forEach(due, (escalation) =>
      processEscalationEffect(client, escalation).pipe(
        Effect.catchAll((error) =>
          logEffect(
            "error",
            "EscalationResolver",
            "Error processing escalation",
            { escalationId: escalation.id, error: String(error) },
          ),
        ),
      ),
    );

    const succeeded = results.filter(Boolean).length;
    const failed = results.length - succeeded;

    yield* logEffect(
      "info",
      "EscalationResolver",
      "Finished processing escalations",
      { succeeded, failed },
    );

    return { processed: due.length, succeeded, failed };
  }).pipe(Effect.withSpan("checkPendingEscalations"));
