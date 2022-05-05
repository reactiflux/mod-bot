// TODO: layout that checks auth cookie and renders either the requested page or a login UI
import type { LoaderFunction } from "@remix-run/node";
import type { Session } from "@remix-run/server-runtime";
import { Outlet } from "@remix-run/react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

import {
  getCookieSession,
  getDbSession,
  getUser,
} from "~/models/session.server";
import { Login } from "~/components/login";

interface AuthData {
  session: Session;
}

export const loader: LoaderFunction = async ({ request }) => {
  const session = await getDbSession(request.headers.get("Cookie"));
  const user = await getUser(request);
  // retrieve token
  // refresh if needed

  return json<AuthData>({ session });
};

interface Props {}

export default function Auth({}: Props) {
  const { session } = useLoaderData() as AuthData;
  console.log({ session });

  if (session.id === "") {
    return <Login />;
  }

  return (
    <>
      {JSON.stringify(session, null, 2)}
      <Outlet />
    </>
  );
}
