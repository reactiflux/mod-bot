import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import type { LabelHTMLAttributes } from "react";
import { getTopParticipants } from "~/models/activity.server";

export const loader = async ({
  request,
  // context,
  // params,
}: Parameters<LoaderFunction>[0]) => {
  // const user = await getUser(request);
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  if (!start || !end) {
    return json(null, { status: 400 });
  }

  const REACTIFLUX_GUILD_ID = "102860784329052160";
  const output = await getTopParticipants(
    REACTIFLUX_GUILD_ID,
    start,
    end,
    [],
    ["Need Help", "React General", "Advanced Topics"],
  );

  return json(output);
};

export const action: ActionFunction = async ({ request }) => {
  console.log({ request });
};

const Label = (props: LabelHTMLAttributes<Element>) => (
  <label {...props} className={`${props.className ?? ""} m-4`}>
    {props.children}
  </label>
);

const formatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

export default function DashboardPage() {
  const data = useLoaderData<typeof loader>();

  if (!data) {
    return "loading…";
  }

  return (
    <div>
      <div className="flex min-h-full justify-center">
        <div>test butts</div>
        <form method="GET">
          <Label>
            Start date
            <input name="start" type="date" />
          </Label>
          <Label>
            End date
            <input name="end" type="date" />
          </Label>
          <input type="submit" value="Submit" />
        </form>
      </div>
      <div>
        <textarea>
          {`Author ID,Percent Zero Days,Word Count,Message Count,Channel Count,Category Count,Reaction Count,Word Score,Message Score,Channel Score,Consistency Score
${data
  .map(
    (d) =>
      `${d.data.member.author_id},${d.metadata.percentZeroDays},${d.data.member.total_word_count},${d.data.member.message_count},${d.data.member.channel_count},${d.data.member.category_count},${d.data.member.total_reaction_count},${d.score.wordScore},${d.score.messageScore},${d.score.channelScore},${d.score.consistencyScore}`,
  )
  .join("\n")}`}
        </textarea>
        <table>
          <thead>
            <tr>
              <th>Author ID</th>
              <th>Percent Zero Days</th>
              <th>Word Count</th>
              <th>Message Count</th>
              <th>Channel Count</th>
              <th>Category Count</th>
              <th>Reaction Count</th>
              <th>Word Score</th>
              <th>Message Score</th>
              <th>Channel Score</th>
              <th>Consistency Score</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.data.member.author_id}>
                <td>{d.data.member.author_id}</td>
                <td>{formatter.format(d.metadata.percentZeroDays)}</td>
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
