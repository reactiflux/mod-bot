import type { LoaderArgs, ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import type { LabelHTMLAttributes } from "react";
import { getTopParticipants } from "~/models/activity.server";

export const loader = async ({ request, context, params }: LoaderArgs) => {
  // const user = await getUser(request);
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  if (!start || !end) {
    return json({});
  }

  // convert times to unix stamps (tz? utc i guess)
  // query DB

  const REACTIFLUX_GUILD_ID = "102860784329052160";
  const output = await getTopParticipants(
    REACTIFLUX_GUILD_ID,
    start,
    end,
    [],
    ["Need Help", "React General", "Advanced Topics"],
  );
  console.log(output);

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

export default function DashboardPage() {
  const data = useLoaderData<typeof loader>();

  console.log(data);
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
        <ShittyTable data={data.topMembers} />
        <ShittyTable data={data.dailyParticipation} />
      </div>
    </div>
  );
}

const ShittyTable = ({ data }) => {
  const keys = Object.keys(data[0]);
  return (
    <div>
      <p>{data.length} entries</p>
      <table>
        <tr>
          {keys.map((k) => (
            <th key={k}>{k}</th>
          ))}
        </tr>
        {data.map((d) => (
          <tr key={keys.reduce((o, k) => o + d[k], "")}>
            {keys.map((k) => (
              <td key={d[k]}>{d[k]}</td>
            ))}
          </tr>
        ))}
      </table>
    </div>
  );
};
