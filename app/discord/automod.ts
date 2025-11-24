import { Events, type Client } from "discord.js";

import { isStaff } from "#~/helpers/discord";
import { isSpam } from "#~/helpers/isSpam";
import { reportUser } from "#~/helpers/modLog";
import {
  markMessageAsDeleted,
  ReportReasons,
} from "#~/models/reportedMessages.server";

import { client } from "./client.server";

const AUTO_SPAM_THRESHOLD = 3;

export default async (bot: Client) => {
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
      const [{ warnings, message: logMessage }] = await Promise.all([
        reportUser({
          reason: ReportReasons.spam,
          message: message,
          staff: client.user ?? false,
        }),
        message
          .delete()
          .then(() => markMessageAsDeleted(message.id, message.guild!.id)),
      ]);

      if (warnings >= AUTO_SPAM_THRESHOLD) {
        await Promise.all([
          member.kick("Autokicked for spamming"),
          logMessage.reply({
            content: `Automatically kicked <@${message.author.id}> for spam`,
            allowedMentions: {},
          }),
        ]);
      }
    }
  });
};
