import { Outlet, useLocation, useLoaderData } from "react-router";
import type { Route } from "./+types/__auth";
import { Login } from "#~/basics/login";
import { useOptionalUser } from "#~/utils";
import { getUser, retrieveDiscordToken } from "#~/models/session.server";
import { fetchGuilds } from "#~/models/discord.server";
import { rest } from "#~/discord/api.js";
import { REST } from "@discordjs/rest";
import { log, trackPerformance } from "#~/helpers/observability";
import { createContext, useContext } from "react";
import TTLCache from "@isaacs/ttlcache";

// Guild context for sharing guild data across authenticated routes
interface GuildContextType {
  guilds: Array<{
    id: string;
    name: string;
    icon?: string;
    hasBot: boolean;
    authz: string[];
  }>;
}

// TTL cache for guild data - 5 minute TTL, max 100 users
const guildCache = new TTLCache<string, GuildContextType["guilds"]>({
  ttl: 5 * 60 * 1000, // 5 minutes
  max: 100, // max 100 users cached
});

const GuildContext = createContext<GuildContextType | null>(null);

export function useGuilds() {
  const context = useContext(GuildContext);
  if (!context) {
    throw new Error("useGuilds must be used within a GuildProvider");
  }
  return context;
}

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
    const userToken = await retrieveDiscordToken(request);
    const userRest = new REST({ version: "10", authPrefix: "Bearer" }).setToken(
      userToken.token.access_token as string,
    );

    // Fetch guilds using both user token and bot token
    const guilds = await trackPerformance("discord.fetchGuilds", () =>
      fetchGuilds(userRest, rest),
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
    <GuildContext.Provider value={{ guilds }}>
      <Outlet />
    </GuildContext.Provider>
  );
}
