import { data, Link } from "react-router";

import { GuildSettingsForm } from "#~/components/GuildSettingsForm";
import { fetchGuildData, type GuildData } from "#~/helpers/guildData.server";
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
  const [currentSettings, tier, subscription, { roles, channels }] =
    await Promise.all([
      fetchSettings(guildId, [
        SETTINGS.modLog,
        SETTINGS.moderator,
        SETTINGS.restricted,
      ]).catch(() => undefined),
      SubscriptionService.getProductTier(guildId),
      SubscriptionService.getGuildSubscription(guildId),
      fetchGuildData(guildId).catch(
        () =>
          ({
            roles: [],
            channels: [],
          }) as GuildData,
      ),
    ]);

  return {
    guildId,
    tier,
    subscription,
    roles,
    channels,
    currentSettings,
  };
}

export default function Settings({
  loaderData: { guildId, roles, channels, currentSettings, tier, subscription },
}: Route.ComponentProps) {
  return (
    <div className="space-y-8">
      {/* Subscription Status */}
      {subscription ? (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-base font-semibold leading-6 text-gray-900">
              Subscription Status
            </h3>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Current Plan</span>
                <span className="text-sm font-medium text-gray-900">
                  {tier === "paid" ? "Pro" : "Free"}{" "}
                  {subscription.status === "active" && tier === "paid" && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      Active
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Settings Form */}
      {currentSettings ? (
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
      ) : (
        <>
          You haven’t finished setting the bot up for this server yet!{" "}
          <Link
            className="text-indigo-400 underline"
            to={`/app/${guildId}/onboard`}
          >
            Finish onboarding
          </Link>{" "}
          first.
        </>
      )}
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
