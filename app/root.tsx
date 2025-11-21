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

function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} Euno. All rights reserved.
          </p>
          <div className="flex gap-6">
            <a
              href="/terms"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Terms of Service
            </a>
            <a
              href="/privacy"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Privacy Policy
            </a>
            <a
              href="mailto:support@euno.reactiflux.com"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
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
