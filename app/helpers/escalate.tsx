import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Message,
  type ThreadChannel,
  type User,
} from "discord.js";
import { type ComponentEventReplyOptions, type ReacordInstance } from "reacord";

import { ModResponse } from "#~/commands/reacord/ModResponse";
import { reportUser } from "#~/helpers/modLog";
import { resolutions } from "#~/helpers/modResponse";
import { applyRestriction, ban, kick, timeout } from "#~/models/discord.server";
import { ReportReasons } from "#~/models/reportedMessages.server";

export async function escalationControls(
  reportedMessage: Message,
  thread: ThreadChannel,
  _modRoleId: string,
) {
  const reportedUserId = reportedMessage.author.id;

  await thread.send({
    content: "Moderator controls",
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`escalate-delete|${reportedUserId}`)
          .setLabel("Delete all reported messages")
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId(`escalate-kick|${reportedUserId}`)
          .setLabel("Kick")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`escalate-ban|${reportedUserId}`)
          .setLabel("Ban")
          .setStyle(ButtonStyle.Secondary),
      ),

      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`escalate-restrict|${reportedUserId}`)
          .setLabel("Restrict")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(`escalate-timeout|${reportedUserId}`)
          .setLabel("Timeout")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  });

  await thread.send({
    content:
      "Anyone can escalate, which will notify moderators and call for a vote on how to respond.",
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`escalate-escalate|${reportedUserId}`)
          .setLabel("Escalate")
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  });
}

export async function escalate(
  reply: (
    content?: React.ReactNode,
    options?: ComponentEventReplyOptions,
  ) => ReacordInstance,
  staff: User,
  reportedMessage: Message,
  thread: ThreadChannel,
  modRoleId: string,
) {
  // const [originalChannel] = await Promise.all([
  //   reportedMessage.channel.fetch() as Promise<TextChannel>,
  // ]);
  const pollInstance = reply(
    <ModResponse
      modRoleId={modRoleId}
      onVote={async (newVote) => {
        await thread.send(`<@${newVote.user.id}> voted to ${newVote.vote}`);
      }}
      onResolve={async (resolution) => {
        pollInstance.deactivate();
        switch (resolution) {
          case resolutions.restrict:
            await Promise.all([
              reportUser({
                reason: ReportReasons.modResolution,
                message: reportedMessage,
                staff,
                extra: "✅ Restricted",
              }),
              applyRestriction(reportedMessage.member),
              reportedMessage.reply(
                "After a vote by the mods, this member has had restrictions applied to them.",
              ),
            ]);
            return;
          case resolutions.kick:
            await Promise.all([
              reportUser({
                reason: ReportReasons.modResolution,
                message: reportedMessage,
                staff,
                extra: "✅ Kicked",
              }),
              kick(reportedMessage.member),
              reportedMessage.reply(
                "After a vote by the mods, this member has been kicked from the server.",
              ),
            ]);
            return;
          case resolutions.ban:
            await Promise.all([
              reportUser({
                reason: ReportReasons.modResolution,
                message: reportedMessage,
                staff,
                extra: "✅ Banned",
              }),
              ban(reportedMessage.member),
              reportedMessage.reply(
                "After a vote by the mods, this member has been banned.",
              ),
            ]);
            return;
          // case resolutions.warning: {
          //   void reportUser({
          //     reason: ReportReasons.modResolution,
          //     message: reportedMessage,
          //     staff,
          //     extra: "✅ Warning",
          //   });

          //   const [thread] = await Promise.all([
          //     originalChannel.threads.create({
          //       name: reportedMessage.author.username,
          //       autoArchiveDuration: 60,
          //       type: ChannelType.PrivateThread,
          //       reason: "Private moderation thread",
          //     }),
          //     reportUser({
          //       reason: ReportReasons.modResolution,
          //       message: reportedMessage,
          //       staff,
          //       extra: "✅ Warned",
          //     }),
          //   ]);
          //   const [{ moderator: modRoleId }] = await Promise.all([
          //     fetchSettings(reportedMessage.guildId!, [SETTINGS.moderator]),
          //     thread.members.add(reportedMessage.author),
          //   ]);
          //   await thread.send(`The <@&${modRoleId}> team has determined that the following message is not okay in the community.
          // Your message concerned the moderators enough that they felt it necessary to intervene. This message was sent by a bot, but all moderators can view this thread and are available to discuss what concerned them.`);
          //   await thread.send({
          //     content: quoteAndEscape(reportedMessage.content),
          //     allowedMentions: {},
          //   });

          //   void reportedMessage.reply(
          //     `This user has been formally warned by the moderators. Please review the community rules.`,
          //   );
          //   return;
          // }

          case resolutions.track:
            void reportUser({
              reason: ReportReasons.modResolution,
              message: reportedMessage,
              staff,
            });
            return;

          case resolutions.timeout:
            void reportUser({
              reason: ReportReasons.modResolution,
              message: reportedMessage,
              staff,
              extra: "✅ Timed out overnight",
            });
            void timeout(reportedMessage.member);

            return;
        }
      }}
    />,
  );
}
