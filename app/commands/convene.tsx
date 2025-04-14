import {
  ChannelType,
  ContextMenuCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import type {
  MessageContextMenuCommandInteraction,
  TextChannel,
} from "discord.js";
import { ApplicationCommandType } from "discord-api-types/v10";

import { reacord } from "#~/discord/client.server";
import { quoteAndEscape } from "#~/helpers/discord";
import { ReportReasons, reportUser } from "#~/helpers/modLog";
import { resolutions } from "#~/helpers/modResponse";

import { fetchSettings, SETTINGS } from "#~/models/guilds.server";
import { applyRestriction, ban, kick, timeout } from "#~/models/discord.server";
import { ModResponse } from "#~/commands/reacord/ModResponse";

export const command = new ContextMenuCommandBuilder()
  .setName("Convene mods")
  .setType(ApplicationCommandType.Message)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export const handler = async (
  interaction: MessageContextMenuCommandInteraction,
) => {
  const { targetMessage: message, member, guild } = interaction;
  if (!member || !guild) {
    console.log(
      `Bailing out of Convene Mods because member or guild weren't defined:`,
      { member, guild },
    );
    await interaction.reply({
      content: "Couldn’t find one of member or guild",
      ephemeral: true,
    });
    return;
  }

  const { modLog, moderator } = await fetchSettings(guild, [
    SETTINGS.modLog,
    SETTINGS.moderator,
  ]);
  const logChannel = (await guild.channels.fetch(modLog)) as TextChannel;
  if (!logChannel || logChannel.type !== ChannelType.GuildText) {
    console.log(
      "Bailing out of Convene Mods because mod log channel wasn't found",
    );
    await interaction.reply({
      content: "Failed to load mod channel",
      ephemeral: true,
    });
    return;
  }

  const { thread } = await reportUser({
    message,
    reason: ReportReasons.mod,
    staff: interaction.user,
    extra: `‼️ <@${interaction.user.id}> requested mods respond`,
  });

  const staff = interaction.user;
  const originalChannel = (await message.channel.fetch()) as TextChannel;
  const pollInstance = reacord.createChannelMessage(thread.id).render(
    <ModResponse
      modRoleId={moderator}
      onVote={async (newVote) => {
        await thread.send(`<@${newVote.user.id}> voted to ${newVote.vote}`);
      }}
      onResolve={async (resolution) => {
        pollInstance.deactivate();
        switch (resolution) {
          case resolutions.restrict:
            await Promise.all([
              reportUser({
                reason: ReportReasons.mod,
                message,
                staff,
                extra: "✅ Restricted",
              }),
              applyRestriction(message.member),
              message.reply(
                "After a vote by the mods, this member has had restrictions applied to them",
              ),
            ]);
            return;
          case resolutions.kick:
            await Promise.all([
              reportUser({
                reason: ReportReasons.mod,
                message,
                staff,
                extra: "✅ Kicked",
              }),
              kick(message.member),
              message.reply(
                "After a vote by the mods, this member has been kicked from the server to cool off",
              ),
            ]);
            return;
          case resolutions.ban:
            await Promise.all([
              reportUser({
                reason: ReportReasons.mod,
                message,
                staff,
                extra: "✅ Banned",
              }),
              ban(message.member),
              message.reply(
                "After a vote by the mods, this member has been permanently banned",
              ),
            ]);
            return;
          case resolutions.nudge: {
            const [thread] = await Promise.all([
              originalChannel.threads.create({
                name: message.author.username,
                autoArchiveDuration: 60,
                type: ChannelType.PrivateThread,
                reason: "Private moderation thread",
              }),
              reportUser({
                reason: ReportReasons.mod,
                message,
                staff,
                extra: "✅ Nudge",
              }),
            ]);
            const [{ moderator: modRoleId }] = await Promise.all([
              fetchSettings(message.guild!, [SETTINGS.moderator]),
              thread.members.add(message.author),
            ]);
            await thread.send(`The <@&${modRoleId}> team has determined that the following message is not okay in the community.

This isn't a formal warning, but your message concerned the moderators enough that they felt it necessary to intervene. This message was sent by a bot, but all moderators can view this thread and are available to discuss what concerned them.

  ${quoteAndEscape(message.content)}`);
            return;
          }
          case resolutions.warning:
            reportUser({
              reason: ReportReasons.mod,
              message,
              staff,
              extra: "✅ Warning",
            });
            message.reply(
              `This message resulted in a formal warning from the moderators. Please review the community rules.`,
            );
            return;

          case resolutions.track:
            reportUser({
              reason: ReportReasons.track,
              message,
              staff,
            });
            return;

          case resolutions.timeout:
            reportUser({
              reason: ReportReasons.mod,
              message,
              staff,
              extra: "✅ Timed out overnight",
            });
            timeout(message.member);

            return;
        }
      }}
    />,
  );

  // reply
  await interaction.reply({
    content: `Discussion thread created <#${thread.id}>`,
    ephemeral: true,
  });
};
