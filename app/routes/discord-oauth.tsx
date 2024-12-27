import { redirect, type LoaderFunction } from "@remix-run/node";
import { completeOauthLogin } from "~/models/session.server";

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const cookie = request.headers.get("Cookie");
  if (!code) {
    console.error("No code provided by Discord");
    return redirect("/");
  }
  if (!cookie) {
    console.error("No cookie found when responding to Discord oauth");
    throw redirect("/login", 500);
  }

  return await completeOauthLogin(
    code,
    cookie,
    url.searchParams.get("state") ?? undefined,
  );
};
