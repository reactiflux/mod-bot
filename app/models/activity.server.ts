import type { DB } from "~/db.server";
import db from "~/db.server";

type MessageStats = DB["message_stats"];

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
    wordThreshold: 2200,
  };

  const baseQuery = db
    .selectFrom("message_stats")
    .selectAll()
    .select(({ fn, val, eb }) => [
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
    );

  // get shortlist, volume threshold of 1000 words
  const topMembersQuery = db
    .with("interval_message_stats", () => baseQuery)
    .selectFrom("interval_message_stats")
    .select(({ fn }) => [
      "author_id",
      fn.sum<number>("word_count").as("total_word_count"),
      fn.count<number>("author_id").as("message_count"),
      fn.sum<number>("react_count").as("total_reaction_count"),
      fn.count<number>("channel_category").distinct().as("category_count"),
      fn.count<number>("channel_id").distinct().as("channel_count"),
    ])
    .orderBy("message_count desc")
    .groupBy("author_id")
    .having(({ eb, or, fn }) =>
      or([
        eb(fn.count("author_id"), ">=", config.messageThreshold),
        eb(fn.sum("word_count"), ">=", config.wordThreshold),
      ]),
    )
    .limit(config.count);
  console.log(topMembersQuery.compile().sql);
  const topMembers = await topMembersQuery.execute();

  const dailyParticipationQuery = db
    .with("interval_message_stats", () => baseQuery)
    .selectFrom("interval_message_stats")
    .select(({ fn }) => [
      "author_id",
      "date",
      fn.count<number>("author_id").as("message_count"),
      fn.sum<number>("word_count").as("word_count"),
      fn.count<number>("channel_id").distinct().as("channel_count"),
      fn.count<number>("channel_category").distinct().as("category_count"),
    ])
    .distinct()
    .groupBy("date")
    .groupBy("author_id")
    .where(
      "author_id",
      "in",
      topMembers.map((m) => m.author_id),
    );
  console.log(dailyParticipationQuery.compile().sql);
  const dailyParticipation = fillDateGaps(
    groupByAuthor(await dailyParticipationQuery.execute()),
    intervalStart,
    intervalEnd,
  );

  return topMembers.map((m) => ({
    ...m,
    participation: dailyParticipation[m.author_id],
  }));
}

type ParticipationData = {
  author_id: string;
  // hack fix for weird types coming out of query
  date: string | unknown;
  message_count: number;
  word_count: number;
  channel_count: number;
  category_count: number;
};

type GroupedResult = {
  [authorId: string]: {
    date: string;
    message_count: number;
    word_count: number;
    channel_count: number;
    category_count: number;
  }[];
};
function groupByAuthor(records: ParticipationData[]): GroupedResult {
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

const generateDateRange = (start: string, end: string): string[] => {
  const dates: string[] = [];
  let currentDate = new Date(start);

  while (currentDate <= new Date(end)) {
    dates.push(currentDate.toISOString().split("T")[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
};

function fillDateGaps(
  groupedResult: GroupedResult,
  startDate: string,
  endDate: string,
): GroupedResult {
  // Helper to generate a date range in YYYY-MM-DD format

  const dateRange = generateDateRange(startDate, endDate);

  const filledResult: GroupedResult = {};

  for (const authorId in groupedResult) {
    const authorData = groupedResult[authorId];
    const dateToEntryMap: Record<string, typeof authorData[number]> = {};

    // Map existing entries by date
    authorData.forEach((entry) => {
      dateToEntryMap[entry.date] = entry;
    });

    // Fill missing dates with zeroed-out data
    filledResult[authorId] = dateRange.map((date) => {
      return (
        dateToEntryMap[date] || {
          date,
          message_count: 0,
          word_count: 0,
          channel_count: 0,
          category_count: 0,
        }
      );
    });
  }

  return filledResult;
}
