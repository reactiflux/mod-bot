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
  Scatter,
  ResponsiveContainer,
} from "recharts";

export function loader({ request, params }: LoaderFunctionArgs) {
  const { guildId, userId } = params;
  if (!guildId || !userId) {
    throw new Error("cannot load data without user_id and guild_id");
  }

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) {
    throw new Error("cannot load data without user_id and guild_id");
  }

  const query = db
    .selectFrom("message_stats")
    .select((eb) => [
      eb.fn.count("message_id").as("message_count"),
      eb.fn.sum("word_count").as("word_count"),
      eb.fn.sum("char_count").as("char_count"),
      eb.fn.sum("react_count").as("react_count"),
      eb.fn("date", [eb("sent_at", "/", 1000), eb.val("unixepoch")]).as("date"),
    ])
    .where("guild_id", "=", guildId)
    .where("author_id", "=", userId)
    .where("sent_at", ">=", new Date(start).getTime())
    .where("sent_at", "<", new Date(end).getTime())
    .orderBy("date", "asc")
    .groupBy("date");

  return query.execute();
}

export default function UserProfile({
  params,
  loaderData: data,
}: Route.ComponentProps) {
  const [qs] = useSearchParams();
  const start = qs.get("start");
  const end = qs.get("end");

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
        defaultValue={JSON.stringify(data, null, 2)}
      />
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          width={500}
          height={200}
          data={data}
          margin={{
            top: 20,
            right: 20,
            bottom: 20,
            left: 20,
          }}
        >
          <CartesianGrid stroke="#f5f5f5" />
          <XAxis dataKey="date" scale="band" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="message_count" barSize={20} fill="#413ea0" />
          {
            // <Area type="monotone" dataKey="amt" fill="#8884d8" stroke="#8884d8" />
            // <Line type="monotone" dataKey="uv" stroke="#ff7300" />
          }
          <Scatter dataKey="react_count" fill="red" />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}
