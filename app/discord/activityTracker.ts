import { ChannelType, Events, type Client } from "discord.js";
import { Effect } from "effect";

import db from "#~/db.server";
import { getMessageStats } from "#~/helpers/discord.js";
import { threadStats } from "#~/helpers/metrics";
import { log, trackPerformance } from "#~/helpers/observability";

import { getOrFetchChannel } from "./utils";

const TRACKABLE_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildForum,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
]);

export async function startActivityTracking(client: Client) {
  log("info", "ActivityTracker", "Starting activity tracking", {
    guildCount: client.guilds.cache.size,
  });

  client.on(Events.MessageCreate, async (msg) => {
    // Filter non-human messages
    if (
      msg.author.system ||
      msg.author.bot ||
      msg.webhookId ||
      !msg.guildId ||
      !TRACKABLE_CHANNEL_TYPES.has(msg.channel.type)
    ) {
      return;
    }

    const info = await Effect.runPromise(getMessageStats(msg));

    const channelInfo = await trackPerformance(
      "startActivityTracking: getOrFetchChannel",
      async () => getOrFetchChannel(msg),
    );

    await db
      .insertInto("message_stats")
      .values({
        ...info,
        code_stats: JSON.stringify(info.code_stats),
        link_stats: JSON.stringify(info.link_stats),
        message_id: msg.id,
        author_id: msg.author.id,
        guild_id: msg.guildId,
        channel_id: msg.channelId,
        recipient_id: msg.mentions.repliedUser?.id ?? null,
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
      hasCode: info.code_stats.length > 0,
      hasLinks: info.link_stats.length > 0,
    });

    // Track message in business analytics
    threadStats.messageTracked(msg);
  });

  client.on(Events.MessageUpdate, async (msg) => {
    await trackPerformance(
      "processMessageUpdate",
      async () => {
        const info = await Effect.runPromise(getMessageStats(msg));

        await updateStatsById(msg.id)
          .set({
            ...info,
            code_stats: JSON.stringify(info.code_stats),
            link_stats: JSON.stringify(info.link_stats),
          })
          .execute();

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
    if (msg.system || msg.author?.bot) {
      return;
    }
    await trackPerformance(
      "processMessageDelete",
      async () => {
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
