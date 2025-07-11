import { ChannelType, PermissionsBitField } from "discord.js";
import type { Message, TextChannel, ThreadChannel, User } from "discord.js";

import { reacord } from "#~/discord/client.server";
import { quoteAndEscape } from "#~/helpers/discord";
import { reportUser } from "#~/helpers/modLog";
import { resolutions } from "#~/helpers/modResponse";

import { fetchSettings, SETTINGS } from "#~/models/guilds.server";
import { applyRestriction, ban, kick, timeout } from "#~/models/discord.server";
import { ModResponse } from "#~/commands/reacord/ModResponse";
import {
  Button,
  type ComponentEventReplyOptions,
  type ReacordInstance,
} from "reacord";
import {
  deleteAllReported,
  ReportReasons,
} from "#~/commands/track/reportCache.js";

export async function escalationControls(
  reportedMessage: Message,
  thread: ThreadChannel,
  modRoleId: string,
) {
  reacord.createChannelMessage(thread.id).render(
    <>
      Moderator controls
      <Button
        label="Delete all reported messages"
        style="danger"
        onClick={async (e) => {
          const { guild } = reportedMessage;
          const actor = await guild?.members.fetch(e.user.id);
          if (
            !actor?.permissions.has(PermissionsBitField.Flags.ManageMessages)
          ) {
            return;
          }
          await Promise.allSettled([
            // ...reportedMessages.map((m) => m.delete()),
            deleteAllReported(reportedMessage),
            e.reply(`deleted by ${e.user.username}`),
          ]);
        }}
      />
      <Button
        onClick={async (e) => {
          if (!e.guild?.member.roles?.includes(modRoleId)) {
            return;
          }
          console.log(
            "escalationControls",
            `${reportedMessage.author.username} kicked by ${e.user.username}`,
          );
          await Promise.allSettled([
            reportedMessage.member?.kick(),
            e.reply(
              `<@${reportedMessage.author.id}> (${reportedMessage.author.username}) kicked by ${e.user.username}`,
            ),
          ]);
        }}
        style="secondary"
        label="Kick"
      />
      <Button
        onClick={async (e) => {
          if (!e.guild?.member.roles?.includes(modRoleId)) {
            return;
          }
          console.log(
            "escalationControls",
            `${reportedMessage.author.username} banned by ${e.user.username}`,
          );
          await Promise.allSettled([
            reportedMessage.guild?.bans.create(reportedMessage.author),
            e.reply(
              `<@${reportedMessage.author.id}> (${reportedMessage.author.username}) banned by ${e.user.username}`,
            ),
          ]);
        }}
        style="secondary"
        label="Ban"
      />
    </>,
  );
  reacord.createChannelMessage(thread.id).render(
    <>
      Anyone can escalate, which will notify moderators and call for a vote on
      how to respond.
      <Button
        onClick={async (e) => {
          const member = await thread.guild.members.fetch(e.user.id);
          await Promise.all([
            thread.send(
              `Report escalated by <@${member.id}>, <@&${modRoleId}> please respond.`,
            ),
            escalate(e.reply, member.user, reportedMessage, thread, modRoleId),
          ]);
        }}
        style="primary"
        label="Escalate"
      />
    </>,
  );
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
  const [originalChannel] = await Promise.all([
    reportedMessage.channel.fetch() as Promise<TextChannel>,
  ]);
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
          case resolutions.warning: {
            reportUser({
              reason: ReportReasons.modResolution,
              message: reportedMessage,
              staff,
              extra: "✅ Warning",
            });

            const [thread] = await Promise.all([
              originalChannel.threads.create({
                name: reportedMessage.author.username,
                autoArchiveDuration: 60,
                type: ChannelType.PrivateThread,
                reason: "Private moderation thread",
              }),
              reportUser({
                reason: ReportReasons.modResolution,
                message: reportedMessage,
                staff,
                extra: "✅ Warned",
              }),
            ]);
            const [{ moderator: modRoleId }] = await Promise.all([
              fetchSettings(reportedMessage.guildId!, [SETTINGS.moderator]),
              thread.members.add(reportedMessage.author),
            ]);
            await thread.send(`The <@&${modRoleId}> team has determined that the following message is not okay in the community.
Your message concerned the moderators enough that they felt it necessary to intervene. This message was sent by a bot, but all moderators can view this thread and are available to discuss what concerned them.

${quoteAndEscape(reportedMessage.content)}`);

            reportedMessage.reply(
              `This user has been formally warned by the moderators. Please review the community rules.`,
            );
            return;
          }

          case resolutions.track:
            reportUser({
              reason: ReportReasons.modResolution,
              message: reportedMessage,
              staff,
            });
            return;

          case resolutions.timeout:
            reportUser({
              reason: ReportReasons.modResolution,
              message: reportedMessage,
              staff,
              extra: "✅ Timed out overnight",
            });
            timeout(reportedMessage.member);

            return;
        }
      }}
    />,
  );
}
