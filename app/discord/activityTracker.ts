import { Events, ChannelType } from "discord.js";
import type { Client, Message, PartialMessage, TextChannel } from "discord.js";
import db from "#~/db.server";

export async function startActivityTracking(client: Client) {
  async function getOrFetchChannel(msg: Message) {
    // TODO: cache eviction?
    const channelInfo = await db
      .selectFrom("channel_info")
      .selectAll()
      .where("id", "=", msg.channelId)
      .executeTakeFirst();
    if (channelInfo) return channelInfo;
    const data = (await msg.channel.fetch()) as TextChannel;
    const values = {
      id: msg.channelId,
      category: data?.parent?.name,
      name: data,
    };
    await db
      .insertInto("channel_info")
      .values({
        id: msg.channelId,
        name: data.name,
        category: data?.parent?.name ?? null,
      })
      .execute();
    return values;
  }

  client.on(Events.MessageCreate, async (msg) => {
    const info = await getMessageStats(msg);
    if (!info) return;
    if (!msg.author || !msg.guildId) {
      throw Error("Missing author or guild info when tracking message stats");
    }
    await db
      .insertInto("message_stats")
      .values({
        ...info,
        message_id: msg.id,
        author_id: msg.author.id,
        guild_id: msg.guildId,
        channel_id: msg.channelId,
        recipient_id: msg.mentions?.repliedUser?.id ?? null,
        channel_category: (await getOrFetchChannel(msg)).category,
      })
      .execute();
  });

  client.on(Events.MessageUpdate, async (msg) => {
    const info = await getMessageStats(msg);
    if (!info) return;
    await updateStatsById(msg.id).set(info).execute();
  });

  client.on(Events.MessageDelete, async (msg) => {
    const info = await getMessageStats(msg);
    if (!info) return;
    await db
      .deleteFrom("message_stats")
      .where("message_id", "=", msg.id)
      .execute();
  });

  client.on(Events.MessageReactionAdd, async (msg) => {
    await updateStatsById(msg.message.id)
      .set({ react_count: (eb) => eb(eb.ref("react_count"), "+", 1) })
      .execute();
  });

  client.on(Events.MessageReactionRemove, async (msg) => {
    await updateStatsById(msg.message.id)
      .set({ react_count: (eb) => eb(eb.ref("react_count"), "-", 1) })
      .execute();
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
  const { content } = await msg.fetch();
  return {
    char_count: getChars(content).length,
    word_count: getWords(content).length,
    react_count: msg.reactions.cache.size,
    sent_at: msg.createdTimestamp,
  };
}

export async function reportByGuild(guildId: string) {
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
  return result;
}

// this is better than string.split(/\s+/) because it counts emojis as 1 word
// and we can easily filter them, works much better in other languages too
function getWords(content: string) {
  return Array.from(
    new Intl.Segmenter("en-us", { granularity: "word" }).segment(content),
  ).filter((seg) => seg.isWordLike);
}

// string.split(/\s+/) will count most emojis as 2+ chars
// this will count them as 1
function getChars(content: string) {
  return Array.from(
    new Intl.Segmenter("en-us", { granularity: "grapheme" }).segment(content),
  );
}
