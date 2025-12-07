import { ChannelType, Events, type Client } from "discord.js";

import db from "#~/db.server.js";
import { reportUser } from "#~/helpers/modLog.js";
import { log } from "#~/helpers/observability";
import { ReportReasons } from "#~/models/reportedMessages.server.js";

export async function startHoneypotTracking(client: Client) {
  client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.system) return;
    if (msg.channel.type !== ChannelType.GuildText || msg.author.bot) {
      return;
    }
    if (!msg.guildId || !msg.guild) {
      log(
        "error",
        "HoneypotTracker",
        "Missing guild info when tracking honeypot messages",
        {
          messageId: msg.id,
          hasAuthor: !!msg.author,
          hasGuild: !!msg.guildId,
        },
      );
      throw Error("Missing guild info when tracking honeypot messages");
    }

    const config = await db
      .selectFrom("honeypot_config")
      .selectAll()
      .where("guild_id", "=", msg.guildId)
      .execute();

    const channelIds = config.map((entry) => entry.channel_id);
    if (channelIds.includes(msg.channelId)) {
      const [member, message] = await Promise.all([
        msg.guild.members.fetch(msg.author.id).catch((_) => undefined),
        msg.fetch().catch((_) => undefined),
      ]);
      if (!member || !message) {
        log(
          "debug",
          "HoneypotTracker",
          "unable to resolve member or message for honeypot",
        );
        throw Error("unable to resolve member or message for honeypot");
      }
      try {
        // softban user (ban/unban) to clear all recent messages
        await member?.ban({
          reason: "honeypot spam detected",
          deleteMessageSeconds: 604800, // 7 days
        });
        await msg.guild.members.unban(member);
        // log action
        await reportUser({
          reason: ReportReasons.spam,
          message: message,
          staff: client.user ?? false,
        });
      } catch (e) {
        console.log(e);
      }
    }
  });
}
