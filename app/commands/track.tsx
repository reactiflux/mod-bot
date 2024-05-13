import type { MessageContextMenuCommandInteraction } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { ApplicationCommandType, ContextMenuCommandBuilder } from "discord.js";
import { Button } from "reacord";
import { reacord } from "~/discord/client.server";

import { ReportReasons, reportUser } from "~/helpers/modLog";

export const command = new ContextMenuCommandBuilder()
  .setName("Track")
  .setType(ApplicationCommandType.Message)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export const handler = async (
  interaction: MessageContextMenuCommandInteraction,
) => {
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
          const { message: logMessage } = await reportPromise;
          await Promise.allSettled([
            message.delete(),
            logMessage.reply({
              allowedMentions: { users: [] },
              content: `Message in <#${message.channelId}> deleted by <@${user.id}>`,
            }),
          ]);
          instance.render("Tracked");
        }}
      />
    </>,
  );
};
