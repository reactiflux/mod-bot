import { UserContextMenuCommandInteraction } from "discord.js";

import { PermissionFlagsBits, ContextMenuCommandBuilder } from "discord.js";
import { ApplicationCommandType } from "discord-api-types/v10";

export const command = new ContextMenuCommandBuilder()
  .setName("Force Ban")
  .setType(ApplicationCommandType.User)
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export const handler = async (
  interaction: UserContextMenuCommandInteraction,
) => {
  const { targetUser } = interaction;

  const { bans } = interaction.guild ?? {};

  if (!bans) {
    console.error("No guild found on force ban interaction");
    await interaction.reply({
      ephemeral: true,
      content: "Failed to ban user, couldn’t find guild",
    });
    return;
  }

  try {
    await interaction.guild?.bans.create(targetUser, {
      reason: "Force banned by staff",
    });
  } catch (error) {
    console.error("Failed to ban user", error);
    await interaction.reply({
      ephemeral: true,
      content:
        "Failed to ban user, try checking the bot's permissions. If they look okay, make sure that the bot’s role is near the top of the roles list — bots can't ban users with roles above their own.",
    });
    return;
  }
  await interaction.reply({
    ephemeral: true,
    content: "This member has been banned",
  });
};
