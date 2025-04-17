import { ChannelType } from "discord.js";
import type { Message, TextChannel, ThreadChannel, User } from "discord.js";

import { reacord } from "#~/discord/client.server";
import { quoteAndEscape } from "#~/helpers/discord";
import { ReportReasons, reportUser } from "#~/helpers/modLog";
import { resolutions } from "#~/helpers/modResponse";

import { fetchSettings, SETTINGS } from "#~/models/guilds.server";
import { applyRestriction, ban, kick, timeout } from "#~/models/discord.server";
import { ModResponse } from "#~/commands/reacord/ModResponse";
import { Button } from "reacord";

export async function escalationControls(
  reportedMessage: Message,
  thread: ThreadChannel,
  modRoleId: string,
) {
  reacord.createChannelMessage(thread.id).render(
    <>
      <Button
        label="Delete"
        style="danger"
        onClick={async (e) => {
          await Promise.allSettled([
            reportedMessage.delete(),
            e.reply(`deleted by ${e.user.username}`),
          ]);
        }}
      />
      <Button
        onClick={async (e) => {
          const member = await thread.guild.members.fetch(e.user.id);
          escalate(member.user, reportedMessage, thread, modRoleId);
        }}
        style="primary"
        label="Escalate"
      />
      <Button
        onClick={async (e) => {
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
}

export async function escalate(
  staff: User | false,
  reportedMessage: Message,
  thread: ThreadChannel,
  modRoleId: string,
) {
  const originalChannel =
    (await reportedMessage.channel.fetch()) as TextChannel;
  const pollInstance = reacord.createChannelMessage(thread.id).render(
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
                "After a vote by the mods, this member has had restrictions applied to them",
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
                "After a vote by the mods, this member has been kicked from the server to cool off",
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
                "After a vote by the mods, this member has been permanently banned",
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
              fetchSettings(reportedMessage.guild!, [SETTINGS.moderator]),
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
