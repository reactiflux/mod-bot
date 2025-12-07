import { ChannelType, Client, Events } from "discord.js";

import db from "#~/db.server.js";
import { getMessageStats } from "#~/helpers/discord.js";
import { threadStats } from "#~/helpers/metrics.js";
import { log, trackPerformance } from "#~/helpers/observability";

import { getOrFetchChannel } from "./utils";

export async function startHoneypotTracking(client: Client) {
  // select honeypot channel id from table

  client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.system) return;
    if (msg.channel.type !== ChannelType.GuildText || msg.author.bot) {
      return;
    }
    if (!msg.guildId || !msg.guild) {
      log(
        "error",
        "HoneypotTracker",
        "Missing author or guild info when tracking honeypot messages",
        {
          messageId: msg.id,
          hasAuthor: !!msg.author,
          hasGuild: !!msg.guildId,
        },
      );
      throw Error("Missing author or guild info when tracking message stats");
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
      // softban user (ban/unban) to clear all recent messages
      // log action
    }

    // Track message in business analytics
    threadStats.messageTracked(msg);
  });
}
