import { uniq } from "lodash";
import { Message } from "discord.js";
import type { MessageContextMenuInteraction, TextChannel } from "discord.js";
import { ContextMenuCommandBuilder } from "@discordjs/builders";
import { ApplicationCommandType } from "discord-api-types/v10";
import { Button } from "reacord";

import { reacord } from "~/discord/client";
import { ReportReasons, reportUser } from "~/helpers/modLog";
import { fetchSettings, SETTINGS } from "~/models/guilds.server";
import { quoteAndEscape } from "~/helpers/discord";
import { format } from "date-fns";
import { useState } from "react";

export const command = new ContextMenuCommandBuilder()
  .setName("Convene mods")
  .setType(ApplicationCommandType.Message);

export const handler = async (interaction: MessageContextMenuInteraction) => {
  const { targetMessage: message, member, guild } = interaction;
  if (!(message instanceof Message) || !member || !guild) {
    return;
  }

  const { modLog } = await fetchSettings(guild, [SETTINGS.modLog]);

  const logChannel = (await guild.channels.fetch(modLog)) as TextChannel;
  if (!logChannel || !logChannel.isText()) {
    throw new Error("Failed to load mod channel");
  }

  const { message: logMessage } = await reportUser({
    message,
    reason: ReportReasons.mod,
    extra: `<@${interaction.user.id}> requested mods respond`,
  });
  const thread = await logMessage.startThread({
    name: `${message.author.username} mod response ${format(new Date(), "P")}`,
  });
  const originalChannel = (await message.channel.fetch()) as TextChannel;
  const instance = await reacord.send(
    thread.id,
    <ModResponse
      originalMessage={message}
      onResolve={async (resolution) => {
        // TODO
        instance.deactivate();
        switch (resolution) {
          case resolutions.informalWarning:
            reportUser({
              reason: ReportReasons.mod,
              message: message,
              extra: "Informal warning after mod discussion",
            });

            const thread = await originalChannel.threads.create({
              name: message.author.username,
              autoArchiveDuration: 60,
              // TODO: This won't work in servers that aren't at boost level 2
              // type: "GUILD_PRIVATE_THREAD",
              reason: "Private moderation thread",
            });
            const [modRoleId] = await Promise.all([
              fetchSettings(message.guild!, [SETTINGS.moderator]),
              thread.members.add(message.author),
            ]);
            await thread.send(`The <@${modRoleId}> team has determined that the following message is not okay in the community.

This isn't a formal warning, but it concerned the moderators enough that they felt it necessary to intervene. This message was sent by a bot, but all moderators can view this thread.

  ${quoteAndEscape(message.content)}`);
            return;
        }
      }}
    />,
  );

  // reply
  await interaction.reply({ ephemeral: true, content: "Notification sent" });
};

const resolutions = {
  track: "track",
  formalWarning: "formalWarning",
  informalWarning: "informalWarning",
  chat: "chat",
  timeout: "timeout",
  restrict: "restrict",
  kick: "kick",
  ban: "ban",
} as const;
type Resolution = typeof resolutions[keyof typeof resolutions];

// TODO const VOTES_TO_APPROVE = 3
const VOTES_TO_APPROVE = 1;

const recordVote = (
  oldVotes: Record<Resolution, string[]>,
  newVote: Resolution,
  userId: string,
) => ({
  ...oldVotes,
  [newVote]: uniq((oldVotes[newVote] || []).concat(userId)),
});
const calculateLeader = (votes: Record<Resolution, string[]>) =>
  Object.entries(votes).reduce(
    (accum, [resolution, voters]) => {
      if (voters.length > accum.voteCount) {
        // Boooo this cast because .entries() doesn't save key types
        accum.leader = resolution as Resolution;
        accum.voteCount = voters.length;
        // TODO: account for ties
      }
      return accum;
    },
    { leader: undefined, voteCount: 0 } as {
      leader?: Resolution;
      voteCount: number;
    },
  );

const ModResponse = ({
  originalMessage,
  votesRequired = VOTES_TO_APPROVE,
  onResolve,
}: {
  originalMessage: Message;
  votesRequired?: number;
  onResolve: (result: Resolution) => void;
}) => {
  const [votes, setVotes] = useState({} as Record<Resolution, string[]>);

  return (
    <>
      @moderator
      <Button
        label="Informal Warning"
        onClick={(event) => {
          const newVotes = recordVote(
            votes,
            resolutions.informalWarning,
            event.user.id,
          );
          setVotes(newVotes);

          const { leader, voteCount } = calculateLeader(newVotes);
          if (leader && voteCount >= votesRequired) {
            onResolve(leader);
          }
        }}
      />
    </>
  );
};
