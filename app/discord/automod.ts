import { Events, type Client } from "discord.js";
import { Effect } from "effect";

import { logUserMessageLegacy } from "#~/commands/report/userLog.ts";
import { DatabaseLayer } from "#~/Database.js";
import { runEffect } from "#~/effects/runtime.js";
import { isStaff } from "#~/helpers/discord";
import { isSpam } from "#~/helpers/isSpam";
import { featureStats } from "#~/helpers/metrics";
import {
  markMessageAsDeleted,
  ReportReasons,
} from "#~/models/reportedMessages.js";

import { client } from "./client.server";

const AUTO_SPAM_THRESHOLD = 3;

export default async (bot: Client) => {
  // Handle Discord's built-in automod actions

  // Handle our custom spam detection
  bot.on(Events.MessageCreate, async (msg) => {
    if (msg.author.id === bot.user?.id || !msg.guild) return;

    const [member, message] = await Promise.all([
      msg.guild.members.fetch(msg.author.id).catch((_) => undefined),
      msg.fetch().catch((_) => undefined),
    ]);
    if (!message?.guild || !member || isStaff(member)) {
      return;
    }

    if (isSpam(message.content)) {
      const { warnings, message: logMessage } = await logUserMessageLegacy({
        reason: ReportReasons.spam,
        message: message,
        staff: client.user ?? false,
      });
      await message
        .delete()
        .then(() =>
          runEffect(
            Effect.provide(
              markMessageAsDeleted(message.id, message.guild!.id),
              DatabaseLayer,
            ),
          ),
        );

      featureStats.spamDetected(
        message.guild.id,
        message.author.id,
        message.channelId,
      );

      if (warnings >= AUTO_SPAM_THRESHOLD) {
        await Promise.all([
          member.kick("Autokicked for spamming"),
          logMessage.reply({
            content: `Automatically kicked <@${message.author.id}> for spam`,
            allowedMentions: {},
          }),
        ]);
        featureStats.spamKicked(message.guild.id, message.author.id, warnings);
      }
    }
  });
};
