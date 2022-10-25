import { format } from "date-fns";
import {
  ApplicationCommandType,
  ChannelType,
  ContextMenuCommandBuilder,
  Message,
} from "discord.js";
import type {
  MessageContextMenuCommandInteraction,
  TextChannel,
} from "discord.js";

import { reacord } from "~/discord/client.server";
import { quoteAndEscape } from "~/helpers/discord";
import { ReportReasons, reportUser } from "~/helpers/modLog";
import { resolutions } from "~/helpers/modResponse";

import { fetchSettings, SETTINGS } from "~/models/guilds.server";
import { applyRestriction, ban, kick, timeout } from "~/models/discord.server";
import { Confirmation, ModResponse } from "~/commands/reacord/ModResponse";

export const command = new ContextMenuCommandBuilder()
  .setName("Convene mods")
  .setType(ApplicationCommandType.Message);

export const handler = async (
  interaction: MessageContextMenuCommandInteraction,
) => {
  const { targetMessage: message, member, guild } = interaction;
  if (!(message instanceof Message) || !member || !guild) {
    return;
  }

  const { modLog, moderator } = await fetchSettings(guild, [
    SETTINGS.modLog,
    SETTINGS.moderator,
  ]);

  const logChannel = (await guild.channels.fetch(modLog)) as TextChannel;
  if (!logChannel || logChannel.type !== ChannelType.GuildText) {
    throw new Error("Failed to load mod channel");
  }

  const { message: logMessage } = await reportUser({
    message,
    reason: ReportReasons.mod,
    extra: `‼️ <@${interaction.user.id}> requested mods respond`,
  });

  if (logMessage.hasThread) {
    await interaction.reply({
      content: `Already active: <#${logMessage.thread?.id}>`,
      ephemeral: true,
    });
    return;
  }

  const thread = await logMessage.startThread({
    name: `${message.author.username} mod response ${format(new Date(), "P")}`,
  });
  const originalChannel = (await message.channel.fetch()) as TextChannel;
  const pollInstance = reacord.send(
    thread.id,
    <ModResponse
      modRoleId={moderator}
      onVote={async (newVote) => {
        thread.send(`<@${newVote.user.id}> voted to ${newVote.vote}`);
      }}
      onResolve={async (resolution) => {
        pollInstance.deactivate();
        switch (resolution) {
          case resolutions.restrict:
            await Promise.all([
              reportUser({
                reason: ReportReasons.mod,
                message,
                extra: "✅ Restricted",
              }),
              applyRestriction(message.member!),
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
                extra: "✅ Kicked",
              }),
              kick(message.member!),
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
                extra: "✅ Banned",
              }),
              ban(message.member!),
              message.reply(
                "After a vote by the mods, this member has been permanently banned",
              ),
            ]);
            return;
          case resolutions.nudge:
            const [thread] = await Promise.all([
              originalChannel.threads.create({
                name: message.author.username,
                autoArchiveDuration: 60,
                // TODO: This won't work in servers that aren't at boost level 2
                // Maybe could create a thread and ensure the "thread created" message is removed? honestly that's pretty invisible to anyone who isn't trawling through threads proactively
                type: guild.features.includes("PRIVATE_THREADS")
                  ? ChannelType.PrivateThread
                  : ChannelType.PublicThread,
                reason: "Private moderation thread",
              }),
              reportUser({
                reason: ReportReasons.mod,
                message,
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
          case resolutions.warning:
            reportUser({
              reason: ReportReasons.mod,
              message,
              extra: "✅ Warning",
            });
            message.reply(
              `This message resulted in a formal warning from the moderators. Please review the community rules.`,
            );
            return;

          case resolutions.okay:
            reportUser({
              reason: ReportReasons.mod,
              message,
              extra: "✅ Determined to be okay",
            });
            return;

          case resolutions.track:
            reportUser({ reason: ReportReasons.track, message });
            return;

          case resolutions.timeout:
            reportUser({
              reason: ReportReasons.mod,
              message,
              extra: "✅ Timed out overnight",
            });
            timeout(message.member!);

            return;
        }
      }}
    />,
  );

  // reply
  const ackInstance = reacord.ephemeralReply(
    interaction,
    <Confirmation
      modRoleId={moderator}
      thread={thread}
      onNotify={() => {
        ackInstance.render("Mods notified");
        ackInstance.deactivate();
      }}
    />,
  );
};
