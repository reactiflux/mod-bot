import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type MessageComponentInteraction,
} from "discord.js";

import {
  humanReadableResolutions,
  type Resolution,
} from "#~/helpers/modResponse";
import { log } from "#~/helpers/observability";

import {
  banUserEffect,
  deleteMessagesEffect,
  getFailure,
  kickUserEffect,
  restrictUserEffect,
  runDirectEffect,
  runEscalationEffect,
  timeoutUserEffect,
} from ".";
import { createEscalationEffect, upgradeToMajorityEffect } from "./escalate";
import { expediteEffect } from "./expedite";
import {
  buildConfirmedMessageContent,
  buildVoteButtons,
  buildVoteMessageContent,
  buildVotesListContent,
} from "./strings";
import { voteEffect } from "./vote";

const deleteMessages = async (interaction: MessageComponentInteraction) => {
  await interaction.deferReply();

  const exit = await runDirectEffect(deleteMessagesEffect(interaction));
  if (exit._tag === "Failure") {
    const error = getFailure(exit.cause);
    log("error", "EscalationHandlers", "Error deleting messages", { error });

    if (error?._tag === "NotAuthorizedError") {
      await interaction.editReply({ content: "Insufficient permissions" });
      return;
    }

    await interaction.editReply({ content: "Failed to delete messages" });
    return;
  }

  const result = exit.value;
  await interaction.editReply(
    `Messages deleted by ${result.deletedBy} (${result.deleted}/${result.total} successful)`,
  );
};

