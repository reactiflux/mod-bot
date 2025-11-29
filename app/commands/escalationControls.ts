import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  InteractionType,
  MessageFlags,
  PermissionsBitField,
  type MessageComponentInteraction,
  type TextChannel,
} from "discord.js";

import { type MessageComponentCommand } from "#~/helpers/discord";
import {
  humanReadableResolutions,
  resolutions,
  type Resolution,
} from "#~/helpers/modResponse";
import { log } from "#~/helpers/observability";
import { applyRestriction, ban, kick, timeout } from "#~/models/discord.server";
import {
  calculateTimeoutHours,
  createEscalation,
  getEscalation,
  getVotesForEscalation,
  parseFlags,
  recordVote,
  resolveEscalation,
  tallyVotes,
  type VoteTally,
} from "#~/models/escalationVotes.server";
import {
  DEFAULT_QUORUM,
  fetchSettings,
  SETTINGS,
} from "#~/models/guilds.server";
import { deleteAllReportedForUser } from "#~/models/reportedMessages.server";

function buildVotesListContent(tally: VoteTally) {
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
function buildVoteMessageContent(
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
function buildVoteButtons(
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

function hasModRole(
  interaction: MessageComponentInteraction,
  modRoleId: string,
): boolean {
  const member = interaction.member;
  if (!member) return false;

  if (Array.isArray(member.roles)) {
    return member.roles.includes(modRoleId);
  }
  return member.roles.cache.has(modRoleId);
}

/**
 * Execute a resolution action on a user.
 */
async function executeResolution(
  resolution: Resolution,
  interaction: MessageComponentInteraction,
  reportedUserId: string,
  escalationId: string,
  tally: VoteTally,
): Promise<void> {
  const guild = interaction.guild!;
  const guildId = guild.id;

  log("info", "EscalationControls", "Executing resolution", {
    resolution,
    reportedUserId,
    escalationId,
  });

  try {
    const reportedMember = await guild.members
      .fetch(reportedUserId)
      .catch(() => null);

    switch (resolution) {
      case resolutions.track:
        // No action needed, just track
        break;

      case resolutions.warning: {
        if (!reportedMember) break;
        // Create private thread for formal warning
        const channel = interaction.channel;
        if (channel && "threads" in channel) {
          const textChannel = channel as TextChannel;
          const thread = await textChannel.threads.create({
            name: `Warning: ${reportedMember.user.username}`,
            autoArchiveDuration: 60,
            type: ChannelType.PrivateThread,
            reason: "Private moderation thread for formal warning",
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
        if (reportedMember) {
          await timeout(reportedMember);
        }
        break;

      case resolutions.restrict:
        if (reportedMember) {
          await applyRestriction(reportedMember);
        }
        break;

      case resolutions.kick:
        if (reportedMember) {
          await kick(reportedMember);
        }
        break;

      case resolutions.ban:
        if (reportedMember) {
          await ban(reportedMember);
        }
        break;
    }

    // Mark escalation as resolved in database
    await resolveEscalation(escalationId, resolution);

    // Update the vote message to show resolution
    if (interaction.message) {
      await interaction.message.edit({
        content: `**Escalation Resolved** ✅\nAction taken: **${humanReadableResolutions[resolution]}** on <@${reportedUserId}>
${buildVotesListContent(tally)}`,
        components: [], // Remove buttons
      });
    }
  } catch (error) {
    log("error", "EscalationControls", "Failed to execute resolution", {
      resolution,
      reportedUserId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Handle a vote being cast.
 */
async function handleVote(
  interaction: MessageComponentInteraction,
  resolution: Resolution,
  escalationId: string,
): Promise<void> {
  const guildId = interaction.guildId!;

  // Get settings
  const { moderator: modRoleId } = await fetchSettings(guildId, [
    SETTINGS.moderator,
  ]);

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
    odId: interaction.user.id,
    vote: resolution,
  });

  // Get updated votes and tally
  const votes = await getVotesForEscalation(escalationId);
  const tally = tallyVotes(votes);
  const flags = parseFlags(escalation.flags);
  const quorum = flags.quorum;
  const quorumReached = tally.totalVotes >= quorum;

  // Check if we should resolve
  if (quorumReached && !tally.isTied && tally.leader) {
    // Quorum reached with clear winner - execute resolution
    await interaction.deferUpdate();
    try {
      await executeResolution(
        tally.leader as Resolution,
        interaction,
        escalation.reported_user_id,
        escalationId,
        tally,
      );
    } catch (error) {
      log("error", "resolution failed", JSON.stringify({ error }));
      await interaction.editReply(
        "Something went wrong while executing the resolution",
      );
    }
    return;
  }
  console.log(escalation.created_at);
  // Update the message with new vote state

  await interaction.update({
    content: buildVoteMessageContent(
      escalation.reported_user_id,
      tally,
      quorum,
      escalation.created_at,
    ),
    components: buildVoteButtons(escalationId, tally, quorumReached),
  });
}

// Create vote handlers for each resolution
const voteHandlers: MessageComponentCommand[] = Object.values(resolutions).map(
  (resolution) => ({
    command: {
      type: InteractionType.MessageComponent as const,
      name: `vote-${resolution}`,
    },
    handler: async (interaction: MessageComponentInteraction) => {
      const escalationId = interaction.customId.split("|")[1];
      await handleVote(interaction, resolution, escalationId);
    },
  }),
);

export const EscalationCommands: MessageComponentCommand[] = [
  // Direct action commands (no voting)
  {
    command: {
      type: InteractionType.MessageComponent,
      name: "escalate-delete",
    },
    handler: async (interaction) => {
      await interaction.deferReply();
      const reportedUserId = interaction.customId.split("|")[1];
      const guildId = interaction.guildId!;

      const member = await interaction.guild!.members.fetch(
        interaction.user.id,
      );
      if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        await interaction.editReply({
          content: "Insufficient permissions",
        });
        return;
      }

      try {
        const result = await deleteAllReportedForUser(reportedUserId, guildId);
        await interaction.editReply(
          `Messages deleted by ${interaction.user.username} (${result.deleted}/${result.total} successful)`,
        );
      } catch (error) {
        console.error("Error deleting reported messages:", error);
        await interaction.editReply({
          content: "Failed to delete messages",
        });
      }
    },
  },

  {
    command: { type: InteractionType.MessageComponent, name: "escalate-kick" },
    handler: async (interaction) => {
      const reportedUserId = interaction.customId.split("|")[1];
      const guildId = interaction.guildId!;

      const { moderator: modRoleId } = await fetchSettings(guildId, [
        SETTINGS.moderator,
      ]);

      if (!hasModRole(interaction, modRoleId)) {
        await interaction.reply({
          content: "Insufficient permissions",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      try {
        const reportedMember =
          await interaction.guild!.members.fetch(reportedUserId);
        await Promise.allSettled([
          kick(reportedMember),
          interaction.reply(
            `<@${reportedUserId}> kicked by ${interaction.user.username}`,
          ),
        ]);
      } catch (error) {
        console.error("Error kicking user:", error);
        await interaction.reply({
          content: "Failed to kick user",
          flags: [MessageFlags.Ephemeral],
        });
      }
    },
  },

  {
    command: { type: InteractionType.MessageComponent, name: "escalate-ban" },
    handler: async (interaction) => {
      const reportedUserId = interaction.customId.split("|")[1];
      const guildId = interaction.guildId!;

      const { moderator: modRoleId } = await fetchSettings(guildId, [
        SETTINGS.moderator,
      ]);

      if (!hasModRole(interaction, modRoleId)) {
        await interaction.reply({
          content: "Insufficient permissions",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      try {
        const reportedMember =
          await interaction.guild!.members.fetch(reportedUserId);
        await Promise.allSettled([
          ban(reportedMember),
          interaction.reply(
            `<@${reportedUserId}> banned by ${interaction.user.username}`,
          ),
        ]);
      } catch (error) {
        console.error("Error banning user:", error);
        await interaction.reply({
          content: "Failed to ban user",
          flags: [MessageFlags.Ephemeral],
        });
      }
    },
  },

  {
    command: {
      type: InteractionType.MessageComponent,
      name: "escalate-restrict",
    },
    handler: async (interaction) => {
      const reportedUserId = interaction.customId.split("|")[1];
      const guildId = interaction.guildId!;

      const { moderator: modRoleId } = await fetchSettings(guildId, [
        SETTINGS.moderator,
      ]);

      if (!hasModRole(interaction, modRoleId)) {
        await interaction.reply({
          content: "Insufficient permissions",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      try {
        const reportedMember =
          await interaction.guild!.members.fetch(reportedUserId);
        await Promise.allSettled([
          applyRestriction(reportedMember),
          interaction.reply(
            `<@${reportedUserId}> restricted by ${interaction.user.username}`,
          ),
        ]);
      } catch (error) {
        console.error("Error restricting user:", error);
        await interaction.reply({
          content: "Failed to restrict user",
          flags: [MessageFlags.Ephemeral],
        });
      }
    },
  },

  {
    command: {
      type: InteractionType.MessageComponent,
      name: "escalate-timeout",
    },
    handler: async (interaction) => {
      const reportedUserId = interaction.customId.split("|")[1];
      const guildId = interaction.guildId!;

      const { moderator: modRoleId } = await fetchSettings(guildId, [
        SETTINGS.moderator,
      ]);

      if (!hasModRole(interaction, modRoleId)) {
        await interaction.reply({
          content: "Insufficient permissions",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      try {
        const reportedMember =
          await interaction.guild!.members.fetch(reportedUserId);
        await Promise.allSettled([
          timeout(reportedMember),
          interaction.reply(
            `<@${reportedUserId}> timed out by ${interaction.user.username}`,
          ),
        ]);
      } catch (error) {
        console.error("Error timing out user:", error);
        await interaction.reply({
          content: "Failed to timeout user",
          flags: [MessageFlags.Ephemeral],
        });
      }
    },
  },

  // Escalate button - creates a new vote
  {
    command: {
      type: InteractionType.MessageComponent,
      name: "escalate-escalate",
    },
    handler: async (interaction) => {
      const reportedUserId = interaction.customId.split("|")[1];
      const guildId = interaction.guildId!;
      const threadId = interaction.channelId;

      // Get settings
      let quorum = DEFAULT_QUORUM;
      let modRoleId: string;
      try {
        const settings = await fetchSettings(guildId, [
          SETTINGS.moderator,
          SETTINGS.quorum,
        ]);
        modRoleId = settings.moderator;
        if (settings.quorum !== undefined && settings.quorum !== null) {
          quorum = settings.quorum;
        }
      } catch {
        const settings = await fetchSettings(guildId, [SETTINGS.moderator]);
        modRoleId = settings.moderator;
      }

      try {
        // Acknowledge immediately
        await interaction.deferReply();

        // Create vote message first (we need its ID for the database)
        const emptyTally: VoteTally = {
          totalVotes: 0,
          byResolution: new Map(),
          leader: null,
          leaderCount: 0,
          isTied: false,
          tiedResolutions: [],
        };

        // Create escalation record
        const escalationId = await createEscalation({
          guildId,
          threadId,
          voteMessageId: interaction.message.id,
          reportedUserId,
          quorum,
        });

        // Now update the message with the real content and buttons
        const createdAt = new Date().toISOString();
        const channel = interaction.channel;
        if (channel && "send" in channel) {
          console.log(createdAt);

          await channel.send({
            content: buildVoteMessageContent(
              reportedUserId,
              emptyTally,
              quorum,
              createdAt,
            ),
            components: buildVoteButtons(escalationId, emptyTally, false),
          });
        }

        // Send notification
        await interaction.editReply({
          content: `Escalation started. <@&${modRoleId}> please vote on how to handle <@${reportedUserId}>.`,
        });
      } catch (error) {
        console.error("Error creating escalation vote:", error);
        await interaction.editReply({
          content: "Failed to create escalation vote",
        });
      }
    },
  },

  // Vote handlers
  ...voteHandlers,
];
