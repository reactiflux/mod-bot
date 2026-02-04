import { Routes, type APIGuild } from "discord-api-types/v10";
import { data, Link, useFetcher, useSearchParams } from "react-router";

import { Page } from "#~/basics/page.js";
import { ssrDiscordSdk } from "#~/discord/api.js";
import { log } from "#~/helpers/observability";
import { requireUser } from "#~/models/session.server";
import { StripeService } from "#~/models/stripe.server";
import { SubscriptionService } from "#~/models/subscriptions.server";

import type { Route } from "./+types/admin";
import type { loader as guildDetailLoader } from "./admin.$guildId";

async function requireAdmin(request: Request) {
  const user = await requireUser(request);
  if (!user.email?.endsWith("@reactiflux.com")) {
    throw data({ message: "Forbidden" }, { status: 403 });
  }
  return user;
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);

  const url = new URL(request.url);
  const expandedGuildIds = url.searchParams.getAll("guildId[]");

  // Fetch bot guilds and all subscriptions in parallel
  const [rawBotGuilds, subscriptions] = await Promise.all([
    ssrDiscordSdk.get(Routes.userGuilds()) as Promise<APIGuild[]>,
    SubscriptionService.getAllSubscriptions(),
  ]);

  const subscriptionsByGuildId = new Map(
    subscriptions.map((s) => [s.guild_id, s]),
  );

  const guilds = rawBotGuilds.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon ?? null,
    subscription: subscriptionsByGuildId.get(g.id) ?? null,
  }));

  // Sort: subscribed guilds first, then by name
  guilds.sort((a, b) => {
    const aHasSub = a.subscription ? 1 : 0;
    const bHasSub = b.subscription ? 1 : 0;
    if (aHasSub !== bHasSub) return bHasSub - aHasSub;
    return a.name.localeCompare(b.name);
  });

  // For expanded guilds, fetch Stripe details
  const expandedDetails: Record<
    string,
    {
      paymentMethods: Awaited<
        ReturnType<typeof StripeService.listPaymentMethods>
      >;
      invoices: Awaited<ReturnType<typeof StripeService.listInvoices>>;
    }
  > = {};

  for (const guildId of expandedGuildIds) {
    const sub = subscriptionsByGuildId.get(guildId);
    if (sub?.stripe_customer_id) {
      const [paymentMethods, invoices] = await Promise.all([
        StripeService.listPaymentMethods(sub.stripe_customer_id),
        StripeService.listInvoices(sub.stripe_customer_id),
      ]);
      expandedDetails[guildId] = { paymentMethods, invoices };
    }
  }

  log("info", "admin", "Admin page accessed", {
    guildCount: guilds.length,
    expandedCount: expandedGuildIds.length,
  });

  return { guilds, expandedGuildIds, expandedDetails };
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier || tier === "free") {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-600 px-2.5 py-0.5 text-xs font-medium text-gray-200">
        Free
      </span>
    );
  }
  if (tier === "paid") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-800 px-2.5 py-0.5 text-xs font-medium text-emerald-200">
        Paid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-teal-800 px-2.5 py-0.5 text-xs font-medium text-teal-200">
      Custom
    </span>
  );
}

function StatusDot({ status }: { status: string | null }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-green-400">
        <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
        Active
      </span>
    );
  }
  if (status && status !== "active") {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-rose-400">
        <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm text-gray-500">
      <span className="inline-block h-2 w-2 rounded-full bg-gray-500" />
      No subscription
    </span>
  );
}

function tierAmount(tier: string | null) {
  if (tier === "paid") return "$100/yr";
  if (tier === "custom") return "Custom";
  return "$0";
}

function GuildIcon({
  guildId,
  icon,
  name,
}: {
  guildId: string;
  icon: string | null;
  name: string;
}) {
  if (icon) {
    return (
      <img
        src={`https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=32`}
        alt=""
        className="h-8 w-8 rounded-full"
      />
    );
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-600 text-xs font-medium text-gray-300">
      {name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()}
    </div>
  );
}

