import { useReducer } from "react";
import { data, useNavigation, useSubmit } from "react-router";

import { Page } from "#~/basics/page.js";
import {
  fetchGuildData,
  fetchMissingBotPermissions,
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

  // Fetch guild data and bot permissions in parallel
  const [{ roles, channels }, missingPermissions] = await Promise.all([
    fetchGuildData(guildId),
    fetchMissingBotPermissions(guildId),
  ]);

  return {
    guildId,
    subscription,
    tier,
    roles,
    channels,
    missingPermissions,
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

// --- Wizard types & reducer ---

interface WizardData {
  moderator_role: string;
  restricted_role: string;
  mod_log_channel: string;
  deletion_log_channel: string;
  ticket_channel: string;
  honeypot_channel: string;
}

interface WizardState {
  step: number;
  data: WizardData;
}

type WizardAction =
  | { type: "next" }
  | { type: "back" }
  | { type: "update"; fields: Partial<WizardData> }
  | { type: "goto"; step: number };

const TOTAL_STEPS = 5;

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "next":
      return { ...state, step: Math.min(state.step + 1, TOTAL_STEPS - 1) };
    case "back":
      return { ...state, step: Math.max(state.step - 1, 0) };
    case "update":
      return { ...state, data: { ...state.data, ...action.fields } };
    case "goto":
      return {
        ...state,
        step: Math.max(0, Math.min(action.step, TOTAL_STEPS - 1)),
      };
  }
}

const STEPS = [
  { label: "Welcome", validate: () => true },
  {
    label: "Roles",
    validate: (d: WizardData) => d.moderator_role !== "",
  },
  { label: "Logs", validate: () => true },
  { label: "Tickets", validate: () => true },
  { label: "Anti-spam", validate: () => true },
];

// --- Shared form styling ---

const selectClass =
  "block w-full appearance-none rounded-lg border border-stone-600 bg-surface-base px-3 py-2.5 text-sm text-stone-200 shadow-sm transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none";

