import {
  MessageFlags,
  PermissionsBitField,
  type MessageComponentInteraction,
} from "discord.js";

import { deleteAllReportedForUser } from "#~/effects/models/reportedMessages.js";
import { hasModRole } from "#~/helpers/discord.js";
import { log } from "#~/helpers/observability";
import { applyRestriction, ban, kick, timeout } from "#~/models/discord.server";
import { fetchSettings, SETTINGS } from "#~/models/guilds.server";

export const deleteMessages = async (
  interaction: MessageComponentInteraction,
) => {
  await interaction.deferReply();
  const reportedUserId = interaction.customId.split("|")[1];
  const guildId = interaction.guildId!;

  const member = await interaction.guild!.members.fetch(interaction.user.id);
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
    log("error", "EscalationHandlers", "Error deleting reported messages", {
      error,
    });
    await interaction.editReply({
      content: "Failed to delete messages",
    });
  }
};

export const kickUser = async (interaction: MessageComponentInteraction) => {
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
      kick(reportedMember, "single moderator decision"),
      interaction.reply(
        `<@${reportedUserId}> kicked by ${interaction.user.username}`,
      ),
    ]);
  } catch (error) {
    log("error", "EscalationHandlers", "Error kicking user", { error });
    await interaction.reply({
      content: "Failed to kick user",
      flags: [MessageFlags.Ephemeral],
    });
  }
};

export const banUser = async (interaction: MessageComponentInteraction) => {
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
      ban(reportedMember, "single moderator decision"),
      interaction.reply(
        `<@${reportedUserId}> banned by ${interaction.user.username}`,
      ),
    ]);
  } catch (error) {
    log("error", "EscalationHandlers", "Error banning user", { error });
    await interaction.reply({
      content: "Failed to ban user",
      flags: [MessageFlags.Ephemeral],
    });
  }
};

export const restrictUser = async (
  interaction: MessageComponentInteraction,
) => {
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
    log("error", "EscalationHandlers", "Error restricting user", { error });
    await interaction.reply({
      content: "Failed to restrict user",
      flags: [MessageFlags.Ephemeral],
    });
  }
};

export const timeoutUser = async (interaction: MessageComponentInteraction) => {
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
      timeout(reportedMember, "single moderator decision"),
      interaction.reply(
        `<@${reportedUserId}> timed out by ${interaction.user.username}`,
      ),
    ]);
  } catch (error) {
    log("error", "EscalationHandlers", "Error timing out user", { error });
    await interaction.reply({
      content: "Failed to timeout user",
      flags: [MessageFlags.Ephemeral],
    });
  }
};
