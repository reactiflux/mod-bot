import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import { getUserId, initOauthLogin } from "~/models/session.server";
import { Login } from "~/components/login";

export const loader: LoaderFunction = async ({ request }) => {
  const userId = await getUserId(request);
  if (userId) return redirect("/");
  return redirect("/login");
};

export const action: ActionFunction = async ({ request }) => {
  // fetch user from db
  // if doesn't exist, create it with discord ID + email
  return initOauthLogin({
    request,
    redirectTo: "http://localhost:3000/discord-oauth",
  });
};

export default function LoginPage() {
  return <Login errors={undefined} />;
}
