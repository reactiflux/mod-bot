import type { Route } from "./+types/guilds";
import { useLoaderData, Link } from "react-router";
import { requireUser, retrieveDiscordToken } from "#~/models/session.server";
import { fetchGuilds } from "#~/models/discord.server";
import { rest } from "#~/discord/api.js";
import { REST } from "@discordjs/rest";
import { log, trackPerformance } from "#~/helpers/observability";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);

  // Get user's Discord token for user-specific guild fetching
  const userToken = await retrieveDiscordToken(request);
  const userRest = new REST({ version: "10", authPrefix: "Bearer" }).setToken(
    userToken.token.access_token as string,
  );

  // Fetch guilds using both user token (for user's guilds) and bot token (for bot's guilds)
  const guilds = await trackPerformance("discord.fetchGuilds", () =>
    fetchGuilds(userRest, rest),
  );

  log("info", "guilds", "Guilds fetched successfully", {
    userId: user.id,
    totalGuilds: guilds.length,
    manageableGuilds: guilds.filter((g) => g.hasBot).length,
    invitableGuilds: guilds.filter((g) => !g.hasBot).length,
  });

  return { guilds };
}

export default function Guilds() {
  const { guilds } = useLoaderData<typeof loader>();

  const manageableGuilds = guilds.filter((guild) => guild.hasBot);
  const invitableGuilds = guilds.filter((guild) => !guild.hasBot);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold text-gray-900">
            Your Discord Servers
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Manage Euno in your servers or add it to new ones
          </p>
        </div>

        {/* Manageable Guilds - Where Euno is already added */}
        {manageableGuilds.length > 0 && (
          <div className="mb-12">
            <h2 className="mb-6 text-xl font-bold text-gray-900">
              Servers with Euno ({manageableGuilds.length})
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {manageableGuilds.map((guild) => (
                <div
                  key={guild.id}
                  className="overflow-hidden rounded-lg bg-white shadow-md transition-shadow duration-200 hover:shadow-lg"
                >
                  <div className="p-6">
                    <div className="mb-4 flex items-center">
                      {guild.icon ? (
                        <img
                          src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`}
                          alt={`${guild.name} icon`}
                          className="mr-4 h-12 w-12 rounded-full"
                        />
                      ) : (
                        <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-300">
                          <span className="text-lg font-semibold text-gray-600">
                            {guild.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <h3 className="truncate text-lg font-semibold text-gray-900">
                          {guild.name}
                        </h3>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {guild.authz.map((perm) => (
                            <span
                              key={perm}
                              className="inline-flex items-center rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
                            >
                              {perm}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-3">
                      <Link
                        to={`/${guild.id}/sh`}
                        className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                      >
                        Dashboard
                      </Link>
                      <Link
                        to={`/onboard?guild_id=${guild.id}`}
                        className="flex-1 rounded-md bg-gray-200 px-4 py-2 text-center text-sm font-medium text-gray-800 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                      >
                        Configure
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invitable Guilds - Where user can add Euno */}
        {invitableGuilds.length > 0 && (
          <div className="mb-12">
            <h2 className="mb-6 text-xl font-bold text-gray-900">
              Add Euno to More Servers ({invitableGuilds.length})
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {invitableGuilds.map((guild) => (
                <div
                  key={guild.id}
                  className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md transition-shadow duration-200 hover:shadow-lg"
                >
                  <div className="p-6">
                    <div className="mb-4 flex items-center">
                      {guild.icon ? (
                        <img
                          src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`}
                          alt={`${guild.name} icon`}
                          className="mr-4 h-12 w-12 rounded-full opacity-75"
                        />
                      ) : (
                        <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-200">
                          <span className="text-lg font-semibold text-gray-500">
                            {guild.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <h3 className="truncate text-lg font-semibold text-gray-700">
                          {guild.name}
                        </h3>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {guild.authz.map((perm) => (
                            <span
                              key={perm}
                              className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                            >
                              {perm}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <a
                      href={`/auth/discord/bot?guild_id=${guild.id}`}
                      className="block w-full rounded-md bg-green-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                    >
                      Add Euno Bot
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No guilds state */}
        {guilds.length === 0 && (
          <div className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gray-100">
              <svg
                className="h-12 w-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.5a8.25 8.25 0 0116.5 0"
                />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-medium text-gray-900">
              No Discord servers found
            </h3>
            <p className="mb-6 text-gray-600">
              You need to have management permissions in a Discord server to use
              Euno.
            </p>
            <a
              href="https://discord.com/channels/@me"
              className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Discord
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
