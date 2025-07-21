import type { ChatInputCommandInteraction } from "discord.js";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

import { SETTINGS, setSettings, registerGuild } from "#~/models/guilds.server";
import { log, trackPerformance } from "#~/helpers/observability";
import { commandStats } from "#~/helpers/metrics";

const command = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Set up necessities for using the bot")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addRoleOption((x) =>
    x
      .setName("moderator")
      .setDescription("The role that grants moderator permissions for a user")
      .setRequired(true),
  )
  .addChannelOption((x) =>
    x
      .setName("mod-log-channel")
      .setDescription("The channel where moderation reports will be sent")
      .setRequired(true),
  )
  .addRoleOption((x) =>
    x
      .setName("restricted")
      .setDescription(
        "The role that prevents a member from accessing some channels",
      ),
  ) as SlashCommandBuilder;

const handler = async (interaction: ChatInputCommandInteraction) => {
  await trackPerformance(
    "setupCommand",
    async () => {
      log("info", "Commands", "Setup command executed", {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        username: interaction.user.username,
      });

      try {
        if (!interaction.guild) throw new Error("Interaction has no guild");

        await registerGuild(interaction.guildId!);

        const role = interaction.options.getRole("moderator");
        const channel = interaction.options.getChannel("mod-log-channel");
        const restricted = interaction.options.getRole("restricted");
        if (!role) throw new Error("Interaction has no role");
        if (!channel) throw new Error("Interaction has no channel");

        const settings = {
          [SETTINGS.modLog]: channel.id,
          [SETTINGS.moderator]: role.id,
          [SETTINGS.restricted]: restricted?.id,
        };

        await setSettings(interaction.guildId!, settings);

        log("info", "Commands", "Setup completed successfully", {
          guildId: interaction.guildId,
          userId: interaction.user.id,
          moderatorRoleId: role.id,
          modLogChannelId: channel.id,
          restrictedRoleId: restricted?.id,
          hasRestrictedRole: !!restricted,
        });

        // Track successful setup in business analytics
        commandStats.setupCompleted(interaction, {
          moderator: role.id,
          modLog: channel.id,
          restricted: restricted?.id,
        });

        // Track command success
        commandStats.commandExecuted(interaction, "setup", true);

        await interaction.reply("Setup completed!");
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));

        log("error", "Commands", "Setup command failed", {
          guildId: interaction.guildId,
          userId: interaction.user.id,
          error: error.message,
          stack: error.stack,
        });

        // Track command failure in business analytics
        commandStats.commandFailed(interaction, "setup", error.message);

        await interaction.reply(`Something broke:
\`\`\`
${error.toString()}
\`\`\`
`);
      }
    },
    {
      commandName: "setup",
      guildId: interaction.guildId,
      userId: interaction.user.id,
    },
  );
};

export const Command = { handler, command };