const kickUser = async (interaction: MessageComponentInteraction) => {
  const reportedUserId = interaction.customId.split("|")[1];

  const exit = await runDirectEffect(kickUserEffect(interaction));
  if (exit._tag === "Failure") {
    const error = getFailure(exit.cause);
    log("error", "EscalationHandlers", "Error kicking user", { error });

    if (error?._tag === "NotAuthorizedError") {
      await interaction.reply({
        content: "Insufficient permissions",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.reply({
      content: "Failed to kick user",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const result = exit.value;
  await interaction.reply(`<@${reportedUserId}> kicked by ${result.actionBy}`);
};

const banUser = async (interaction: MessageComponentInteraction) => {
  const reportedUserId = interaction.customId.split("|")[1];

  const exit = await runDirectEffect(banUserEffect(interaction));
  if (exit._tag === "Failure") {
    const error = getFailure(exit.cause);
    log("error", "EscalationHandlers", "Error banning user", { error });

    if (error?._tag === "NotAuthorizedError") {
      await interaction.reply({
        content: "Insufficient permissions",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.reply({
      content: "Failed to ban user",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const result = exit.value;
  await interaction.reply(`<@${reportedUserId}> banned by ${result.actionBy}`);
};

const restrictUser = async (interaction: MessageComponentInteraction) => {
  const reportedUserId = interaction.customId.split("|")[1];

  const exit = await runDirectEffect(restrictUserEffect(interaction));
  if (exit._tag === "Failure") {
    const error = getFailure(exit.cause);
    log("error", "EscalationHandlers", "Error restricting user", { error });

    if (error?._tag === "NotAuthorizedError") {
      await interaction.reply({
        content: "Insufficient permissions",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.reply({
      content: "Failed to restrict user",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const result = exit.value;
  await interaction.reply(
    `<@${reportedUserId}> restricted by ${result.actionBy}`,
  );
};

const timeoutUser = async (interaction: MessageComponentInteraction) => {
  const reportedUserId = interaction.customId.split("|")[1];

  const exit = await runDirectEffect(timeoutUserEffect(interaction));
  if (exit._tag === "Failure") {
    const error = getFailure(exit.cause);
    log("error", "EscalationHandlers", "Error timing out user", { error });

    if (error?._tag === "NotAuthorizedError") {
      await interaction.reply({
        content: "Insufficient permissions",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.reply({
      content: "Failed to timeout user",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const result = exit.value;
  await interaction.reply(
    `<@${reportedUserId}> timed out by ${result.actionBy}`,
  );
};

const vote = (resolution: Resolution) =>
  async function handleVote(
    interaction: MessageComponentInteraction,
  ): Promise<void> {
    const exit = await runEscalationEffect(voteEffect(resolution)(interaction));
    if (exit._tag === "Failure") {
      const error = getFailure(exit.cause);
      log("error", "EscalationHandlers", "Error voting", { error, resolution });

      if (error?._tag === "NotAuthorizedError") {
        await interaction.reply({
          content: "Only moderators can vote on escalations.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      if (error?._tag === "EscalationNotFoundError") {
        await interaction.reply({
          content: "Escalation not found.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      if (error?._tag === "AlreadyResolvedError") {
        await interaction.reply({
          content: "This escalation has already been resolved.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      await interaction.reply({
        content: "Something went wrong while recording your vote.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const result = exit.value;
    const {
      escalation,
      tally,
      modRoleId,
      features,
      votingStrategy,
      earlyResolution,
    } = result;

    // Check if early resolution triggered with clear winner - show confirmed state
    if (earlyResolution && !tally.isTied && tally.leader) {
      await interaction.update({
        content: buildConfirmedMessageContent(escalation, tally.leader, tally),
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`expedite|${escalation.id}`)
              .setLabel("Expedite")
              .setStyle(ButtonStyle.Primary),
          ),
        ],
      });
      return;
    }

    // Update the message with new vote state
    await interaction.update({
      content: buildVoteMessageContent(
        modRoleId ?? "",
        votingStrategy,
        escalation,
        tally,
      ),
      components: buildVoteButtons(
        features,
        votingStrategy,
        escalation,
        tally,
        earlyResolution,
      ),
    });
  };

const expedite = async (
  interaction: MessageComponentInteraction,
): Promise<void> => {
  await interaction.deferUpdate();

  const exit = await runEscalationEffect(expediteEffect(interaction));
  if (exit._tag === "Failure") {
    const error = getFailure(exit.cause);
    log("error", "EscalationHandlers", "Expedite failed", { error });

    if (error?._tag === "NotAuthorizedError") {
      await interaction.followUp({
        content: "Only moderators can expedite resolutions.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    if (error?._tag === "EscalationNotFoundError") {
      await interaction.followUp({
        content: "Escalation not found.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    if (error?._tag === "AlreadyResolvedError") {
      await interaction.followUp({
        content: "This escalation has already been resolved.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }
    if (error?._tag === "NoLeaderError") {
      await interaction.followUp({
        content: "Cannot expedite: no clear leading resolution.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.followUp({
      content: "Something went wrong while executing the resolution.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const result = exit.value;
  const expediteNote = `\nResolved early by <@${interaction.user.id}> at <t:${Math.floor(Date.now() / 1000)}:f>`;

  await interaction.message.edit({
    content: `**${humanReadableResolutions[result.resolution]}** ✅ <@${result.escalation.reported_user_id}>${expediteNote}
${buildVotesListContent(result.tally)}`,
    components: [], // Remove buttons
  });
};

// Escalate Handler

const escalate = async (interaction: MessageComponentInteraction) => {
  await interaction.deferReply({ flags: ["Ephemeral"] });

  const [_, reportedUserId, level = "0", previousEscalationId = ""] =
    interaction.customId.split("|");

  const escalationId = previousEscalationId || crypto.randomUUID();
  log("info", "EscalationHandlers", "Handling escalation", {
    reportedUserId,
    escalationId,
    level,
  });

  if (Number(level) === 0) {
    // Create new escalation
    const exit = await runEscalationEffect(
      createEscalationEffect(interaction, reportedUserId, escalationId),
    );

    if (exit._tag === "Failure") {
      const error = getFailure(exit.cause);
      log("error", "EscalationHandlers", "Error creating escalation vote", {
        error,
      });
      await interaction.editReply({
        content: "Failed to create escalation vote",
      });
      return;
    }

    await interaction.editReply("Escalation started");
  } else {
    // Upgrade to majority voting
    const exit = await runEscalationEffect(
      upgradeToMajorityEffect(interaction, escalationId),
    );

    if (exit._tag === "Failure") {
      const error = getFailure(exit.cause);
      log("error", "EscalationHandlers", "Error upgrading escalation", {
        error,
      });

      if (error?._tag === "EscalationNotFoundError") {
        await interaction.editReply({
          content: "Failed to re-escalate, couldn't find escalation",
        });
        return;
      }

      await interaction.editReply({ content: "Failed to upgrade escalation" });
      return;
    }

    await interaction.editReply("Escalation upgraded to majority voting");
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
  escalate,
};
