import { data, Form } from "react-router";

import { Page } from "#~/basics/page.js";
import {
  fetchGuildData,
  type GuildRole,
  type ProcessedChannel,
} from "#~/helpers/guildData.server";
import { log, trackPerformance } from "#~/helpers/observability";
import {
  CREATE_SENTINEL,
  setupAll,
  type SetupAllResult,
} from "#~/helpers/setupAll.server";
import { requireUser } from "#~/models/session.server";
import { SubscriptionService } from "#~/models/subscriptions.server";

import type { Route } from "./+types/onboard";

/** Must match CREATE_SENTINEL in setupAll.server.ts — duplicated to avoid importing server module into client */
const CREATE_NEW = "__create__";

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireUser(request);
  const { guildId } = params;

  if (!guildId) {
    throw data({ message: "Guild ID is required" }, { status: 400 });
  }

  log("info", "onboarding", "Onboarding page accessed", { guildId });

  // Get subscription info for the guild
  const subscription = await trackPerformance(
    "subscriptions.getGuildSubscription",
    () => SubscriptionService.getGuildSubscription(guildId),
  );
  const tier = await trackPerformance("subscriptions.getProductTier", () =>
    SubscriptionService.getProductTier(guildId),
  );

  // Fetch guild data using the reusable service
  const { roles, channels } = await fetchGuildData(guildId);

  return {
    guildId,
    subscription,
    tier,
    roles,
    channels,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const formData = await request.formData();
  const guildId = formData.get("guild_id") as string;
  const moderatorRole = formData.get("moderator_role") as string;
  const restrictedRole = formData.get("restricted_role") as string;
  const modLogChannel = formData.get("mod_log_channel") as string;
  const deletionLogChannel = formData.get("deletion_log_channel") as string;
  const honeypotChannel = formData.get("honeypot_channel") as string;
  const ticketChannel = formData.get("ticket_channel") as string;

  if (!guildId) {
    throw data({ message: "Guild ID is required" }, { status: 400 });
  }

  if (!moderatorRole) {
    throw data({ message: "Moderator role is required" }, { status: 400 });
  }

  log("info", "onboarding", "Onboarding form submitted", {
    guildId,
    moderatorRole,
    modLogChannel,
    deletionLogChannel,
    honeypotChannel,
    ticketChannel,
    hasRestrictedRole: !!restrictedRole,
  });

  try {
    const result = await trackPerformance("setupAll.web", () =>
      setupAll({
        guildId,
        moderatorRoleId: moderatorRole,
        restrictedRoleId: restrictedRole || undefined,
        modLogChannel: modLogChannel || CREATE_SENTINEL,
        deletionLogChannel: deletionLogChannel || CREATE_SENTINEL,
        honeypotChannel: honeypotChannel || CREATE_SENTINEL,
        ticketChannel: ticketChannel || CREATE_SENTINEL,
      }),
    );

    log("info", "onboarding", "Onboarding completed successfully", {
      guildId,
      created: result.created,
    });

    return data({ success: true as const, result });
  } catch (error) {
    log("error", "onboarding", "Onboarding failed", { guildId, error });
    throw data(
      { message: "Failed to complete onboarding. Please try again." },
      { status: 500 },
    );
  }
}

// --- Shared form styling ---

const selectClass =
  "block w-full appearance-none rounded-lg border border-stone-600 bg-surface-base px-3 py-2.5 text-sm text-stone-200 shadow-sm transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none";

function ChannelSelect({
  id,
  name,
  label,
  description,
  channels,
}: {
  id: string;
  name: string;
  label: string;
  description: string;
  channels: ProcessedChannel[];
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-stone-300">
        {label}
      </label>
      <select
        id={id}
        name={name}
        required
        defaultValue={CREATE_NEW}
        className={selectClass}
      >
        <option value={CREATE_NEW}>+ Create automatically</option>
        <optgroup label="Use existing channel">
          {channels.map((item) => {
            if (item.type === "channel") {
              return (
                <option key={item.data.id} value={item.data.id}>
                  #{item.data.name}
                </option>
              );
            } else if (
              item.type === "category" &&
              item.children &&
              item.children.length > 0
            ) {
              return item.children.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name} ({item.data.name})
                </option>
              ));
            }
            return null;
          })}
        </optgroup>
      </select>
      <p className="text-xs text-stone-500">{description}</p>
    </div>
  );
}

function RoleSelect({
  id,
  name,
  label,
  description,
  roles,
  required,
}: {
  id: string;
  name: string;
  label: string;
  description: string;
  roles: GuildRole[];
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-stone-300">
        {label}
        {required && <span className="text-rose-400"> *</span>}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue=""
        className={selectClass}
      >
        <option value="">Select a role...</option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
      <p className="text-xs text-stone-500">{description}</p>
    </div>
  );
}

