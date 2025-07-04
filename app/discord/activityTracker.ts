import { Events, ChannelType } from "discord.js";
import type { Client, Message, PartialMessage, TextChannel } from "discord.js";
import db from "#~/db.server";
import {
  parseMarkdownBlocks,
  getChars,
  getWords,
} from "#~/helpers/messageParsing";
import { partition } from "lodash-es";
import { log, trackPerformance } from "#~/helpers/observability";
import { threadStats } from "#~/helpers/metrics";

export type CodeStats = {
  chars: number;
  words: number;
  lines: number;
  lang: string | undefined;
};

export async function startActivityTracking(client: Client) {
  log("info", "ActivityTracker", "Starting activity tracking", {
    guildCount: client.guilds.cache.size,
  });

  async function getOrFetchChannel(msg: Message) {
    return trackPerformance(
      "getOrFetchChannel",
      async () => {
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

        log("debug", "ActivityTracker", "Channel info stored", {
          channelId: msg.channelId,
          channelName: data.name,
          category: data?.parent?.name,
        });

        return values;
      },
      { channelId: msg.channelId },
    );
  }

  client.on(Events.MessageCreate, async (msg) => {
    await trackPerformance(
      "processMessageCreate",
      async () => {
        const info = await getMessageStats(msg);
        if (!info) return;

        if (!msg.author || !msg.guildId) {
          log(
            "error",
            "ActivityTracker",
            "Missing author or guild info when tracking message stats",
            {
              messageId: msg.id,
              hasAuthor: !!msg.author,
              hasGuild: !!msg.guildId,
            },
          );
          throw Error(
            "Missing author or guild info when tracking message stats",
          );
        }

        const channelInfo = await getOrFetchChannel(msg);

        await db
          .insertInto("message_stats")
          .values({
            ...info,
            message_id: msg.id,
            author_id: msg.author.id,
            guild_id: msg.guildId,
            channel_id: msg.channelId,
            recipient_id: msg.mentions?.repliedUser?.id ?? null,
            channel_category: channelInfo.category,
          })
          .execute();

        log("debug", "ActivityTracker", "Message stats stored", {
          messageId: msg.id,
          authorId: msg.author.id,
          guildId: msg.guildId,
          channelId: msg.channelId,
          charCount: info.char_count,
          wordCount: info.word_count,
          hasCode: info.code_stats !== "[]",
          hasLinks: info.link_stats !== "[]",
        });

        // Track message in business analytics
        threadStats.messageTracked(msg);
      },
      {
        messageId: msg.id,
        guildId: msg.guildId,
        channelId: msg.channelId,
      },
    );
  });

  client.on(Events.MessageUpdate, async (msg) => {
    await trackPerformance(
      "processMessageUpdate",
      async () => {
        const info = await getMessageStats(msg);
        if (!info) return;

        await updateStatsById(msg.id).set(info).execute();

        log("debug", "ActivityTracker", "Message stats updated", {
          messageId: msg.id,
          charCount: info.char_count,
          wordCount: info.word_count,
        });
      },
      { messageId: msg.id },
    );
  });

  client.on(Events.MessageDelete, async (msg) => {
    await trackPerformance(
      "processMessageDelete",
      async () => {
        const info = await getMessageStats(msg);
        if (!info) return;

        await db
          .deleteFrom("message_stats")
          .where("message_id", "=", msg.id)
          .execute();

        log("debug", "ActivityTracker", "Message stats deleted", {
          messageId: msg.id,
        });
      },
      { messageId: msg.id },
    );
  });

  client.on(Events.MessageReactionAdd, async (msg) => {
    await trackPerformance(
      "processReactionAdd",
      async () => {
        await updateStatsById(msg.message.id)
          .set({ react_count: (eb) => eb(eb.ref("react_count"), "+", 1) })
          .execute();

        log("debug", "ActivityTracker", "Reaction added to message", {
          messageId: msg.message.id,
          userId: msg.users.cache.last()?.id,
          emoji: msg.emoji.name,
        });
      },
      { messageId: msg.message.id },
    );
  });

  client.on(Events.MessageReactionRemove, async (msg) => {
    await trackPerformance(
      "processReactionRemove",
      async () => {
        await updateStatsById(msg.message.id)
          .set({ react_count: (eb) => eb(eb.ref("react_count"), "-", 1) })
          .execute();

        log("debug", "ActivityTracker", "Reaction removed from message", {
          messageId: msg.message.id,
          emoji: msg.emoji.name,
        });
      },
      { messageId: msg.message.id },
    );
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

  // TODO: groupBy would be better here, but this was easier to keep typesafe
  const [textblocks, nontextblocks] = partition(
    blocks,
    (b) => b.type === "text",
  );
  const [links, codeblocks] = partition(
    nontextblocks,
    (b) => b.type === "link",
  );

  const linkStats = links.map((link) => link.url);

  const { wordCount, charCount } = [...links, ...textblocks].reduce(
    (acc, block) => {
      const content =
        block.type === "link" ? (block.label ?? "") : block.content;
      const words = getWords(content).length;
      const chars = getChars(content).length;
      return {
        wordCount: acc.wordCount + words,
        charCount: acc.charCount + chars,
      };
    },
    { wordCount: 0, charCount: 0 },
  );

  const codeStats = codeblocks.map((block): CodeStats => {
    switch (block.type) {
      case "fencedcode": {
        const content = block.code.join("\n");
        return {
          chars: getChars(content).length,
          words: getWords(content).length,
          lines: block.code.length,
          lang: block.lang,
        };
      }
      case "inlinecode": {
        return {
          chars: getChars(block.code).length,
          words: getWords(block.code).length,
          lines: 1,
          lang: undefined,
        };
      }
    }
  });

  const values = {
    char_count: charCount,
    word_count: wordCount,
    code_stats: JSON.stringify(codeStats),
    link_stats: JSON.stringify(linkStats),
    react_count: msg.reactions.cache.size,
    sent_at: msg.createdTimestamp,
  };
  return values;
}

export async function reportByGuild(guildId: string) {
  return trackPerformance(
    "reportByGuild",
    async () => {
      log("info", "ActivityTracker", "Generating guild report", {
        guildId,
      });

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

      log("info", "ActivityTracker", "Guild report generated", {
        guildId,
        authorCount: result.length,
        totalMessages: result.reduce(
          (sum, r) => sum + Number(r.message_count),
          0,
        ),
      });

      return result;
    },
    { guildId },
  );
}
