import type { Route } from "./+types/sh-user";
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
import { getUserMessageAnalytics } from "#~/models/activity.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { guildId, userId } = params;
  if (!guildId || !userId) {
    throw new Error("cannot load data without user_id and guild_id");
  }

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  if (!start || !end) {
    throw new Error("cannot load data without start and end range");
  }

  // Use shared analytics function with channel filtering disabled for user view
  return await getUserMessageAnalytics(guildId, userId, start, end);
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
      (a: number, c: { messages: number }) => a + Number(c.messages),
      0,
    );
    const totalReactions = data.dailyBreakdown.reduce(
      (a: number, c: { react_count: number }) => a + Number(c.react_count),
      0,
    );
    const totalWords = data.dailyBreakdown.reduce(
      (a: number, c: { word_count: number }) => a + Number(c.word_count),
      0,
    );
    return { totalMessages, totalWords, totalReactions };
  }, [data]);

  return (
    <>
      <style>{`
text {
  fill: #ccc;
}
.recharts-default-tooltip {
  background-color: rgb(55,65,81) !important;
}`}</style>

      <div className="flex h-16 items-center justify-between border-b border-gray-700 px-4">
        <Link
          to={{
            pathname: `/app/${params.guildId}/sh`,
            search: `?start=${start}&end=${end}`,
          }}
          className="rounded bg-gray-600 px-4 py-2 text-white transition-colors hover:bg-gray-500"
        >
          ← Dashboard
        </Link>

        <h1 className="text-4xl font-bold">
          {data.userInfo?.username}
          <small className="text-gray-300">
            {data.userInfo?.global_name &&
              data.userInfo?.global_name !== data.userInfo?.username && (
                <div className="pt-2 text-center text-xl text-gray-300">
                  ({data.userInfo?.global_name})
                </div>
              )}
          </small>
        </h1>
        <div className="px-4"> </div>
      </div>

      <div className="h-full px-6 py-8">
        <div>
          {/* (top 5: 👀❤️✨‼️🫡) (top langs: JS, Go, Rust) */}
          <p>{`${derivedData.totalMessages} messages in ${data.channelBreakdown.length} channels
${derivedData.totalWords} words sent 
${derivedData.totalReactions} reactions`}</p>
        </div>
        <div className="mx-auto max-w-screen-lg">
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
              <Legend fill="lightgray" />
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
              <Legend fill="lightgray" />
              <Bar dataKey="messages" fill="#8884d8" />
            </ComposedChart>
          </ResponsiveContainer>

          {[
            { key: "messages", domain: [0, 125], fill: "#413ea0" },
            { key: "word_count", domain: [0, 1250], fill: "red", stackId: "1" },
            { key: "react_count", domain: [0, 25], fill: "green" },
          ].map(({ key, domain, fill, stackId }) => (
            <ResponsiveContainer key={key} width="100%" height={300}>
              <ComposedChart
                width={500}
                height={200}
                data={data.dailyBreakdown}
                syncId="dailyStats"
                margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
              >
                <CartesianGrid strokeDasharray="7 3" stroke="#ddd" />
                <XAxis dataKey="date" scale="band" />
                <YAxis domain={domain} />
                <Tooltip />
                <Legend />
                <Bar dataKey={key} fill={fill} stackId={stackId} />
              </ComposedChart>
            </ResponsiveContainer>
          ))}
        </div>
      </div>
    </>
  );
}
