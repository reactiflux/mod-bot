import type { Route } from "./+types/onboard";
import { data, useLoaderData, Form } from "react-router";
import { requireUser } from "#~/models/session.server";
import { SubscriptionService } from "#~/models/subscriptions.server";
import { registerGuild, setSettings, SETTINGS } from "#~/models/guilds.server";

import { Routes } from "discord-api-types/v10";
import { rest } from "#~/discord/api.js";

export async function loader({ request }: Route.LoaderArgs) {
  const _user = await requireUser(request);
  const url = new URL(request.url);
  const guildId = url.searchParams.get("guild_id");

  if (!guildId) {
    throw data({ message: "Guild ID is required" }, { status: 400 });
  }

  // Get subscription info for the guild
  const subscription = await SubscriptionService.getGuildSubscription(guildId);
  const tier = await SubscriptionService.getProductTier(guildId);

  // Get Discord token and fetch guild data
  let roles: Array<{
    id: string;
    name: string;
    position: number;
    color: number;
  }> = [];
  let channels: Array<{
    id: string;
    name: string;
    position: number;
    type: number;
  }> = [];

  try {
    // Fetch guild roles and channels
    const [guildRoles, guildChannels] = await Promise.all([
      rest.get(Routes.guildRoles(guildId)) as Promise<
        Array<{ id: string; name: string; position: number; color: number }>
      >,
      rest.get(Routes.guildChannels(guildId)) as Promise<
        Array<{ id: string; name: string; position: number; type: number }>
      >,
    ]);

    roles = guildRoles
      .filter((role) => role.name !== "@everyone")
      .sort((a, b) => b.position - a.position);
    channels = guildChannels
      .filter((channel) => channel.type === 0)
      .sort((a, b) => a.position - b.position);
  } catch (error) {
    console.error("Error fetching guild data:", error);
    // Continue with empty arrays if Discord API fails
  }

  return {
    guildId,
    subscription,
    tier,
    roles,
    channels,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const _user = await requireUser(request);
  const formData = await request.formData();
  const guildId = formData.get("guild_id") as string;
  const modLogChannel = formData.get("mod_log_channel") as string;
  const moderatorRole = formData.get("moderator_role") as string;
  const restrictedRole = formData.get("restricted_role") as string;

  if (!guildId) {
    throw data({ message: "Guild ID is required" }, { status: 400 });
  }

  if (!modLogChannel || !moderatorRole) {
    throw data(
      { message: "Moderator role and log channel are required" },
      { status: 400 },
    );
  }

  // Register the guild and set up configuration
  const mockGuild = { id: guildId };
  await registerGuild(mockGuild as { id: string });

  await setSettings(mockGuild as { id: string }, {
    [SETTINGS.modLog]: modLogChannel,
    [SETTINGS.moderator]: moderatorRole,
    [SETTINGS.restricted]: restrictedRole || undefined,
  });

  return data({ success: true });
}

export default function Onboard() {
  const { guildId, tier, roles, channels } = useLoaderData<typeof loader>();

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-6 w-6 text-green-600"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Set up Euno for your server
          </h2>
          <p className="mt-2 text-lg text-gray-600">
            Configure the essential settings to get started
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white px-4 py-8 shadow sm:rounded-lg sm:px-10">
            <Form method="post" className="space-y-6">
              <input type="hidden" name="guild_id" value={guildId} />

              <div>
                <label
                  htmlFor="moderator_role"
                  className="block text-sm font-medium text-gray-700"
                >
                  Moderator Role <span className="text-red-500">*</span>
                </label>
                <div className="mt-1">
                  <select
                    id="moderator_role"
                    name="moderator_role"
                    required
                    className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="">Select a role...</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                        {role.color !== 0 && (
                          <span
                            style={{
                              color: `#${role.color.toString(16).padStart(6, "0")}`,
                            }}
                          >
                            {" "}
                            ●
                          </span>
                        )}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  The role that grants moderator permissions to users.
                </p>
              </div>

              <div>
                <label
                  htmlFor="mod_log_channel"
                  className="block text-sm font-medium text-gray-700"
                >
                  Mod Log Channel <span className="text-red-500">*</span>
                </label>
                <div className="mt-1">
                  <select
                    id="mod_log_channel"
                    name="mod_log_channel"
                    required
                    className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="">Select a channel...</option>
                    {channels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        #{channel.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  The channel where moderation reports will be sent.
                </p>
              </div>

              <div>
                <label
                  htmlFor="restricted_role"
                  className="block text-sm font-medium text-gray-700"
                >
                  Restricted Role (Optional)
                </label>
                <div className="mt-1">
                  <select
                    id="restricted_role"
                    name="restricted_role"
                    className="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="">Select a role...</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                        {role.color !== 0 && (
                          <span
                            style={{
                              color: `#${role.color.toString(16).padStart(6, "0")}`,
                            }}
                          >
                            {" "}
                            ●
                          </span>
                        )}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  A role that prevents members from accessing some channels
                  during timeouts.
                </p>
              </div>

              {(roles.length === 0 || channels.length === 0) && (
                <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
                  <div className="flex">
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">
                        Unable to load server data
                      </h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p>
                          We couldn't fetch your server's roles and channels.
                          Make sure Euno has proper permissions in your server.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <button
                  type="submit"
                  className="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Complete Setup
                </button>
              </div>
            </Form>
          </div>
        </div>

        {tier === "free" && (
          <div className="mt-8 text-center">
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Want more features?
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>
                      Upgrade to Pro for advanced analytics, unlimited tracking,
                      and priority support.
                    </p>
                    <div className="mt-3">
                      <a
                        href={`/upgrade?guild_id=${guildId}`}
                        className="inline-flex items-center rounded-md border border-transparent bg-yellow-600 px-3 py-2 text-sm font-medium text-white hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
                      >
                        Upgrade to Pro
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
