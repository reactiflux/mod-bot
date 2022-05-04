import { useLoaderData } from "@remix-run/react";
import { LoaderFunction } from "@remix-run/server-runtime";
import { useLocation } from "react-router-dom";
import { completeOauthLogin } from "~/models/session.server";

export const loader: LoaderFunction = async ({ request }) => {
  return await completeOauthLogin(request);
};
