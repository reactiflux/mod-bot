import type { MessageContextMenuCommandInteraction } from "discord.js";
import { PermissionFlagsBits, ContextMenuCommandBuilder } from "discord.js";
import { ApplicationCommandType } from "discord-api-types/v10";
import { Button } from "reacord";
import { reacord } from "#~/discord/client.server";

import { ReportReasons, reportUser } from "#~/helpers/modLog";

export const command = new ContextMenuCommandBuilder()
  .setName("Track")
  .setType(ApplicationCommandType.Message)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export const handler = async (
  interaction: MessageContextMenuCommandInteraction,
) => {
  const { targetMessage: message, user } = interaction;

  const { thread, latestReport } = await reportUser({
    reason: ReportReasons.track,
    message,
    staff: user,
  });

  if (!latestReport) {
    console.log(
      "handler (track)",
      `Something strange happened: no 'latestReport' found`,
    );
  }

  const instance = reacord.createInteractionReply(interaction, {
    content: `Tracked: <#${thread.id}>`,
    ephemeral: true,
  });
  instance.render(
    <>
      Tracked
      <Button
        label="Delete message"
        style="danger"
        onClick={async () => {
          // Need to ensure that we've finished reporting before we try to
          // respond to a click event.
          // Initiating at the top level and waiting here is a big UX win.
          await Promise.allSettled([
            message.delete(),
            latestReport?.reply({
              allowedMentions: { users: [] },
              content: `deleted by ${user.username}`,
            }),
          ]);
          instance.render("Tracked");
        }}
      />
    </>,
  );
};
