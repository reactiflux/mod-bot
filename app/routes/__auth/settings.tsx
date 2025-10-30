import { data } from "react-router";

import { GuildSettingsForm } from "#~/components/GuildSettingsForm";
import { Upgrade } from "#~/components/Upgrade.js";
import { fetchGuildData } from "#~/helpers/guildData.server";
import { log, trackPerformance } from "#~/helpers/observability";
import { fetchSettings, setSettings, SETTINGS } from "#~/models/guilds.server";
import { requireUser } from "#~/models/session.server";
import { SubscriptionService } from "#~/models/subscriptions.server.js";

import type { Route } from "./+types/settings";

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireUser(request);
  const { guildId } = params;

  if (!guildId) {
    throw data({ message: "Guild ID is required" }, { status: 400 });
  }

  log("info", "settings", "Settings page accessed", { guildId });

  // Fetch current guild settings
  const currentSettings = await trackPerformance("guilds.fetchSettings", () =>
    fetchSettings(guildId, [
      SETTINGS.modLog,
      SETTINGS.moderator,
      SETTINGS.restricted,
    ]),
  );

  const tier = await trackPerformance("subscriptions.getProductTier", () =>
    SubscriptionService.getProductTier(guildId),
  );

  const { roles, channels } = await fetchGuildData(guildId);

  return {
    guildId,
    tier,
    roles,
    channels,
    currentSettings,
  };
}

export default function Settings({
  loaderData: { guildId, roles, channels, currentSettings, tier },
}: Route.ComponentProps) {
  return (
    <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div className="space-y-8">
        <div className="bg-white px-4 py-8 shadow sm:rounded-lg sm:px-10">
          <GuildSettingsForm
            guildId={guildId}
            roles={roles}
            channels={channels}
            buttonText="Save Settings"
            defaultValues={{
              moderatorRole: currentSettings.moderator,
              modLogChannel: currentSettings.modLog,
              restrictedRole: currentSettings.restricted,
            }}
          />
        </div>
        {tier === "free" && <Upgrade guildId={guildId} />}
      </div>
    </div>
  );
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
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

  log("info", "settings", "Settings form submitted", {
    guildId,
    modLogChannel,
    moderatorRole,
    hasRestrictedRole: !!restrictedRole,
  });

  try {
    await trackPerformance("guilds.setSettings", () =>
      setSettings(guildId, {
        [SETTINGS.modLog]: modLogChannel,
        [SETTINGS.moderator]: moderatorRole,
        [SETTINGS.restricted]: restrictedRole || undefined,
      }),
    );

    log("info", "settings", "Settings updated successfully", {
      guildId,
      settings: {
        modLog: modLogChannel,
        moderator: moderatorRole,
        restricted: restrictedRole || null,
      },
    });

    return data({ success: true });
  } catch (error) {
    log("error", "settings", "Settings update failed", { guildId, error });
    throw data(
      { message: "Failed to update settings. Please try again." },
      { status: 500 },
    );
  }
}
