import { Outlet, useLoaderData, useLocation } from "react-router";

import TTLCache from "@isaacs/ttlcache";

import { Login } from "#~/basics/login";
import { DiscordLayout } from "#~/components/DiscordLayout";
import { ssrDiscordSdk, userDiscordSdkFromRequest } from "#~/discord/api.js";
import { log, trackPerformance } from "#~/helpers/observability";
import { fetchGuilds } from "#~/models/discord.server";
import { getUser } from "#~/models/session.server";
import { useOptionalUser } from "#~/utils";

import type { Route } from "./+types/__auth";

// TTL cache for guild data - 5 minute TTL, max 100 users
const guildCache = new TTLCache<
  string,
  {
    id: string;
    name: string;
    icon?: string;
    hasBot: boolean;
    authz: string[];
  }[]
>({
  ttl: 5 * 60 * 1000, // 5 minutes
  max: 100, // max 100 users cached
});

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);

  // If no user, return null - component will handle auth
  if (!user) {
    return { guilds: [] };
  }

  try {
    // Check cache first
    const cachedGuilds = guildCache.get(user.id);
    if (cachedGuilds) {
      return { guilds: cachedGuilds };
    }

    // Get user's Discord token for user-specific guild fetching
    const userRest = await userDiscordSdkFromRequest(request);

    // Fetch guilds using both user token and bot token
    const guilds = await trackPerformance("discord.fetchGuilds", () =>
      fetchGuilds(userRest, ssrDiscordSdk),
    );

    // Cache the result
    guildCache.set(user.id, guilds);

    log("info", "auth", "Guilds fetched for authenticated user", {
      userId: user.id,
      totalGuilds: guilds.length,
      manageableGuilds: guilds.filter((g) => g.hasBot).length,
    });

    return { guilds };
  } catch (error) {
    log("error", "auth", "Failed to fetch guilds", { userId: user.id, error });
    // Return empty guilds on error - don't break auth flow
    return { guilds: [] };
  }
}

export default function Auth() {
  const user = useOptionalUser();
  const { pathname, search, hash } = useLocation();
  const { guilds } = useLoaderData<typeof loader>();

  if (!user) {
    return (
      <div className="flex min-h-full flex-col justify-center">
        <div className="mx-auto w-full max-w-md px-8">
          <Login redirectTo={`${pathname}${search}${hash}`} />
        </div>
      </div>
    );
  }

  return (
    <DiscordLayout guilds={guilds}>
      <Outlet />
    </DiscordLayout>
  );
}
