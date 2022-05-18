import type { LoaderFunction } from "@remix-run/server-runtime";
import { completeOauthLogin } from "~/models/session.server";

export const loader: LoaderFunction = async ({ request }) => {
  return await completeOauthLogin(request);
};
