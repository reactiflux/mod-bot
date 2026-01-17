import {
  ActionRowBuilder,
  ButtonBuilder,
  ComponentType,
  type Client,
  type Guild,
  type Message,
  type ThreadChannel,
} from "discord.js";

import { tallyVotes } from "#~/commands/escalate/voting.js";
import { registerScheduledTask } from "#~/discord/client.server";
import {
  humanReadableResolutions,
  resolutions,
  type Resolution,
} from "#~/helpers/modResponse";
import { log, trackPerformance } from "#~/helpers/observability";
import { scheduleTask } from "#~/helpers/schedule";
import { applyRestriction, ban, kick, timeout } from "#~/models/discord.server";
import {
  getDueEscalations,
  getVotesForEscalation,
  resolveEscalation,
  type Escalation,
} from "#~/models/escalationVotes.server";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server.ts";

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
        await timeout(reportedMember, "voted resolution");
        break;

      case resolutions.restrict:
        await applyRestriction(reportedMember);
        break;

      case resolutions.kick:
        await kick(reportedMember, "voted resolution");
        break;

      case resolutions.ban:
        await ban(reportedMember, "voted resolution");
        break;
    }
  } catch (error) {
    log("error", "EscalationControls", "Failed to execute resolution", {
      ...logBag,
      error,
    });
    throw error;
  }
}

const ONE_MINUTE = 60 * 1000;

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
    const { modLog } = await fetchSettings(escalation.guild_id, [
      SETTINGS.modLog,
    ]);
    const [guild, channel, reportedUser, votes] = await Promise.all([
      client.guilds.fetch(escalation.guild_id),
      client.channels.fetch(escalation.thread_id) as Promise<ThreadChannel>,
      client.users.fetch(escalation.reported_user_id).catch(() => null),
      getVotesForEscalation(escalation.id),
    ]);
    const voters = new Set(votes.map((v) => v.voter_id));
    const [reportedMember, vote] = await Promise.all([
      guild.members.fetch(escalation.reported_user_id).catch(() => null),
      channel.messages.fetch(escalation.vote_message_id),
    ]);

    const now = Math.floor(Date.now() / 1000);
    const createdAt = Math.floor(
      Number(new Date(escalation.created_at)) / 1000,
    );
    const elapsedHours = Math.floor((now - createdAt) / 60 / 60);
    const totalVotes = votes.length;
    const totalVoters = voters.size;

    const noticeText = `Resolved with ${totalVotes} votes from ${totalVoters} voters: **${humanReadableResolutions[resolution]}** <@${escalation.reported_user_id}> (${reportedUser?.displayName ?? "no user"})`;
    const timing = `-# Resolved <t:${now}:s>, ${elapsedHours}hrs after escalation`;

    // Handle case where user left the server or deleted their account
    if (!reportedMember) {
      const userLeft = reportedUser !== null;
      const reason = userLeft ? "left the server" : "account no longer exists";

      log("info", "EscalationResolver", "Resolving escalation - user gone", {
        ...logBag,
        reason,
        userLeft,
      });

      // Mark as resolved with "track" since we can't take action
      await resolveEscalation(escalation.id, resolutions.track);
      await vote.edit({ components: getDisabledButtons(vote) });
      try {
        const notice = await vote.reply({
          content: `${noticeText}\n${timing} (${reason})`,
        });
        await notice.forward(modLog);
      } catch (error) {
        log("warn", "EscalationResolver", "Could not update vote message", {
          ...logBag,
          error,
        });
      }
      return;
    }

    await executeResolution(resolution, escalation, guild);
    await resolveEscalation(escalation.id, resolution);
    await vote.edit({
      components: getDisabledButtons(vote),
    });

    try {
      const notice = await vote.reply({
        content: `${noticeText}\n${timing}`,
      });
      await notice.forward(modLog);
    } catch (error) {
      log("warn", "EscalationResolver", "Could not update vote message", {
        ...logBag,
        error,
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
      error,
    });
  }
}

/**
 * Check all due escalations and auto-resolve them.
 * Uses scheduled_for column to determine which escalations are ready.
 */
async function checkPendingEscalations(client: Client): Promise<void> {
  await trackPerformance("checkPendingEscalations", async () => {
    const due = await getDueEscalations();

    if (due.length === 0) {
      return;
    }

    log("debug", "EscalationResolver", "Processing due escalations", {
      count: due.length,
    });

    for (const escalation of due) {
      try {
        const votes = await getVotesForEscalation(escalation.id);
        const tally = tallyVotes(votes);
        const votingStrategy = escalation.voting_strategy;

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
            votingStrategy,
          });
          resolution = resolutions.track;
        } else if (tally.leader) {
          // Clear leader - take leading vote on timeout (works for both simple and majority strategies)
          resolution = tally.leader;
        } else {
          // Shouldn't happen, but default to track
          resolution = resolutions.track;
        }

        await executeScheduledResolution(client, escalation, resolution);
      } catch (error) {
        log("error", "EscalationResolver", "Error processing escalation", {
          escalationId: escalation.id,
          error,
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

  const handle = scheduleTask("EscalationResolver", ONE_MINUTE * 15, () => {
    void checkPendingEscalations(client);
  });

  // Register timers for HMR cleanup
  if (handle) {
    registerScheduledTask(handle.initialTimer);
    // The interval timer is created inside the setTimeout, so we need to
    // register it when it's available. Since clearScheduledTasks clears both
    // timeouts and intervals, the initial timer registration will handle cleanup.
  }
}
