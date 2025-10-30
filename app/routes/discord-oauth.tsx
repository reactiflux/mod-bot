import { completeOauthLogin } from "#~/models/session.server";

import type { Route } from "./+types/discord-oauth";

export async function loader({ request }: Route.LoaderArgs) {
  return await completeOauthLogin(request);
}
