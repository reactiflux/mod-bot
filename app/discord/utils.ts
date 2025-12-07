import type { Message, TextChannel } from "discord.js";

import db from "#~/db.server";
import { log } from "#~/helpers/observability";

export async function getOrFetchChannel(msg: Message) {
  // TODO: cache eviction?
  const channelInfo = await db
    .selectFrom("channel_info")
    .selectAll()
    .where("id", "=", msg.channelId)
    .executeTakeFirst();

  if (channelInfo) {
    log("debug", "ActivityTracker", "Channel info found in cache", {
      channelId: msg.channelId,
      channelName: channelInfo.name,
      category: channelInfo.category,
    });
    return channelInfo;
  }

  log("debug", "ActivityTracker", "Fetching channel info from Discord", {
    channelId: msg.channelId,
  });

  const data = (await msg.channel.fetch()) as TextChannel;
  const values = {
    id: msg.channelId,
    category: data.parent?.name,
    name: data.name,
  };

  await db
    .insertInto("channel_info")
    .values({
      id: msg.channelId,
      name: data.name,
      category: data.parent?.name ?? null,
    })
    .execute();

  log("debug", "ActivityTracker", "Channel info added to cache", {
    channelId: msg.channelId,
    channelName: data.name,
    category: data.parent?.name,
  });

  return values;
}