// --- Success view ---

const resultItems: {
  label: string;
  createdName: string;
  channelName: string;
}[] = [
  { label: "Mod Log", createdName: "mod-log", channelName: "#mod-log" },
  {
    label: "Deletion Log",
    createdName: "deletion-log",
    channelName: "#deletion-log",
  },
  { label: "Honeypot", createdName: "honeypot", channelName: "#honeypot" },
  {
    label: "Tickets",
    createdName: "contact-mods",
    channelName: "#contact-mods",
  },
];

function SuccessView({ result }: { result: SetupAllResult }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="bg-success-subtle border-success/30 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border">
          <svg
            className="text-success h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>
        <div>
          <h2 className="font-serif text-2xl font-bold text-stone-100">
            Setup Complete
          </h2>
          <p className="text-sm text-stone-400">
            All channels and features have been configured.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {resultItems.map(({ label, createdName, channelName }) => {
          const wasCreated = result.created.includes(createdName);
          return (
            <div
              key={createdName}
              className="rounded-xl border border-stone-700/60 bg-stone-800/60 p-4"
            >
              <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">
                {label}
              </p>
              <p className="mt-1 font-medium text-stone-200">{channelName}</p>
              <span
                className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  wasCreated
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-stone-700 text-stone-400"
                }`}
              >
                {wasCreated ? "Created" : "Existing"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-stone-700/60 bg-stone-800/60 p-4 text-sm text-stone-400">
        Run{" "}
        <code className="rounded bg-stone-700 px-1.5 py-0.5 text-amber-400">
          /check-requirements
        </code>{" "}
        in Discord to verify everything is working.
      </div>
    </div>
  );
}

// --- Main component ---

export default function Onboard({
  loaderData: { guildId, roles, channels },
  actionData,
}: Route.ComponentProps) {
  if (actionData?.success) {
    return (
      <Page>
        <SuccessView result={actionData.result} />
      </Page>
    );
  }

  return (
    <Page>
      <div className="space-y-2">
        <h2 className="font-serif text-2xl font-bold text-stone-100">
          Set up Euno for your server
        </h2>
        <p className="text-sm text-stone-400">
          One form, one click. Channels are created automatically unless you
          pick an existing one.
        </p>
      </div>

      <Form method="post" className="space-y-6">
        <input type="hidden" name="guild_id" value={guildId} />

        {/* Roles section */}
        <section className="space-y-4 rounded-xl border border-stone-700/60 bg-stone-800/60 p-5">
          <h3 className="font-serif text-xs font-semibold tracking-widest text-stone-500 uppercase">
            Roles
          </h3>

          <RoleSelect
            id="moderator_role"
            name="moderator_role"
            label="Moderator Role"
            description="Members with this role can use moderation commands."
            roles={roles}
            required
          />

          <RoleSelect
            id="restricted_role"
            name="restricted_role"
            label="Restricted Role"
            description="Applied during timeouts to limit channel access. Optional."
            roles={roles}
          />
        </section>

        {/* Channels section */}
        <section className="space-y-4 rounded-xl border border-stone-700/60 bg-stone-800/60 p-5">
          <div>
            <h3 className="font-serif text-xs font-semibold tracking-widest text-stone-500 uppercase">
              Channels
            </h3>
            <p className="mt-1 text-xs text-stone-500">
              All channels will be created for you. Override any to use an
              existing channel instead.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ChannelSelect
              id="mod_log_channel"
              name="mod_log_channel"
              label="Mod Log"
              description="Moderation reports and actions."
              channels={channels}
            />

            <ChannelSelect
              id="deletion_log_channel"
              name="deletion_log_channel"
              label="Deletion Log"
              description="Deleted message captures."
              channels={channels}
            />

            <ChannelSelect
              id="honeypot_channel"
              name="honeypot_channel"
              label="Honeypot"
              description="Trap channel to catch spam bots."
              channels={channels}
            />

            <ChannelSelect
              id="ticket_channel"
              name="ticket_channel"
              label="Tickets"
              description="Members open private mod tickets here."
              channels={channels}
            />
          </div>

          <p className="text-xs text-stone-500">
            Mod Log and Deletion Log are placed in a private{" "}
            <span className="text-stone-400">Euno Logs</span> category, visible
            only to moderators and the bot.
          </p>
        </section>

        {(roles.length === 0 || channels.length === 0) && (
          <div className="rounded-xl border border-amber-600/30 bg-amber-950 p-4 text-sm text-amber-300">
            We couldn't fetch your server's roles or channels. Make sure Euno
            has proper permissions in your server.
          </div>
        )}

        <button
          type="submit"
          className="bg-accent-strong flex w-full justify-center rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-500 focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-stone-900 focus:outline-none"
        >
          Complete Setup
        </button>
      </Form>
    </Page>
  );
}