function ChannelSelect({
  id,
  name,
  label,
  description,
  channels,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  description: string;
  channels: ProcessedChannel[];
  value?: string;
  onChange?: (value: string) => void;
}) {
  const selectProps = onChange
    ? {
        value: value ?? CREATE_NEW,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
          onChange(e.target.value),
      }
    : { defaultValue: CREATE_NEW };

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-stone-300">
        {label}
      </label>
      <select
        id={id}
        name={name}
        required
        className={selectClass}
        {...selectProps}
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
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  description: string;
  roles: GuildRole[];
  required?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const selectProps = onChange
    ? {
        value: value ?? "",
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
          onChange(e.target.value),
      }
    : { defaultValue: "" };

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
        className={selectClass}
        {...selectProps}
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

// --- Step indicator ---

function StepIndicator({
  currentStep,
  completedUpTo,
  onGoto,
}: {
  currentStep: number;
  completedUpTo: number;
  onGoto: (step: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {STEPS.map((s, i) => {
          const isCompleted = i < completedUpTo;
          const isCurrent = i === currentStep;
          const isClickable = i <= completedUpTo && i !== currentStep;

          return (
            <div key={i} className="flex flex-1 items-center">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onGoto(i)}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  isCompleted
                    ? "cursor-pointer bg-amber-600 text-white hover:bg-amber-500"
                    : isCurrent
                      ? "bg-transparent text-amber-400 ring-2 ring-amber-500"
                      : "cursor-default border border-stone-600 bg-transparent text-stone-500"
                }`}
                aria-label={`Step ${i + 1}: ${s.label}`}
              >
                {isCompleted ? (
                  <svg
                    className="h-4 w-4"
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
                ) : (
                  i + 1
                )}
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-2 h-px flex-1 ${
                    i < completedUpTo ? "bg-amber-600" : "bg-stone-700"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-center text-xs text-stone-500">
        Step {currentStep + 1} of {TOTAL_STEPS} &mdash;{" "}
        {STEPS[currentStep].label}
      </p>
    </div>
  );
}

// --- Wizard navigation ---

function WizardNavigation({
  step,
  canAdvance,
  isSubmitting,
  onBack,
  onNext,
  onSubmit,
}: {
  step: number;
  canAdvance: boolean;
  isSubmitting: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  const isLastStep = step === TOTAL_STEPS - 1;

  return (
    <div className="flex items-center justify-between pt-2">
      <div>
        {step > 0 && (
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="rounded-lg border border-stone-600 px-4 py-2.5 text-sm font-medium text-stone-300 transition-colors hover:bg-stone-800 hover:text-stone-100 disabled:opacity-50"
          >
            Back
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={isLastStep ? onSubmit : onNext}
        disabled={!canAdvance || isSubmitting}
        className="bg-accent-strong rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-500 focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-stone-900 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting
          ? "Setting up..."
          : isLastStep
            ? "Complete Setup"
            : "Continue"}
      </button>
    </div>
  );
}

// --- Step content components ---

function StepIntro() {
  return (
    <section className="space-y-4 rounded-xl border border-stone-700/60 bg-stone-800/60 p-5">
      <h3 className="font-serif text-lg font-semibold text-stone-100">
        Welcome to Euno Setup
      </h3>
      <p className="text-sm leading-relaxed text-stone-400">
        This wizard will walk you through configuring Euno for your server.
        We'll set up the roles and channels your moderation team needs — most
        channels can be created automatically.
      </p>
      <div className="space-y-2 text-sm text-stone-400">
        <p className="font-medium text-stone-300">
          Here's what we'll configure:
        </p>
        <ul className="list-inside list-disc space-y-1 text-stone-400">
          <li>
            <span className="text-stone-300">Roles</span> — who can use
            moderation commands
          </li>
          <li>
            <span className="text-stone-300">Log channels</span> — where
            moderation actions and deletions are recorded
          </li>
          <li>
            <span className="text-stone-300">Ticket channel</span> — where
            members can privately contact mods
          </li>
          <li>
            <span className="text-stone-300">Anti-spam</span> — a honeypot
            channel to catch bots
          </li>
        </ul>
      </div>
      <p className="text-xs text-stone-500">
        Takes about a minute. You can go back to change any step before
        finishing.
      </p>
    </section>
  );
}

function StepRoles({
  roles,
  wizardData,
  onUpdate,
}: {
  roles: GuildRole[];
  wizardData: WizardData;
  onUpdate: (fields: Partial<WizardData>) => void;
}) {
  return (
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
        value={wizardData.moderator_role}
        onChange={(v) => onUpdate({ moderator_role: v })}
      />

      <RoleSelect
        id="restricted_role"
        name="restricted_role"
        label="Restricted Role"
        description="Applied during timeouts to limit channel access. Optional."
        roles={roles}
        value={wizardData.restricted_role}
        onChange={(v) => onUpdate({ restricted_role: v })}
      />
    </section>
  );
}

function StepLogs({
  channels,
  wizardData,
  onUpdate,
}: {
  channels: ProcessedChannel[];
  wizardData: WizardData;
  onUpdate: (fields: Partial<WizardData>) => void;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-stone-700/60 bg-stone-800/60 p-5">
      <div>
        <h3 className="font-serif text-xs font-semibold tracking-widest text-stone-500 uppercase">
          Log Channels
        </h3>
        <p className="mt-1 text-xs text-stone-500">
          These channels are placed in a private{" "}
          <span className="text-stone-400">Euno Logs</span> category, visible
          only to moderators and the bot.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ChannelSelect
          id="mod_log_channel"
          name="mod_log_channel"
          label="Mod Log"
          description="Moderation reports and actions."
          channels={channels}
          value={wizardData.mod_log_channel}
          onChange={(v) => onUpdate({ mod_log_channel: v })}
        />

        <ChannelSelect
          id="deletion_log_channel"
          name="deletion_log_channel"
          label="Deletion Log"
          description="Deleted message captures."
          channels={channels}
          value={wizardData.deletion_log_channel}
          onChange={(v) => onUpdate({ deletion_log_channel: v })}
        />
      </div>
    </section>
  );
}

function StepTickets({
  channels,
  wizardData,
  onUpdate,
}: {
  channels: ProcessedChannel[];
  wizardData: WizardData;
  onUpdate: (fields: Partial<WizardData>) => void;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-stone-700/60 bg-stone-800/60 p-5">
      <h3 className="font-serif text-xs font-semibold tracking-widest text-stone-500 uppercase">
        Ticket Channel
      </h3>

      <ChannelSelect
        id="ticket_channel"
        name="ticket_channel"
        label="Tickets"
        description="Members open private mod tickets here."
        channels={channels}
        value={wizardData.ticket_channel}
        onChange={(v) => onUpdate({ ticket_channel: v })}
      />
    </section>
  );
}

function StepAntispam({
  channels,
  wizardData,
  onUpdate,
}: {
  channels: ProcessedChannel[];
  wizardData: WizardData;
  onUpdate: (fields: Partial<WizardData>) => void;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-stone-700/60 bg-stone-800/60 p-5">
      <h3 className="font-serif text-xs font-semibold tracking-widest text-stone-500 uppercase">
        Anti-Spam
      </h3>

      <ChannelSelect
        id="honeypot_channel"
        name="honeypot_channel"
        label="Honeypot"
        description="Trap channel to catch spam bots. Bots that post here are automatically banned."
        channels={channels}
        value={wizardData.honeypot_channel}
        onChange={(v) => onUpdate({ honeypot_channel: v })}
      />
    </section>
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

const initialData: WizardData = {
  moderator_role: "",
  restricted_role: "",
  mod_log_channel: CREATE_NEW,
  deletion_log_channel: CREATE_NEW,
  ticket_channel: CREATE_NEW,
  honeypot_channel: CREATE_NEW,
};

export default function Onboard({
  loaderData: { guildId, roles, channels, missingPermissions },
  actionData,
}: Route.ComponentProps) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [state, dispatch] = useReducer(wizardReducer, {
    step: 0,
    data: initialData,
  });

  if (actionData?.success) {
    return (
      <Page>
        <SuccessView result={actionData.result} />
      </Page>
    );
  }

  const { step, data: wizardData } = state;
  const hasMissingPermissions = missingPermissions.length > 0;
  const isLastStep = step === TOTAL_STEPS - 1;
  const canAdvance =
    STEPS[step].validate(wizardData) && !(isLastStep && hasMissingPermissions);

  // Track the highest step reached for the indicator
  // (completedUpTo = current step means steps 0..step-1 are done)
  const completedUpTo = step;

  const handleUpdate = (fields: Partial<WizardData>) =>
    dispatch({ type: "update", fields });

  const handleSubmit = () => {
    const formData = new FormData();
    formData.set("guild_id", guildId);
    formData.set("moderator_role", wizardData.moderator_role);
    formData.set("restricted_role", wizardData.restricted_role);
    formData.set("mod_log_channel", wizardData.mod_log_channel);
    formData.set("deletion_log_channel", wizardData.deletion_log_channel);
    formData.set("ticket_channel", wizardData.ticket_channel);
    formData.set("honeypot_channel", wizardData.honeypot_channel);
    void submit(formData, { method: "post" });
  };

  const stepContent = [
    <StepIntro key={0} />,
    <StepRoles
      key={1}
      roles={roles}
      wizardData={wizardData}
      onUpdate={handleUpdate}
    />,
    <StepLogs
      key={2}
      channels={channels}
      wizardData={wizardData}
      onUpdate={handleUpdate}
    />,
    <StepTickets
      key={3}
      channels={channels}
      wizardData={wizardData}
      onUpdate={handleUpdate}
    />,
    <StepAntispam
      key={4}
      channels={channels}
      wizardData={wizardData}
      onUpdate={handleUpdate}
    />,
  ];

  return (
    <Page>
      <div className="space-y-2">
        <h2 className="font-serif text-2xl font-bold text-stone-100">
          Set up Euno for your server
        </h2>
        <p className="text-sm text-stone-400">
          Follow the steps below to configure your moderation tools.
        </p>
      </div>

      <StepIndicator
        currentStep={step}
        completedUpTo={completedUpTo}
        onGoto={(s) => dispatch({ type: "goto", step: s })}
      />

      {(roles.length === 0 || channels.length === 0) && (
        <div className="rounded-xl border border-amber-600/30 bg-amber-950 p-4 text-sm text-amber-300">
          We couldn't fetch your server's roles or channels. Make sure Euno has
          proper permissions in your server.
        </div>
      )}

      {hasMissingPermissions && (
        <div className="rounded-xl border border-rose-600/30 bg-rose-950 p-4 text-sm text-rose-300">
          <p className="font-medium text-rose-200">
            Euno is missing required permissions
          </p>
          <ul className="mt-2 list-inside list-disc space-y-0.5">
            {missingPermissions.map((perm) => (
              <li key={perm}>{perm}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-rose-400">
            Update the bot's role in your server settings, then refresh this
            page.
          </p>
        </div>
      )}

      <div key={step} className="animate-wizard-fade-in">
        {stepContent[step]}
      </div>

      <WizardNavigation
        step={step}
        canAdvance={canAdvance}
        isSubmitting={isSubmitting}
        onBack={() => dispatch({ type: "back" })}
        onNext={() => dispatch({ type: "next" })}
        onSubmit={handleSubmit}
      />
    </Page>
  );
}
