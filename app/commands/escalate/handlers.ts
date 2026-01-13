import { MessageFlags, type MessageComponentInteraction } from "discord.js";

import { executeResolution } from "#~/discord/escalationResolver.js";
import { hasModRole } from "#~/helpers/discord.js";
import { humanReadableResolutions } from "#~/helpers/modResponse";
import { log } from "#~/helpers/observability";
import {
  getEscalation,
  getVotesForEscalation,
  resolveEscalation,
} from "#~/models/escalationVotes.server";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";

import {
  banUser,
  deleteMessages,
  kickUser,
  restrictUser,
  timeoutUser,
} from "./directActions";
import { upgradeToMajority } from "./majorityVote";
import { createEscalation } from "./simpleVote";
import { buildVotesListContent } from "./strings";
import { tallyVotes, vote } from "./voting";

const expedite = async (
  interaction: MessageComponentInteraction,
): Promise<void> => {
  const escalationId = interaction.customId.split("|")[1];
  const guildId = interaction.guildId!;
  const expeditedBy = interaction.user.id;

  // Get settings and check mod role
  const { moderator: modRoleId } = await fetchSettings(guildId, [
    SETTINGS.moderator,
  ]);

  if (!hasModRole(interaction, modRoleId)) {
    await interaction.reply({
      content: "Only moderators can expedite resolutions.",
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

  // Get current votes and determine the leading resolution
  const votes = await getVotesForEscalation(escalationId);
  const tally = tallyVotes(votes);

  if (!tally.leader) {
    await interaction.reply({
      content: "Cannot expedite: no clear leading resolution.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Execute the resolution
  await interaction.deferUpdate();
  try {
    await executeResolution(tally.leader, escalation, interaction.guild!);

    await resolveEscalation(escalationId, tally.leader);
    const expediteNote = expeditedBy
      ? `\nResolved early by <@${expeditedBy}> at <t:${Math.floor(Date.now() / 1000)}:f>`
      : "";
    await interaction.message.edit({
      content: `**${humanReadableResolutions[tally.leader]}** ✅ <@${escalation.reported_user_id}>${expediteNote}
${buildVotesListContent(tally)}`,
      components: [], // Remove buttons
    });
  } catch (error) {
    log("error", "EscalationHandlers", "Expedite failed", { error });
    await interaction.editReply(
      "Something went wrong while executing the resolution",
    );
  }
};

export const EscalationHandlers = {
  // Direct action commands (no voting)
  delete: deleteMessages,
  kick: kickUser,
  ban: banUser,
  restrict: restrictUser,
  timeout: timeoutUser,

  // Voting handlers
  expedite,
  vote,

  // Escalate button - creates a new vote or upgrades to majority
  escalate: async (interaction: MessageComponentInteraction) => {
    await interaction.deferReply({ flags: ["Ephemeral"] });
    const [_, reportedUserId, level = "0", previousEscalationId = ""] =
      interaction.customId.split("|");

    const escalationId = previousEscalationId || crypto.randomUUID();
    log("info", "EscalationHandlers", "Handling escalation", {
      reportedUserId,
      escalationId,
      level,
    });

    try {
      if (Number(level) === 0) {
        await createEscalation(interaction, reportedUserId, escalationId);
      } else {
        await upgradeToMajority(interaction, escalationId);
      }
    } catch (error) {
      log("error", "EscalationHandlers", "Error creating escalation vote", {
        error,
      });
      await interaction.editReply({
        content: "Failed to create escalation vote",
      });
    }
  },
};
