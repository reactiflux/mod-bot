import type { MessageContextMenuCommandInteraction } from "discord.js";
import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  Message,
} from "discord.js";
import { Button } from "reacord";
import { reacord } from "~/discord/client.server";

import { ReportReasons, reportUser } from "~/helpers/modLog";

export const command = new ContextMenuCommandBuilder()
  .setName("Track")
  .setType(ApplicationCommandType.Message);

export const handler = async (
  interaction: MessageContextMenuCommandInteraction,
) => {
  const { targetMessage: message, member } = interaction;
  if (!(message instanceof Message) || !member) {
    return;
  }

  await reportUser({
    reason: ReportReasons.track,
    message,
    staff: [member],
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
