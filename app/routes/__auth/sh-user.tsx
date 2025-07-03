import type { Route } from "./+types/sh-user";
import db from "#~/db.server";
import { type LoaderFunctionArgs, Link, useSearchParams } from "react-router";
import {
  ComposedChart,
  // Line,
  // Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  // Scatter,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { useMemo } from "react";
import { sql } from "kysely";
import { getOrFetchUser } from "#~/helpers/userInfoCache";
import { fillDateGaps } from "#~/helpers/dateUtils";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { guildId, userId } = params;
  if (!guildId || !userId) {
    throw new Error("cannot load data without user_id and guild_id");
  }

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  // TODO: this should be configurable
  // const allowedChannels: string[] = [];
  // const allowedCategories = ["Need Help", "React General", "Advanced Topics"];
  if (!start || !end) {
    throw new Error("cannot load data without start and end range");
  }

  const reportSlice = db
    .selectFrom("message_stats")
    .where("guild_id", "=", guildId)
    .where("author_id", "=", userId)
    .where("sent_at", ">=", new Date(start).getTime())
    .where("sent_at", "<=", new Date(end + "T23:59:59").getTime());

  const dailyBreakdownQuery = reportSlice
    .select((eb) => [
      eb.fn.countAll<number>().as("messages"),
      eb.fn.sum<number>("word_count").as("word_count"),
      eb.fn.sum<number>("react_count").as("react_count"),
      eb
        .fn<number>("round", [eb.fn.avg("word_count"), eb.lit(3)])
        .as("avg_words"),
      eb
        .fn<string>("date", [
          eb("sent_at", "/", eb.lit(1000)),
          sql.lit("unixepoch"),
        ])
        .as("date"),
    ])
    // .where((eb) =>
    //   eb.or([
    //     eb("channel_id", "in", allowedChannels),
    //     eb("channel_category", "in", allowedCategories),
    //   ]),
    // )
    .orderBy("date", "asc")
    .groupBy("date");

  const categoryBreakdownQuery = reportSlice
    .select((eb) => [
      eb.fn.count("channel_category").as("messages"),
      "channel_category",
    ])
    // .orderBy("messages", "desc")
    .groupBy("channel_category");

  const channelBreakdownQuery = reportSlice
    .leftJoin(
      "channel_info as channel",
      "channel.id",
      "message_stats.channel_id",
    )
    .select((eb) => [
      eb.fn.count("channel_id").as("messages"),
      "channel.name",
      "channel_id",
    ])
    .orderBy("messages", "desc")
    .groupBy("channel_id");

  const [dailyBreakdown, categoryBreakdown, channelBreakdown, userInfo] =
    await Promise.all([
      dailyBreakdownQuery.execute(),
      categoryBreakdownQuery.execute(),
      channelBreakdownQuery.execute(),
      getOrFetchUser(userId),
    ]);

  // Fill date gaps in daily breakdown data with zero values
  const filledDailyBreakdown = fillDateGaps(dailyBreakdown, start, end, {
    messages: 0,
    word_count: 0,
    react_count: 0,
    avg_words: 0,
  });

  return {
    dailyBreakdown: filledDailyBreakdown,
    categoryBreakdown,
    channelBreakdown,
    userInfo,
  };
}

export default function UserProfile({
  params,
  loaderData: data,
}: Route.ComponentProps) {
  const [qs] = useSearchParams();
  const start = qs.get("start");
  const end = qs.get("end");

  const derivedData = useMemo(() => {
    const totalMessages = data.categoryBreakdown.reduce(
      (a, c) => a + Number(c.messages),
      0,
    );
    const totalReactions = data.dailyBreakdown.reduce(
      (a, c) => a + Number(c.react_count),
      0,
    );
    const totalWords = data.dailyBreakdown.reduce(
      (a, c) => a + Number(c.word_count),
      0,
    );
    return { totalMessages, totalWords, totalReactions };
  }, [data]);

  return (
    <div className="h-full px-6 py-8">
      <div className="mx-auto max-w-screen-lg">
        <h1 className="pt-2 text-center text-4xl font-bold text-white">
          {data.userInfo?.username}
        </h1>
        {data.userInfo?.global_name &&
          data.userInfo?.global_name !== data.userInfo?.username && (
            <div className="pt-2 text-center text-xl text-gray-300">
              ({data.userInfo?.global_name})
            </div>
          )}
        <Link
          to={{
            pathname: `/app/${params.guildId}/sh`,
            search: `?start=${start}&end=${end}`,
          }}
          className="mb-4 inline-block rounded bg-gray-600 px-4 py-2 text-white transition-colors hover:bg-gray-500"
        >
          ← Back to Dashboard
        </Link>
        <details>
          <summary>raw data</summary>
          <textarea
            className="border"
            style={{ width: "100%", height: "200px" }}
            readOnly
            defaultValue={JSON.stringify(derivedData, null, 2)}
          />
        </details>

        <ResponsiveContainer width="100%" height={300}>
          <RadarChart
            cx="50%"
            cy="50%"
            outerRadius="80%"
            data={data.categoryBreakdown}
          >
            <PolarGrid />
            <PolarAngleAxis dataKey="channel_category" />
            <PolarRadiusAxis />
            <Tooltip />
            <Radar
              name="Channels"
              dataKey="messages"
              stroke="#8884d8"
              fill="#8884d8"
              fillOpacity={0.6}
            />
          </RadarChart>
        </ResponsiveContainer>

        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart
            width={500}
            height={300}
            data={data.channelBreakdown}
            margin={{
              top: 20,
              right: 50,
              bottom: 20,
              left: 20,
            }}
          >
            <CartesianGrid strokeDasharray="1 3" stroke="#ddd" />
            <XAxis dataKey="name" />
            <YAxis domain={[0, 250]} />
            <Tooltip />
            <Bar dataKey="messages" fill="#8884d8" />
          </ComposedChart>
        </ResponsiveContainer>

        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart
            width={500}
            height={200}
            data={data.dailyBreakdown}
            syncId="dailyStats"
            margin={{
              top: 20,
              right: 20,
              bottom: 20,
              left: 20,
            }}
          >
            <CartesianGrid strokeDasharray="7 3" stroke="#ddd" />
            <XAxis dataKey="date" scale="band" />
            <YAxis domain={[0, 125]} />
            <Tooltip />
            <Legend />
            <Bar dataKey="messages" fill="#413ea0" />
          </ComposedChart>
        </ResponsiveContainer>

        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart
            width={500}
            height={200}
            data={data.dailyBreakdown}
            syncId="dailyStats"
            margin={{
              top: 20,
              right: 20,
              bottom: 20,
              left: 20,
            }}
          >
            <CartesianGrid strokeDasharray="7 3" stroke="#ddd" />
            <XAxis dataKey="date" scale="band" />
            <YAxis domain={[0, 1250]} />
            <Tooltip />
            <Legend />
            <Bar dataKey="word_count" stackId="1" fill="red" />
          </ComposedChart>
        </ResponsiveContainer>

        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart
            width={500}
            height={200}
            data={data.dailyBreakdown}
            syncId="dailyStats"
            margin={{
              top: 20,
              right: 20,
              bottom: 20,
              left: 20,
            }}
          >
            <CartesianGrid strokeDasharray="7 3" stroke="#ddd" />
            <XAxis dataKey="date" scale="band" />
            <YAxis domain={[0, 25]} />
            <Tooltip />
            <Legend />
            <Bar dataKey="react_count" fill="green" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
