import { Events, ChannelType } from "discord.js";
import type { Client, Message, PartialMessage, TextChannel } from "discord.js";
import db from "#~/db.server";

export async function startActivityTracking(client: Client) {
  const channelCache = new Map<string, TextChannel>();

  async function getOrFetchChannel(msg: Message) {
    // TODO: cache eviction?
    return channelCache.has(msg.channelId)
      ? channelCache.get(msg.channelId)
      : channelCache
          .set(msg.channelId, (await msg.channel.fetch()) as TextChannel)
          .get(msg.channelId);
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
        channel_category: (await getOrFetchChannel(msg))?.parent?.name,
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

  const blocks = parseMarkdownBlocks(content);
  const wordCount = blocks
    .filter((b) => b.type === "text")
    .reduce((acc, block) => acc + getWords(block.content).length, 0);

  const charCount = blocks
    .filter((b) => b.type === "text")
    .reduce((acc, block) => acc + getChars(block.content).length, 0);

  const codeWords = blocks
    .filter((b) => b.type !== "text")
    // .flatMap(b => getWords(Array.isArray(b.content) ? b.content.join('\n') : b.content))
    .reduce(
      (acc, block) =>
        acc +
        getWords(
          Array.isArray(block.content)
            ? block.content.join("\n")
            : block.content,
        ).length,
      0,
    );

  const codeChars = blocks
    .filter((b) => b.type !== "text")
    .reduce(
      (acc, block) =>
        acc +
        getChars(
          Array.isArray(block.content)
            ? block.content.join("\n")
            : block.content,
        ).length,
      0,
    );

  return {
    char_count: charCount,
    word_count: wordCount,
    code_stats: { words: codeWords, chars: codeChars },
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

type MarkdownBlocks =
  | { type: "fenced"; lang: undefined | string; content: string[] }
  | { type: "inline"; content: string }
  | { type: "text"; content: string };

export function parseMarkdownBlocks(content: string): MarkdownBlocks[] {
  const blocks: MarkdownBlocks[] = [];
  // track string position
  let idx = 0;

  // replaceAll gives easy access to the position of the match
  content.replaceAll(/```[\s\S]+?\n^```|`.+?`/gm, (match, position) => {
    // code blocks may be preceded by text, add those first
    const prev = content.slice(idx, position);
    idx = position;
    if (prev) blocks.push({ type: "text", content: prev });

    // split the code block into lines for easier processing
    const codeText = content.slice(idx, idx + match.length).split("\n");
    // if first line starts with triple backticks, it's a fenced code block
    if (codeText[0].startsWith("```")) {
      // everything after backticks is language specifier
      const lang = codeText[0].slice(3) || undefined;
      const content = codeText.slice(1, -1); // strip fenced backticks
      blocks.push({ type: "fenced", lang, content });
    } else {
      // assume its inline code, return a single string without backticks
      const content = codeText.join("\n").slice(1, -1);
      blocks.push({ type: "inline", content });
    }

    // update our index to the end of the match
    idx += match.length;

    // this is only here to appease TS, value is unused
    return "";
  });

  // after processing all code blocks, there may be text left
  if (idx < content.length) {
    blocks.push({ type: "text", content: content.slice(idx) });
  }

  return blocks;
}
