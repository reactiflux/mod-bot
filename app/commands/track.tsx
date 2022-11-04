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

  await reportUser({
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
          await message.delete();
          instance.render("Tracked");
        }}
      />
    </>,
  );
};
