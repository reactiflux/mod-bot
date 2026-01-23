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
    title: "Euno – A Discord moderation bot",
    viewport: "width=device-width,initial-scale=1",
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  return {
    user: await getUser(request),
  };
}

function Footer() {
  return null;
}

export default function App() {
  return (
    <html lang="en" className="flex h-full flex-col">
      <head>
        <Meta />
        <Links />
      </head>
      <body className="flex min-h-full flex-col">
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
