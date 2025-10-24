import type { Route } from "./+types/dashboard";
import { data, useSearchParams, Link } from "react-router";
import type { LabelHTMLAttributes, PropsWithChildren } from "react";
import { getTopParticipants } from "#~/models/activity.server";
import { log, trackPerformance } from "#~/helpers/observability";

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
        ip: request.headers.get("x-forwarded-for") || "unknown",
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
        participantCount: output?.length || 0,
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

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
}).format;

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

const Td = ({ children, ...props }: PropsWithChildren) => (
  <td {...props} className="padding-8">
    {children}
  </td>
);
const Th = ({ children, ...props }: PropsWithChildren) => (
  <th
    {...props}
    className="relative max-w-8 origin-bottom-left -rotate-45 text-nowrap"
  >
    {children}
  </th>
);
const Tr = ({ children, ...props }: PropsWithChildren) => (
  <tr {...props}>{children}</tr>
);

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
            <Tr>
              <Th>Author ID</Th>
              <Th>Percent Zero Days</Th>
              <Th>Word Count</Th>
              <Th>Message Count</Th>
              <Th>Channel Count</Th>
              <Th>Category Count</Th>
              <Th>Reaction Count</Th>
              <Th>Word Score</Th>
              <Th>Message Score</Th>
              <Th>Channel Score</Th>
              <Th>Consistency Score</Th>
            </Tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <Tr key={d.data.member.author_id}>
                <Td>
                  <Link
                    to={{
                      pathname: d.data.member.author_id,
                      search: `?start=${start}&end=${end}`,
                    }}
                  >
                    {d.data.member.username || d.data.member.author_id}
                  </Link>
                </Td>
                <Td>{percent(d.metadata.percentZeroDays)}</Td>
                <Td>{d.data.member.total_word_count}</Td>
                <Td>{d.data.member.message_count}</Td>
                <Td>{d.data.member.channel_count}</Td>
                <Td>{d.data.member.category_count}</Td>
                <Td>{d.data.member.total_reaction_count}</Td>
                <Td>{d.score.wordScore}</Td>
                <Td>{d.score.messageScore}</Td>
                <Td>{d.score.channelScore}</Td>
                <Td>{d.score.consistencyScore}</Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
