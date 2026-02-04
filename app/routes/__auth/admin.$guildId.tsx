import { Routes, type APIGuild } from "discord-api-types/v10";
import { data, Link } from "react-router";

import { posthogClient } from "#~/AppRuntime";
import { Page } from "#~/basics/page.js";
import { ssrDiscordSdk } from "#~/discord/api.js";
import { log } from "#~/helpers/observability";
import { requireUser } from "#~/models/session.server";
import { StripeService } from "#~/models/stripe.server";
import { SubscriptionService } from "#~/models/subscriptions.server";

import type { Route } from "./+types/admin.$guildId";

async function requireAdmin(request: Request) {
  const user = await requireUser(request);
  if (!user.email?.endsWith("@reactiflux.com")) {
    throw data({ message: "Forbidden" }, { status: 403 });
  }
  return user;
}

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const { guildId } = params;

  const subscription = await SubscriptionService.getGuildSubscription(guildId);

  // Fetch guild info from Discord
  let guildInfo: { name: string; icon: string | null } = {
    name: guildId,
    icon: null,
  };
  try {
    const guild = (await ssrDiscordSdk.get(Routes.guild(guildId))) as APIGuild;
    guildInfo = { name: guild.name, icon: guild.icon ?? null };
  } catch (e) {
    log("warn", "admin", "Failed to fetch guild info from Discord", {
      guildId,
      error: e,
    });
  }

  const featureFlags: Record<string, string | boolean> | null = posthogClient
    ? ((await posthogClient.getAllFlags(guildId, {
        onlyEvaluateLocally: true,
      })) as Record<string, string | boolean>)
    : null;

  let paymentMethods: Awaited<
    ReturnType<typeof StripeService.listPaymentMethods>
  > = [];
  let invoices: Awaited<ReturnType<typeof StripeService.listInvoices>> = [];
  let stripeCustomerUrl: string | null = null;
  let stripeSubscriptionUrl: string | null = null;

  if (subscription?.stripe_customer_id) {
    [paymentMethods, invoices] = await Promise.all([
      StripeService.listPaymentMethods(subscription.stripe_customer_id),
      StripeService.listInvoices(subscription.stripe_customer_id),
    ]);
    stripeCustomerUrl = `https://dashboard.stripe.com/customers/${subscription.stripe_customer_id}`;
  }

  if (subscription?.stripe_subscription_id) {
    stripeSubscriptionUrl = `https://dashboard.stripe.com/subscriptions/${subscription.stripe_subscription_id}`;
  }

  log("info", "admin", "Guild detail page accessed", {
    guildId,
    hasSubscription: !!subscription,
    hasStripeCustomer: !!subscription?.stripe_customer_id,
  });

  return {
    guildId,
    guildInfo,
    subscription,
    paymentMethods,
    invoices,
    stripeCustomerUrl,
    stripeSubscriptionUrl,
    featureFlags,
  };
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
    >
      {children}
      <svg
        className="h-3 w-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
    </a>
  );
}

