import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import { getUser, initOauthLogin } from "~/models/session.server";
import { Login } from "~/components/login";

export const loader: LoaderFunction = async ({ request }) => {
  const user = await getUser(request);
  if (user) return redirect("/");
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
  return (
    <div className="flex min-h-full flex-col justify-center">
      <div className="mx-auto w-full max-w-md px-8">
        <Login redirectTo="/dashboard" />;
      </div>
    </div>
  );
}
