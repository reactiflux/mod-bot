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
import { jsonBuildObject } from "kysely/helpers/sqlite";

type DailyStats = {
  messages: number;
  word_count: number;
  char_count: number;
  react_count: number;
  avg_words: number;
  date: string;
};

type CategoryBreakdown = {
  category: number;
  messages: number;
};

type ChannelBreakdown = {
  id: string;
  messages: number;
};

type Result = {
  daily_breakdown: DailyStats[];
  category_breakdown: CategoryBreakdown[];
  channel_breakdown: ChannelBreakdown[];
};

export async function loader({
  request,
  params,
}: LoaderFunctionArgs): Promise<Result> {
  const { guildId, userId } = params;
  if (!guildId || !userId) {
    throw new Error("cannot load data without user_id and guild_id");
  }

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  // TODO: this should be configurable
  const allowedChannels: string[] = [];
  const allowedCategories = ["Need Help", "React General", "Advanced Topics"];
  if (!start || !end) {
    throw new Error("cannot load data without start and end range");
  }

  const query = db
    .with("report_slice", (eb) =>
      eb
        .selectFrom("message_stats")
        .selectAll()
        .where("guild_id", "=", guildId)
        .where("author_id", "=", userId)
        .where("sent_at", ">=", new Date(start).getTime())
        .where("sent_at", "<", new Date(end).getTime()),
    )
    .with("daily_breakdown", (eb) =>
      eb
        .selectFrom("report_slice")
        .select((eb) => [
          eb.fn.countAll().as("messages"),
          eb.fn.sum("word_count").as("word_count"),
          eb.fn.sum("char_count").as("char_count"),
          eb.fn.sum("react_count").as("react_count"),
          eb.fn("round", [eb.fn.avg("word_count"), eb.lit(3)]).as("avg_words"),
          eb
            .fn("date", [
              eb("sent_at", "/", eb.lit(1000)),
              sql.lit("unixepoch"),
            ])
            .as("date"),
        ])
        .where((eb) =>
          eb.or([
            eb("channel_id", "in", allowedChannels),
            eb("channel_category", "in", allowedCategories),
          ]),
        )
        .orderBy("date", "asc")
        .groupBy("date"),
    )

    .with("category_breakdown", (eb) =>
      eb
        .selectFrom("report_slice")
        .select((eb) => [
          eb.fn.count("channel_category").as("messages"),
          "channel_category",
        ])
        // .orderBy("messages", "desc")
        .groupBy("channel_category"),
    )

    .with("channel_breakdown", (eb) =>
      eb
        .selectFrom("report_slice")
        .select((eb) => [
          eb.fn.count("channel_id").as("messages"),
          "channel_id",
        ])
        .orderBy("messages", "desc")
        .groupBy("channel_id"),
    )

    .selectNoFrom((eb) => [
      eb
        .selectFrom("channel_breakdown")
        .select((eb) => [
          eb
            .fn<ChannelBreakdown[]>("json_group_array", [
              jsonBuildObject({
                id: eb.ref("channel_id"),
                messages: eb.ref("messages"),
              }),
            ])
            .as("ch"),
        ])
        .as("channel_breakdown"),

      eb
        .selectFrom("category_breakdown")
        .select((eb) => [
          eb
            .fn<CategoryBreakdown[]>("json_group_array", [
              jsonBuildObject({
                messages: eb.ref("messages"),
                category: eb.ref("channel_category"),
              }),
            ])
            .as("ca"),
        ])
        .as("category_breakdown"),

      eb
        .selectFrom("daily_breakdown")
        .select((eb) => [
          eb
            .fn<DailyStats[]>("json_group_array", [
              jsonBuildObject({
                messages: eb.ref("messages"),
                word_count: eb.ref("word_count"),
                char_count: eb.ref("char_count"),
                react_count: eb.ref("react_count"),
                avg_words: eb.ref("avg_words"),
                date: eb.ref("date"),
              }),
            ])
            .as("da"),
        ])
        .as("daily_breakdown"),
    ]);

  const result = await query.executeTakeFirstOrThrow();

  if (!result.daily_breakdown) {
    throw new Error("No data found for the given user and guild.");
  }

  if (!result.category_breakdown) {
    throw new Error("No data found for the given user and guild.");
  }

  if (!result.channel_breakdown) {
    throw new Error("No data found for the given user and guild.");
  }

  return result;
}

export default function UserProfile({
  params,
  loaderData: data,
}: Route.ComponentProps) {
  const [qs] = useSearchParams();
  const start = qs.get("start");
  const end = qs.get("end");

  const derivedData = useMemo(() => {
    const totalMessages = data.category_breakdown.reduce(
      (a, c) => a + Number(c.messages),
      0,
    );
    const totalReactions = data.daily_breakdown.reduce(
      (a, c) => a + Number(c.react_count),
      0,
    );
    const totalWords = data.daily_breakdown.reduce(
      (a, c) => a + Number(c.word_count),
      0,
    );
    const totalChars = data.daily_breakdown.reduce(
      (a, c) => a + Number(c.char_count),
      0,
    );
    return { totalMessages, totalWords, totalReactions, totalChars };
  }, [data]);

  return (
    <>
      <h1>{params.userId}</h1>
      <Link
        to={{
          pathname: `/${params.guildId}/sh`,
          search: `?start=${start}&end=${end}`,
        }}
      >
        back
      </Link>
      <textarea
        className="border"
        style={{ width: "100%", height: "200px" }}
        readOnly
        defaultValue={JSON.stringify({ derivedData, ...data }, null, 2)}
      />

      <ResponsiveContainer width="100%" height={300}>
        <RadarChart
          cx="50%"
          cy="50%"
          outerRadius="80%"
          data={data.category_breakdown}
        >
          <PolarGrid />
          <PolarAngleAxis dataKey="category" />
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
          data={data.channel_breakdown}
          margin={{
            top: 20,
            right: 50,
            bottom: 20,
            left: 20,
          }}
        >
          <CartesianGrid strokeDasharray="1 3" stroke="#ddd" />
          <XAxis dataKey="id" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="messages" fill="#8884d8" />
        </ComposedChart>
      </ResponsiveContainer>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          width={500}
          height={200}
          data={data.daily_breakdown}
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
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="messages" fill="#413ea0" />
        </ComposedChart>
      </ResponsiveContainer>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          width={500}
          height={200}
          data={data.daily_breakdown}
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
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="word_count" stackId="1" fill="red" />
          <Bar dataKey="char_count" stackId="1" fill="blue" />
        </ComposedChart>
      </ResponsiveContainer>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          width={500}
          height={200}
          data={data.daily_breakdown}
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
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="react_count" fill="green" />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}
