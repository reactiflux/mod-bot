import { Events, ChannelType } from "discord.js";
import type { Client, Message, PartialMessage, TextChannel } from "discord.js";
import db from "~/db.server";

export async function startActivityTracking(client: Client) {
  const channelCache = new Map<string, TextChannel>();

  async function getOrFetchChannel(msg: Message<true>) {
    return channelCache.has(msg.channelId)
      ? channelCache.get(msg.channelId)
      : channelCache
          .set(msg.channelId, await msg.channel.fetch())
          .get(msg.channelId)!;
  }

  client.on(Events.MessageCreate, async (msg) => {
    const info = await getMessageStats(msg);
    if (!info) return;
    await db
      .insertInto("message_stats")
      .values({
        ...info,
        message_id: msg.id,
        author_id: msg.author!.id,
        guild_id: msg.guildId,
        channel_id: msg.channelId,
        recipient_id: msg.mentions?.repliedUser?.id ?? null,
        // TODO: cache this?
        channel_category: (await getOrFetchChannel(msg))!.parentId,
      })
      .execute();
    reportByGuild(msg.guildId!);
  });

  client.on(Events.MessageUpdate, async (msg) => {
    const info = await getMessageStats(msg);
    console.log(msg, info);
    if (!info) return;
    await updateStatsById(msg.id).set(info).execute();
    reportByGuild(msg.guildId!);
  });

  client.on(Events.MessageDelete, async (msg) => {
    const info = await getMessageStats(msg);
    if (!info) return;
    await db
      .deleteFrom("message_stats")
      .where("message_id", "=", msg.id)
      .execute();
    reportByGuild(msg.guildId!);
  });

  client.on(Events.MessageReactionAdd, async (msg) => {
    await updateStatsById(msg.message.id)
      .set({ react_count: (eb) => eb(eb.ref("react_count"), "+", 1) })
      .execute();
    reportByGuild(msg.message.guildId!);
  });

  client.on(Events.MessageReactionRemove, async (msg) => {
    await updateStatsById(msg.message.id)
      .set({ react_count: (eb) => eb(eb.ref("react_count"), "-", 1) })
      .execute();
    reportByGuild(msg.message.guildId!);
  });
}

function updateStatsById(id: string) {
  return db.updateTable("message_stats").where("message_id", "=", id);
}

async function getMessageStats(msg: Message | PartialMessage) {
  // TODO: more filters
  if (msg.channel.type !== ChannelType.GuildText || msg.author?.bot) {
    return;
  }
  return {
    char_count: msg.content?.length ?? 0,
    word_count: msg.content?.split(/\s+/).length ?? 0,
    react_count: msg.reactions.cache.size,
    sent_at: String(msg.createdTimestamp),
  };
}

async function reportByGuild(guildId: string) {
  const result = await db
    .selectFrom("message_stats")
    .select((eb) => [
      eb.fn.countAll().as("message_count"),
      eb.fn.sum("char_count").as("char_total"),
      eb.fn.sum("word_count").as("word_total"),
      eb.fn.sum("react_count").as("react_total"),
      eb.fn.avg("char_count").as("avg_chars"),
      eb.fn.avg("word_count").as("avg_words"),
      eb.fn.avg("react_count").as("avg_reacts"),
    ])
    .where("guild_id", "=", guildId)
    .groupBy("author_id")
    .execute();
  console.log(result);
}
