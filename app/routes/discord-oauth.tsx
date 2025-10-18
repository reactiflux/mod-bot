import type { Route } from "./+types/discord-oauth";
import { completeOauthLogin } from "#~/models/session.server";

export async function loader({ request }: Route.LoaderArgs) {
  return await completeOauthLogin(request);
}
