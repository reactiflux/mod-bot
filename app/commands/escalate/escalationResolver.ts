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

    const logBag = {
      escalationId: escalation.id,
      reportedUserId: escalation.reported_user_id,
      guildId: escalation.guild_id,
    };

    yield* logEffect(
      "info",
      "EscalationResolver",
      "Processing due escalation",
      logBag,
    );

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
        {
          ...logBag,
          tiedResolutions: tally.tiedResolutions,
          votingStrategy,
        },
      );
      resolution = resolutions.track;
    } else if (tally.leader) {
      resolution = tally.leader;
    } else {
      resolution = resolutions.track;
    }

    yield* logEffect(
      "info",
      "EscalationResolver",
      "Auto-resolving escalation",
      {
        ...logBag,
        resolution,
      },
    );

    // Fetch Discord resources
    const { modLog } = yield* fetchSettingsEffect(escalation.guild_id, [
      SETTINGS.modLog,
    ]);

    const guild = yield* fetchGuild(client, escalation.guild_id);
    const channel = yield* fetchChannelFromClient<ThreadChannel>(
      client,
      escalation.thread_id,
    );
    const reportedUser = yield* fetchUserOrNull(
      client,
      escalation.reported_user_id,
    );
    const voteMessage = yield* fetchMessage(
      channel,
      escalation.vote_message_id,
    );
    const reportedMember = yield* fetchMemberOrNull(
      guild,
      escalation.reported_user_id,
    );

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
    if (!reportedMember) {
      const userLeft = reportedUser !== null;
      const reason = userLeft ? "left the server" : "account no longer exists";
      const content = `${noticeText}\n${timing} (${reason})`;

      yield* logEffect(
        "info",
        "EscalationResolver",
        "Resolving escalation - user gone",
        {
          ...logBag,
          reason,
          userLeft,
        },
      );

      // Mark as resolved with "track" since we can't take action
      yield* escalationService.resolveEscalation(
        escalation.id,
        resolutions.track,
      );

      yield* editMessage(voteMessage, {
        components: getDisabledButtons(voteMessage),
      });

      // Try to reply and forward - but don't fail if it doesn't work
      yield* replyAndForwardSafe(voteMessage, content, modLog);

      return { resolution: resolutions.track, userGone: true };
    }

    // Execute the resolution
    yield* escalationService.executeResolution(resolution, escalation, guild);

    // Mark as resolved
    yield* escalationService.resolveEscalation(escalation.id, resolution);

    // Update Discord message
    yield* editMessage(voteMessage, {
      components: getDisabledButtons(voteMessage),
    });

    // Try to reply and forward - but don't fail if it doesn't work
    yield* replyAndForwardSafe(voteMessage, `${noticeText}\n${timing}`, modLog);

    yield* logEffect(
      "info",
      "EscalationResolver",
      "Successfully auto-resolved escalation",
      { ...logBag, resolution },
    );

    return { resolution, userGone: false };
  }).pipe(
    Effect.withSpan("processEscalation", {
      attributes: {
        escalationId: escalation.id,
        guildId: escalation.guild_id,
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

    if (due.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    yield* logEffect(
      "debug",
      "EscalationResolver",
      "Processing due escalations",
      {
        count: due.length,
      },
    );

    let succeeded = 0;
    let failed = 0;

    // Process escalations sequentially to avoid rate limits
    for (const escalation of due) {
      yield* processEscalationEffect(client, escalation).pipe(
        Effect.map(() => {
          succeeded++;
          return true;
        }),
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            failed++;
            yield* logEffect(
              "error",
              "EscalationResolver",
              "Error processing escalation",
              {
                escalationId: escalation.id,
                error: String(error),
              },
            );
            return false;
          }),
        ),
      );
    }

    yield* logEffect(
      "info",
      "EscalationResolver",
      "Finished processing escalations",
      {
        processed: due.length,
        succeeded,
        failed,
      },
    );

    return { processed: due.length, succeeded, failed };
  }).pipe(Effect.withSpan("checkPendingEscalations"));
