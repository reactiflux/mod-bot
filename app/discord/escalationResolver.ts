import { type Client, type Guild, type ThreadChannel } from "discord.js";

import { tallyVotes } from "#~/commands/escalate/voting.js";
import { parseFlags, shouldAutoResolve } from "#~/helpers/escalationVotes.js";
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
  resolveEscalation,
  type Escalation,
} from "#~/models/escalationVotes.server";

export async function executeResolution(
  resolution: Resolution,
  escalation: Escalation,
  guild: Guild,
): Promise<void> {
  const logBag = {
    resolution,
    reportedUserId: escalation.reported_user_id,
    escalationId: escalation.id,
  };
  log("info", "EscalationControls", "Executing resolution", logBag);

  const reportedMember = await guild.members
    .fetch(escalation.reported_user_id)
    .catch(() => null);
  if (!reportedMember) {
    log("debug", "Failed to find reported member", JSON.stringify(logBag));
    return;
  }

  try {
    switch (resolution) {
      case resolutions.track:
        // No action needed, just track
        break;

      //       case resolutions.warning: {
      //         // Create private thread for formal warning

      //         if (channel && "threads" in channel) {
      //           const textChannel = channel as TextChannel;
      //           const thread = await textChannel.threads.create({
      //             name: `Warning: ${reportedMember.user.username}`,
      //             autoArchiveDuration: 60,
      //             type: ChannelType.PrivateThread,
      //             reason: "Private moderation thread for formal warning",
      //           });
      //           const { moderator: modRoleId } = await fetchSettings(guildId, [
      //             SETTINGS.moderator,
      //           ]);
      //           await thread.members.add(reportedMember.id);
      //           await thread.send(
      //             `The <@&${modRoleId}> team has determined that your behavior is not okay in the community.
      // Your actions concerned the moderators enough that they felt it necessary to intervene. This message was sent by a bot, but all moderators can view this thread and are available to discuss what concerned them.`,
      //           );
      //         }
      //         break;
      //       }

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
  } catch (error) {
    log("error", "EscalationControls", "Failed to execute resolution", {
      ...logBag,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

const ONE_MINUTE = 60 * 1000;

/**
 * Execute a resolution action on a user via scheduled auto-resolution.
 */
async function executeScheduledResolution(
  client: Client,
  escalation: Escalation,
  resolution: Resolution,
): Promise<void> {
  const logBag = {
    escalationId: escalation.id,
    resolution,
    reportedUserId: escalation.reported_user_id,
    guildId: escalation.guild_id,
  };
  log("info", "EscalationResolver", "Auto-resolving escalation", logBag);

  try {
    const [guild, channel] = await Promise.all([
      client.guilds.fetch(escalation.guild_id),
      client.channels.fetch(escalation.thread_id) as Promise<ThreadChannel>,
    ]);
    const reportedMember = await guild.members
      .fetch(escalation.reported_user_id)
      .catch(() => null);
    const vote = await channel.messages.fetch(escalation.vote_message_id);

    if (!reportedMember) {
      log("debug", "EscalationResolve", "Reported member failed to load");
      return;
    }

    await executeResolution(resolution, escalation, guild);
    await resolveEscalation(escalation.id, resolution);

    try {
      // @ts-expect-error cuz nullcheck but ! is harder to search for
      const resolvedAt = new Date(escalation.resolved_at);
      const elapsed =
        Number(resolvedAt) - Number(new Date(escalation.created_at));
      await vote.reply({
        content: `Escalation Resolved: **${humanReadableResolutions[resolution]}** on <@${escalation.reported_user_id}> (${reportedMember.displayName})\n-# _(Resolved <t:${Math.floor(Number(resolvedAt) / 1000)}:t>), ${Math.floor(elapsed / 1000 / 60 / 60)}hrs later_`,
        components: [],
      });
    } catch (error) {
      log("warn", "EscalationResolver", "Could not update vote message", {
        ...logBag,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    log(
      "info",
      "EscalationResolver",
      "Successfully auto-resolved escalation",
      logBag,
    );
  } catch (error) {
    log("error", "EscalationResolver", "Failed to auto-resolve escalation", {
      ...logBag,
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

        await executeScheduledResolution(client, escalation, resolution);
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
 * Runs every 15 minutes to check for escalations that should be auto-resolved.
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
