import type { MessageContextMenuCommandInteraction } from "discord.js";
import { PermissionFlagsBits, ContextMenuCommandBuilder } from "discord.js";
import { ApplicationCommandType } from "discord-api-types/v10";
import { Button } from "reacord";
import { reacord } from "#~/discord/client.server";

import { reportUser } from "#~/helpers/modLog";
import { ReportReasons } from "#~/models/reportedMessages.server";

const command = new ContextMenuCommandBuilder()
  .setName("Track")
  .setType(ApplicationCommandType.Message)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const handler = async (interaction: MessageContextMenuCommandInteraction) => {
  const { targetMessage: message, user } = interaction;

  const reportPromise = reportUser({
    reason: ReportReasons.track,
    message,
    staff: user,
  });

  const instance = await reacord.ephemeralReply(
    interaction,
    <>
      Tracked
      <Button
        label="Delete message"
        style="danger"
        onClick={async () => {
          // Need to ensure that we've finished reporting before we try to
          // respond to a click event.
          // Initiating at the top level and waiting here is a big UX win.
          const { latestReport, thread } = await reportPromise;

          await Promise.allSettled([
            message.delete(),
            latestReport?.reply({
              allowedMentions: { users: [] },
              content: `deleted by ${user.username}`,
            }),
          ]);
          instance.render(`Tracked ${thread ? `<#${thread.id}>` : ""}`);
        }}
      />
    </>,
  );
};

export const Command = { handler, command };
