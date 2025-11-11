import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type LoaderFunctionArgs,
  type MetaFunction,
} from "react-router";

import "./styles/tailwind.css";

import { getUser } from "./models/session.server";

export const meta: MetaFunction = () => [
  {
    charset: "utf-8",
    title: "Remix Notes",
    viewport: "width=device-width,initial-scale=1",
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  return {
    user: await getUser(request),
  };
}

export default function App() {
  return (
    <html lang="en" className="h-full">
      <head>
        <Meta />
        <Links />
      </head>
      <body className="h-full">
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
