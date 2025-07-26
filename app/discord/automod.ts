import type { Client } from "discord.js";

import { isStaff } from "#~/helpers/discord";
import { reportUser } from "#~/helpers/modLog";
import { client } from "./client.server";
import { isSpam } from "#~/helpers/isSpam";
import {
  ReportReasons,
  markMessageAsDeleted,
} from "#~/models/reportedMessages.server";

const AUTO_SPAM_THRESHOLD = 3;

export default async (bot: Client) => {
  bot.on("messageCreate", async (msg) => {
    if (msg.author?.id === bot.user?.id || !msg.guild) return;

    const [member, message] = await Promise.all([
      msg.guild.members.fetch(msg.author.id),
      msg.fetch(),
    ]);
    if (!message.guild || !member || isStaff(member)) {
      return;
    }

    if (isSpam(message.content)) {
      const [{ warnings, message: logMessage }] = await Promise.all([
        reportUser({
          reason: ReportReasons.spam,
          message: message,
          staff: client.user || false,
        }),
        message
          .delete()
          .then(() => markMessageAsDeleted(message.id, message.guild!.id)),
      ]);

      if (warnings >= AUTO_SPAM_THRESHOLD) {
        await Promise.all([
          member.kick("Autokicked for spamming"),
          logMessage.reply(
            `Automatically kicked <@${message.author.id}> for spam`,
          ),
        ]);
      }
    }
  });
};
