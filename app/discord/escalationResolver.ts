import { ChannelType, type Client } from "discord.js";

import {
  humanReadableResolutions,
  resolutions,
  type Resolution,
} from "#~/helpers/modResponse";
import { log, trackPerformance } from "#~/helpers/observability";
import { scheduleTask } from "#~/helpers/schedule";
import { applyRestriction, ban, kick, timeout } from "#~/models/discord.server";
import {
  getPendingEscalations,
  getVotesForEscalation,
  parseFlags,
  resolveEscalation,
  shouldAutoResolve,
  tallyVotes,
} from "#~/models/escalationVotes.server";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";

const ONE_MINUTE = 60 * 1000;

/**
 * Execute a resolution action on a user via scheduled auto-resolution.
 */
async function executeScheduledResolution(
  client: Client,
  guildId: string,
  threadId: string,
  voteMessageId: string,
  reportedUserId: string,
  resolution: Resolution,
  escalationId: string,
): Promise<void> {
  log("info", "EscalationResolver", "Auto-resolving escalation", {
    escalationId,
    resolution,
    reportedUserId,
    guildId,
  });

  try {
    const guild = await client.guilds.fetch(guildId);
    const reportedMember = await guild.members
      .fetch(reportedUserId)
      .catch(() => null);

    if (!reportedMember) {
      log("debug", "EscalationResolve", "Reported member failed to load");
      return;
    }

    switch (resolution) {
      case resolutions.track:
        // No action needed
        break;

      case resolutions.warning: {
        if (!reportedMember) break;
        // Create private thread for formal warning
        const channel = await client.channels.fetch(threadId);
        if (
          channel &&
          channel.type === ChannelType.GuildText &&
          "threads" in channel
        ) {
          const thread = await channel.threads.create({
            name: `Warning: ${reportedMember.user.username}`,
            autoArchiveDuration: 60,
            type: ChannelType.PrivateThread,
            reason:
              "Private moderation thread for formal warning (auto-resolved)",
          });
          const { moderator: modRoleId } = await fetchSettings(guildId, [
            SETTINGS.moderator,
          ]);
          await thread.members.add(reportedMember.id);
          await thread.send(
            `The <@&${modRoleId}> team has determined that your behavior is not okay in the community.
Your actions concerned the moderators enough that they felt it necessary to intervene. This message was sent by a bot, but all moderators can view this thread and are available to discuss what concerned them.`,
          );
        }
        break;
      }

      case resolutions.timeout:
        await timeout(reportedMember);
        break;

      case resolutions.restrict:
        await applyRestriction(reportedMember);
        break;

      case resolutions.kick:
        await kick(reportedMember);
        break;

      case resolutions.ban:
        await ban(reportedMember);
        break;
    }

    // Mark escalation as resolved in database
    await resolveEscalation(escalationId, resolution);

    // Try to update the vote message to show resolution
    try {
      const channel = await client.channels.fetch(threadId);
      if (channel && "messages" in channel) {
        const message = await channel.messages
          .fetch(voteMessageId)
          .catch(() => null);
        if (message) {
          await message.edit({
            content: `**Escalation Auto-Resolved** ⏰\nAction taken: **${humanReadableResolutions[resolution]}** on <@${reportedUserId}>\n_(Resolved due to timeout)_`,
            components: [],
          });
        }
      }
    } catch (error) {
      log("warn", "EscalationResolver", "Could not update vote message", {
        escalationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    log("info", "EscalationResolver", "Successfully auto-resolved escalation", {
      escalationId,
      resolution,
      reportedUserId,
    });
  } catch (error) {
    log("error", "EscalationResolver", "Failed to auto-resolve escalation", {
      escalationId,
      resolution,
      reportedUserId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Check all pending escalations and auto-resolve any that have timed out.
 */
async function checkPendingEscalations(client: Client): Promise<void> {
  await trackPerformance("checkPendingEscalations", async () => {
    const pending = await getPendingEscalations();

    if (pending.length === 0) {
      return;
    }

    log("debug", "EscalationResolver", "Checking pending escalations", {
      count: pending.length,
    });

    for (const escalation of pending) {
      try {
        const votes = await getVotesForEscalation(escalation.id);
        const tally = tallyVotes(votes);
        const flags = parseFlags(escalation.flags);

        // Check if timeout has elapsed
        if (!shouldAutoResolve(escalation.created_at, tally.totalVotes)) {
          continue;
        }

        // Determine the resolution to take
        let resolution: Resolution;

        if (tally.totalVotes === 0) {
          // No votes - default to track
          resolution = resolutions.track;
        } else if (tally.isTied) {
          // Tied - can't auto-resolve, need tiebreaker
          // For now, default to track in a tie
          log("warn", "EscalationResolver", "Auto-resolve skipped due to tie", {
            escalationId: escalation.id,
            tiedResolutions: tally.tiedResolutions,
          });
          resolution = resolutions.track;
        } else if (tally.leader) {
          // Clear leader
          const quorumReached = tally.totalVotes >= flags.quorum;
          if (quorumReached) {
            resolution = tally.leader;
          } else {
            // Not enough votes for quorum, take leading vote anyway on timeout
            resolution = tally.leader;
          }
        } else {
          // Shouldn't happen, but default to track
          resolution = resolutions.track;
        }

        await executeScheduledResolution(
          client,
          escalation.guild_id,
          escalation.thread_id,
          escalation.vote_message_id,
          escalation.reported_user_id,
          resolution,
          escalation.id,
        );
      } catch (error) {
        log("error", "EscalationResolver", "Error processing escalation", {
          escalationId: escalation.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
}

/**
 * Start the escalation resolver scheduler.
 * Runs every minute to check for escalations that should be auto-resolved.
 */
export function startEscalationResolver(client: Client): void {
  log(
    "info",
    "EscalationResolver",
    "Starting escalation resolver scheduler",
    {},
  );

  scheduleTask("EscalationResolver", ONE_MINUTE * 15, () => {
    void checkPendingEscalations(client);
  });
}