function StripeDetails({
  guildId,
  serverData,
  fetcherData,
}: {
  guildId: string;
  serverData?: {
    paymentMethods: Awaited<
      ReturnType<typeof StripeService.listPaymentMethods>
    >;
    invoices: Awaited<ReturnType<typeof StripeService.listInvoices>>;
  };
  fetcherData?: Awaited<ReturnType<typeof guildDetailLoader>> | undefined;
}) {
  const paymentMethods =
    serverData?.paymentMethods ?? fetcherData?.paymentMethods ?? [];
  const invoices = serverData?.invoices ?? fetcherData?.invoices ?? [];
  const stripeCustomerUrl = fetcherData?.stripeCustomerUrl ?? null;
  const stripeSubscriptionUrl = fetcherData?.stripeSubscriptionUrl ?? null;

  return (
    <div className="space-y-4 border-t border-gray-600 pt-4">
      {(stripeCustomerUrl ?? stripeSubscriptionUrl) && (
        <div className="flex gap-4">
          {stripeCustomerUrl && (
            <a
              href={stripeCustomerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300"
            >
              Stripe Customer
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
          )}
          {stripeSubscriptionUrl && (
            <a
              href={stripeSubscriptionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300"
            >
              Stripe Subscription
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
          )}
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-medium text-gray-300">
          Payment Methods
        </h4>
        {paymentMethods.length === 0 ? (
          <p className="text-sm text-gray-500">No payment methods on file</p>
        ) : (
          <ul className="space-y-1">
            {paymentMethods.map((pm) => (
              <li key={pm.id} className="text-sm text-gray-400">
                {pm.type === "card" && pm.card
                  ? `${pm.card.brand?.toUpperCase()} ****${pm.card.last4} (exp ${pm.card.exp_month}/${pm.card.exp_year})`
                  : pm.type}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-sm font-medium text-gray-300">
          Recent Invoices
        </h4>
        {invoices.length === 0 ? (
          <p className="text-sm text-gray-500">No invoices</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-600 text-left text-gray-400">
                <th className="pb-1 pr-4 font-medium">Date</th>
                <th className="pb-1 pr-4 font-medium">Amount</th>
                <th className="pb-1 pr-4 font-medium">Status</th>
                <th className="pb-1 font-medium">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-700">
                  <td className="py-1 pr-4 text-gray-400">
                    {inv.created
                      ? new Date(inv.created * 1000).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="py-1 pr-4 text-gray-300">
                    {inv.amount_due != null
                      ? `$${(inv.amount_due / 100).toFixed(2)}`
                      : "-"}
                  </td>
                  <td className="py-1 pr-4">
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
                  <td className="py-1">
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
      </div>

      <div className="pt-1">
        <Link
          to={`/app/admin/${guildId}`}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          View full details &rarr;
        </Link>
      </div>
    </div>
  );
}

function GuildRow({
  guild,
  isExpanded,
  expandedDetail,
}: {
  guild: {
    id: string;
    name: string;
    icon: string | null;
    subscription: {
      guild_id: string | null;
      product_tier: string;
      status: string;
      current_period_end: string | null;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
    } | null;
  };
  isExpanded: boolean;
  expandedDetail?: {
    paymentMethods: Awaited<
      ReturnType<typeof StripeService.listPaymentMethods>
    >;
    invoices: Awaited<ReturnType<typeof StripeService.listInvoices>>;
  };
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<typeof guildDetailLoader>();

  const handleToggle = (e: { currentTarget: HTMLDetailsElement }) => {
    const open = e.currentTarget.open;
    const current = searchParams.getAll("guildId[]");

    if (open) {
      if (!current.includes(guild.id)) {
        const next = new URLSearchParams(searchParams);
        next.append("guildId[]", guild.id);
        setSearchParams(next, { replace: true });
      }
      // Lazy-load detail data if we don't already have it from the server
      if (!expandedDetail && fetcher.state === "idle" && !fetcher.data) {
        void fetcher.load(`/app/admin/${guild.id}`);
      }
    } else {
      const next = new URLSearchParams();
      for (const [key, val] of searchParams.entries()) {
        if (key === "guildId[]" && val === guild.id) continue;
        next.append(key, val);
      }
      setSearchParams(next, { replace: true });
    }
  };

  const sub = guild.subscription;
  const tier = sub?.product_tier ?? null;
  const status = sub?.status ?? null;

  return (
    <details
      open={isExpanded}
      onToggle={handleToggle}
      className="rounded-md border border-gray-600 bg-gray-800"
    >
      <summary className="flex cursor-pointer items-center gap-4 px-4 py-3">
        <GuildIcon guildId={guild.id} icon={guild.icon} name={guild.name} />
        <div className="flex-1">
          <span className="font-medium text-gray-200">{guild.name}</span>
        </div>
        <TierBadge tier={tier} />
        <StatusDot status={status} />
        <span className="text-sm text-gray-400">
          {sub?.current_period_end
            ? `Next: ${new Date(sub.current_period_end).toLocaleDateString()}`
            : ""}
        </span>
        <span className="text-sm font-medium text-gray-300">
          {tierAmount(tier)}
        </span>
      </summary>

      <div className="px-4 pb-4">
        {expandedDetail ? (
          <StripeDetails guildId={guild.id} serverData={expandedDetail} />
        ) : fetcher.data ? (
          <StripeDetails guildId={guild.id} fetcherData={fetcher.data} />
        ) : fetcher.state === "loading" ? (
          <p className="py-2 text-sm text-gray-500">Loading details...</p>
        ) : sub?.stripe_customer_id ? (
          <p className="py-2 text-sm text-gray-500">Loading details...</p>
        ) : (
          <p className="py-2 text-sm text-gray-500">
            No Stripe customer linked
          </p>
        )}
      </div>
    </details>
  );
}

export default function Admin({
  loaderData: { guilds, expandedGuildIds, expandedDetails },
}: Route.ComponentProps) {
  return (
    <Page>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-200">
            Guild Subscriptions
          </h1>
          <span className="text-sm text-gray-400">
            {guilds.length} guild{guilds.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="space-y-2">
          {guilds.map((guild) => (
            <GuildRow
              key={guild.id}
              guild={guild}
              isExpanded={expandedGuildIds.includes(guild.id)}
              expandedDetail={expandedDetails[guild.id]}
            />
          ))}
          {guilds.length === 0 && (
            <p className="py-8 text-center text-gray-500">
              No guilds found. The bot may not be installed in any servers.
            </p>
          )}
        </div>
      </div>
    </Page>
  );
}
