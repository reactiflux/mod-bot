import type { LabelHTMLAttributes, PropsWithChildren } from "react";
import { data, Link, useSearchParams } from "react-router";

import { log, trackPerformance } from "#~/helpers/observability";
import { getTopParticipants } from "#~/models/activity.server";

import type { Route } from "./+types/dashboard";

export async function loader({ params, request }: Route.LoaderArgs) {
  return trackPerformance(
    "dashboardLoader",
    async () => {
      const url = new URL(request.url);
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");
      const guildId = params.guildId;

      log("info", "Dashboard", "Dashboard loader accessed", {
        guildId,
        start,
        end,
        userAgent: request.headers.get("user-agent"),
        ip: request.headers.get("x-forwarded-for") ?? "unknown",
      });

      if (!(guildId && start && end)) {
        log(
          "warn",
          "Dashboard",
          "Invalid dashboard request - missing parameters",
          {
            guildId,
            start,
            end,
          },
        );
        return data(null, { status: 400 });
      }

      const output = await getTopParticipants(guildId, start, end);

      log("info", "Dashboard", "Dashboard data loaded successfully", {
        guildId,
        start,
        end,
        participantCount: output.length || 0,
      });

      return output;
    },
    {
      guildId: params.guildId,
      start: new URL(request.url).searchParams.get("start"),
      end: new URL(request.url).searchParams.get("end"),
    },
  );
}

const Label = (props: LabelHTMLAttributes<Element>) => (
  <label {...props} className={`${props.className ?? ""} m-4`}>
    {props.children}
  </label>
);

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});
const percent = percentFormatter.format.bind(percentFormatter);

function RangeForm({ values }: { values: { start?: string; end?: string } }) {
  return (
    <form method="GET">
      <Label>
        Start date
        <input name="start" type="date" defaultValue={values.start} />
      </Label>
      <Label>
        End date
        <input name="end" type="date" defaultValue={values.end} />
      </Label>
      <input type="submit" value="Submit" />
    </form>
  );
}

const DataHeading = ({ children }: PropsWithChildren) => {
  return (
    <th className="relative max-w-8 origin-bottom-left -rotate-45 text-nowrap">
      {children}
    </th>
  );
};

export default function DashboardPage({
  loaderData: data,
}: Route.ComponentProps) {
  const [qs] = useSearchParams();

  const start = qs.get("start") ?? undefined;
  const end = qs.get("end") ?? undefined;

  if (!data) {
    return (
      <div className="h-full px-6 py-8">
        <div className="flex justify-center">
          <RangeForm values={{ start, end }} />
        </div>
        <div></div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8">
      <div className="flex justify-center">
        <RangeForm values={{ start, end }} />
      </div>
      <div>
        <textarea
          defaultValue={`Author ID,Percent Zero Days,Word Count,Message Count,Channel Count,Category Count,Reaction Count,Word Score,Message Score,Channel Score,Consistency Score
${data
  .map(
    (d) =>
      `${d.data.member.author_id},${d.metadata.percentZeroDays},${d.data.member.total_word_count},${d.data.member.message_count},${d.data.member.channel_count},${d.data.member.category_count},${d.data.member.total_reaction_count},${d.score.wordScore},${d.score.messageScore},${d.score.channelScore},${d.score.consistencyScore}`,
  )
  .join("\n")}`}
        ></textarea>
        <table className="mt-24">
          <thead>
            <tr>
              <DataHeading>Author ID</DataHeading>
              <DataHeading>Percent Zero Days</DataHeading>
              <DataHeading>Word Count</DataHeading>
              <DataHeading>Message Count</DataHeading>
              <DataHeading>Channel Count</DataHeading>
              <DataHeading>Category Count</DataHeading>
              <DataHeading>Reaction Count</DataHeading>
              <DataHeading>Word Score</DataHeading>
              <DataHeading>Message Score</DataHeading>
              <DataHeading>Channel Score</DataHeading>
              <DataHeading>Consistency Score</DataHeading>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.data.member.author_id}>
                <td>
                  <Link
                    to={{
                      pathname: d.data.member.author_id,
                      search: `?start=${start}&end=${end}`,
                    }}
                  >
                    {d.data.member.username ?? d.data.member.author_id}
                  </Link>
                </td>
                <td>{percent(d.metadata.percentZeroDays)}</td>
                <td>{d.data.member.total_word_count}</td>
                <td>{d.data.member.message_count}</td>
                <td>{d.data.member.channel_count}</td>
                <td>{d.data.member.category_count}</td>
                <td>{d.data.member.total_reaction_count}</td>
                <td>{d.score.wordScore}</td>
                <td>{d.score.messageScore}</td>
                <td>{d.score.channelScore}</td>
                <td>{d.score.consistencyScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
