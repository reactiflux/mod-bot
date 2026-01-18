import { ApplicationCommandType } from "discord-api-types/v10";
import {
  ContextMenuCommandBuilder,
  PermissionFlagsBits,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import { Effect } from "effect";
import { Button } from "reacord";

import { DatabaseServiceLive } from "#~/Database.ts";
import { reacord } from "#~/discord/client.server";
import { runEffect } from "#~/effects/runtime.ts";
import { featureStats } from "#~/helpers/metrics";
import { reportUserLegacy } from "#~/helpers/modLog.js";
import {
  markMessageAsDeleted,
  ReportReasons,
} from "#~/models/reportedMessages.js";

const command = new ContextMenuCommandBuilder()
  .setName("Track")
  .setType(ApplicationCommandType.Message)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const handler = async (interaction: MessageContextMenuCommandInteraction) => {
  const { targetMessage: message, user } = interaction;

  const reportPromise = reportUserLegacy({
    reason: ReportReasons.track,
    message,
    staff: user,
  });

  if (interaction.guildId) {
    featureStats.userTracked(interaction.guildId, user.id, message.author.id);
  }

  const instance = reacord.ephemeralReply(
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
            message
              .delete()
              .then(() =>
                runEffect(
                  Effect.provide(
                    markMessageAsDeleted(message.id, message.guild!.id),
                    DatabaseServiceLive,
                  ),
                ),
              ),
            latestReport?.reply({
              allowedMentions: { users: [] },
              content: `deleted by ${user.username}`,
            }),
          ]);
          instance.render(`Tracked <#${thread.id}>`);
        }}
      />
    </>,
  );
};

export const Command = { handler, command };