export function FeatureFlagsSection({
  featureFlags,
  compact,
}: {
  featureFlags: Record<string, string | boolean> | null;
  compact?: boolean;
}) {
  const Heading = compact ? "h4" : "h2";
  const headingClass = compact
    ? "mb-2 text-sm font-medium text-gray-300"
    : "text-lg font-semibold text-gray-200";
  const wrapperClass = compact
    ? ""
    : "space-y-3 rounded-md border border-gray-600 bg-gray-800 p-4";

  if (featureFlags === null) {
    return (
      <div className={wrapperClass}>
        <Heading className={headingClass}>Feature Flags</Heading>
        <p className="text-sm text-gray-500">PostHog not configured</p>
      </div>
    );
  }

  const entries = Object.entries(featureFlags);

  return (
    <div className={wrapperClass}>
      <Heading className={headingClass}>Feature Flags</Heading>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">No feature flags evaluated</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-600 text-left text-gray-400">
              <th className="pb-2 pr-4 font-medium">Flag</th>
              <th className="pb-2 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([name, value]) => (
              <tr key={name} className="border-b border-gray-700">
                <td className="py-2 pr-4 font-mono text-xs text-gray-300">
                  {name}
                </td>
                <td className="py-2">
                  {value === true ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-800 px-2.5 py-0.5 text-xs font-medium text-emerald-200">
                      Enabled
                    </span>
                  ) : value === false ? (
                    <span className="inline-flex items-center rounded-full bg-gray-600 px-2.5 py-0.5 text-xs font-medium text-gray-300">
                      Disabled
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-gray-400">
                      {value}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function AdminGuildDetail({
  loaderData: {
    guildId,
    guildInfo,
    subscription,
    paymentMethods,
    invoices,
    stripeCustomerUrl,
    stripeSubscriptionUrl,
    featureFlags,
  },
}: Route.ComponentProps) {
  const tier = subscription?.product_tier ?? "free";
  const status = subscription?.status ?? null;

  return (
    <Page>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            to="/app/admin"
            className="text-sm text-gray-400 hover:text-gray-300"
          >
            &larr; All Guilds
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {guildInfo.icon ? (
            <img
              src={`https://cdn.discordapp.com/icons/${guildId}/${guildInfo.icon}.png?size=64`}
              alt=""
              className="h-12 w-12 rounded-full"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-600 text-sm font-medium text-gray-300">
              {guildInfo.name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-200">
              {guildInfo.name}
            </h1>
            <p className="text-sm text-gray-500">ID: {guildId}</p>
          </div>
        </div>

        {/* Subscription Info */}
        <section className="space-y-3 rounded-md border border-gray-600 bg-gray-800 p-4">
          <h2 className="text-lg font-semibold text-gray-200">Subscription</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-gray-500">Tier</dt>
              <dd className="text-gray-200">
                {tier === "paid" ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-800 px-2.5 py-0.5 text-xs font-medium text-emerald-200">
                    Paid
                  </span>
                ) : tier === "custom" ? (
                  <span className="inline-flex items-center rounded-full bg-teal-800 px-2.5 py-0.5 text-xs font-medium text-teal-200">
                    Custom
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-gray-600 px-2.5 py-0.5 text-xs font-medium text-gray-200">
                    Free
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Status</dt>
              <dd>
                {status === "active" ? (
                  <span className="inline-flex items-center gap-1 text-green-400">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
                    Active
                  </span>
                ) : status ? (
                  <span className="inline-flex items-center gap-1 text-rose-400">
                    <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </span>
                ) : (
                  <span className="text-gray-500">None</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Amount</dt>
              <dd className="text-gray-200">
                {tier === "paid"
                  ? "$100/yr"
                  : tier === "custom"
                    ? "Custom"
                    : "$0"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Next Payment</dt>
              <dd className="text-gray-200">
                {subscription?.current_period_end
                  ? new Date(
                      subscription.current_period_end,
                    ).toLocaleDateString()
                  : "-"}
              </dd>
            </div>
          </dl>
          {subscription && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd className="text-gray-400">
                  {subscription.created_at
                    ? new Date(subscription.created_at).toLocaleString()
                    : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Updated</dt>
                <dd className="text-gray-400">
                  {subscription.updated_at
                    ? new Date(subscription.updated_at).toLocaleString()
                    : "-"}
                </dd>
              </div>
            </dl>
          )}
        </section>

        {/* Stripe Links */}
        {(stripeCustomerUrl ?? stripeSubscriptionUrl) && (
          <section className="space-y-3 rounded-md border border-gray-600 bg-gray-800 p-4">
            <h2 className="text-lg font-semibold text-gray-200">
              Stripe Dashboard
            </h2>
            <div className="flex gap-6">
              {stripeCustomerUrl && (
                <ExternalLink href={stripeCustomerUrl}>
                  Customer Page
                </ExternalLink>
              )}
              {stripeSubscriptionUrl && (
                <ExternalLink href={stripeSubscriptionUrl}>
                  Subscription Page
                </ExternalLink>
              )}
            </div>
          </section>
        )}

        {/* Payment Methods */}
        <section className="space-y-3 rounded-md border border-gray-600 bg-gray-800 p-4">
          <h2 className="text-lg font-semibold text-gray-200">
            Payment Methods
          </h2>
          {paymentMethods.length === 0 ? (
            <p className="text-sm text-gray-500">No payment methods on file</p>
          ) : (
            <ul className="space-y-2">
              {paymentMethods.map((pm) => (
                <li
                  key={pm.id}
                  className="flex items-center gap-3 text-sm text-gray-300"
                >
                  <span className="rounded bg-gray-700 px-2 py-0.5 font-mono text-xs text-gray-400">
                    {pm.type}
                  </span>
                  {pm.type === "card" && pm.card ? (
                    <span>
                      {pm.card.brand?.toUpperCase()} ****{pm.card.last4} (exp{" "}
                      {pm.card.exp_month}/{pm.card.exp_year})
                    </span>
                  ) : (
                    <span>{pm.type}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Invoices */}
        <section className="space-y-3 rounded-md border border-gray-600 bg-gray-800 p-4">
          <h2 className="text-lg font-semibold text-gray-200">Invoices</h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-gray-500">No invoices</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-600 text-left text-gray-400">
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium">Number</th>
                  <th className="pb-2 pr-4 font-medium">Amount</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-700">
                    <td className="py-2 pr-4 text-gray-400">
                      {inv.created
                        ? new Date(inv.created * 1000).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-gray-500">
                      {inv.number ?? "-"}
                    </td>
                    <td className="py-2 pr-4 text-gray-300">
                      {inv.amount_due != null
                        ? `$${(inv.amount_due / 100).toFixed(2)}`
                        : "-"}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          inv.status === "paid"
                            ? "text-green-400"
                            : "text-yellow-400"
                        }
                      >
                        {inv.status ?? "-"}
                      </span>
                    </td>
                    <td className="py-2">
                      {inv.hosted_invoice_url && (
                        <a
                          href={inv.hosted_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300"
                        >
                          View
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Feature Flags */}
        <FeatureFlagsSection featureFlags={featureFlags} />
      </div>
    </Page>
  );
}
