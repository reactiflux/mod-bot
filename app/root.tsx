import type { LoaderFunction, MetaFunction } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";

import "./styles/tailwind.css";
import { getUser } from "./models/session.server";

export const meta: MetaFunction = () => [
  {
    charset: "utf-8",
    title: "Remix Notes",
    viewport: "width=device-width,initial-scale=1",
  },
];

export const loader: LoaderFunction = async ({
  request,
}: Parameters<LoaderFunction>[0]) => {
  return {
    user: await getUser(request),
  };
};

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
