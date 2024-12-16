import type { DB } from "~/db.server";
import db from "~/db.server";

export type MessageStats = DB["message_stats"];

export async function getTopParticipants(
  guildId: MessageStats["guild_id"],
  intervalStart: string,
  intervalEnd: string,
  channels: string[],
  channelCategories: string[],
) {
  const config = {
    count: 100,
    messageThreshold: 250,
    wordThreshold: 2500,
  };

  const messageStatsWithinInterval = () =>
    db.selectFrom((eb) =>
      eb
        .selectFrom("message_stats")
        .select(({ fn, val, eb }) => [
          "author_id",
          "word_count",
          "react_count",
          "sent_at",
          "channel_category",
          "channel_id",
          "react_count",
          fn("date", [eb("sent_at", "/", 1000), val("unixepoch")]).as("date"),
        ])
        .where(({ between, and, or, eb }) =>
          and([
            between(
              "sent_at",
              new Date(intervalStart).getTime(),
              new Date(intervalEnd).getTime(),
            ),
            or([
              eb("channel_id", "in", channels),
              eb("channel_category", "in", channelCategories),
            ]),
          ]),
        )
        .as("interval_message_stats"),
    );

  // get shortlist, volume threshold of 1000 words
  const topMembers = await messageStatsWithinInterval()
    .select(({ fn }) => [
      "author_id",
      fn.sum("word_count").as("word_count"),
      fn.count("author_id").as("message_count"),
      fn.sum("react_count").as("total_reaction_count"),
    ])
    .orderBy("message_count desc")
    .groupBy("author_id")
    .having((eb) =>
      eb.or([
        // @ts-expect-error this seems to be a type bug, which makes sense cuz
        // it's a complex query
        eb("message_count", ">=", config.messageThreshold),
        eb("word_count", ">=", config.wordThreshold),
      ]),
    )
    .limit(config.count)
    .execute();

  const dailyParticipation = await messageStatsWithinInterval()
    .select(({ fn }) => [
      "author_id",
      "date",
      fn.count<number>("author_id").as("message_count"),
      fn.sum<number>("word_count").as("word_count"),
    ])
    .groupBy("date")
    .groupBy("author_id")
    .execute();

  // const users = await db
  //   .selectFrom("message_stats")
  //   .select(({ fn, val, eb }) => [
  //     "author_id",
  //     fn.sum("word_count").as("word_count"),
  //     fn.count(val("*")).as("message_count"),
  //     "sent_at",
  //     fn("date", [eb("sent_at", "/", "1000"), val("unixepoch")]).as("date"),
  //   ])
  //   .where((eb) =>
  //     eb.and([eb("date", ">", intervalStart), eb("date", "<", intervalEnd)]),
  //   )
  //   // .orderBy("message_count desc")
  //   .groupBy("author_id")
  //   // .groupBy("date")
  //   // .limit(200)
  //   .execute();

  return { dailyParticipation: groupByAuthor(dailyParticipation), topMembers };

  // wordcount
  /*
SELECT author_id, channel_category, sum(word_count) 
FROM 'message_stats' 
WHERE author_id IN ('103525876892708864', '257929888864927745') AND channel_category IN ('Need Help', 'Community', 'Social') 
GROUP BY author_id, channel_category
*/
  // db.selectFrom("message_stats")
  //   .select(({ fn, val, ref }) => [
  //     "author_id",
  //     "channel_category",
  //     fn.sum("word_count").as("total_words"),
  //   ])
  //   .groupBy(["author_id"])

  // channel variety
  /*
SELECT 
    author_id, 
    GROUP_CONCAT(DISTINCT channel_id) AS distinct_channel_ids,
    COUNT(DISTINCT channel_id) AS distinct_channel_count
FROM 'message_stats' 
WHERE author_id IN ('103525876892708864', '257929888864927745') AND channel_category IN ('Need Help', 'Community', 'Social') 
GROUP BY author_id
*/

  // count/day
  /*
SELECT 
    author_id, 
    sent_at,
    date(sent_at, 'unixepoch') as date // TODO: not working?
FROM 'message_stats' where author_id in ('103525876892708864') AND channel_category IN ('Need Help', 'Community', 'Social') 
GROUP BY author_id, date
*/

  return db
    .selectFrom("message_stats")
    .selectAll()
    .where("guild_id", "=", guildId)
    .execute();
}

type Record = {
  author_id: string;
  // hack fix for weird types coming out of query
  date: string | unknown;
  message_count: number;
  word_count: number;
};

type GroupedResult = {
  [authorId: string]: {
    date: string;
    message_count: number;
    word_count: number;
  }[];
};

function groupByAuthor(records: Record[]): GroupedResult {
  return records.reduce((acc, record) => {
    const { author_id, date } = record;

    if (!acc[author_id]) {
      acc[author_id] = [];
    }

    // hack fix for weird types coming out of query
    acc[author_id].push({ ...record, date: date as string });

    return acc;
  }, {} as GroupedResult);
}
