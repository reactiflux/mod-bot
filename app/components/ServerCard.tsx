import { Link } from "react-router";

import { Sparkline } from "#~/components/Sparkline";

interface ServerCardProps {
  id: string;
  name: string;
  icon: string | null;
  tier: "free" | "paid" | "custom";
  openEscalations: number;
  reportCount: number;
  actionCount: number;
  sparkline: number[];
}

const tierBadge: Record<string, { label: string; className: string }> = {
  free: {
    label: "Free",
    className: "bg-stone-700 text-stone-300",
  },
  paid: {
    label: "Pro",
    className: "bg-amber-500/20 text-amber-400",
  },
  custom: {
    label: "Custom",
    className: "bg-purple-500/20 text-purple-400",
  },
};

export function ServerCard({
  id,
  name,
  icon,
  tier,
  openEscalations,
  reportCount,
  actionCount,
  sparkline,
}: ServerCardProps) {
  const badge = tierBadge[tier] ?? tierBadge.free;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-stone-700/60 bg-stone-800/60 p-5">
      {/* Header: icon + name + tier */}
      <div className="flex items-center gap-3">
        {icon ? (
          <img
            src={`https://cdn.discordapp.com/icons/${id}/${icon}.png?size=64`}
            alt={name}
            className="h-10 w-10 rounded-xl"
          />
        ) : (
          <div className="bg-surface-overlay flex h-10 w-10 items-center justify-center rounded-xl text-stone-100">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <h3 className="min-w-0 flex-1 truncate font-serif text-lg font-semibold text-stone-100">
          {name}
        </h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      {/* Escalations */}
      {openEscalations > 0 ? (
        <p className="text-sm font-medium text-amber-400">
          {openEscalations} pending escalation
          {openEscalations !== 1 && "s"}
        </p>
      ) : (
        <p className="text-sm text-stone-500">No pending actions</p>
      )}

      {/* Sparkline */}
      <div>
        <Sparkline data={sparkline} />
        <p className="mt-1 text-xs text-stone-500">Reports — last 30 days</p>
      </div>

      {/* Counts */}
      <div className="flex gap-6 text-sm text-stone-400">
        <span>
          <span className="font-medium text-stone-200">{reportCount}</span>{" "}
          reports
        </span>
        <span>
          <span className="font-medium text-stone-200">{actionCount}</span>{" "}
          actions
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 border-t border-stone-700/40 pt-3">
        <Link
          to={`/app/${id}/settings`}
          className="text-sm font-medium text-stone-400 transition-colors hover:text-stone-100"
        >
          Settings
        </Link>
        {tier === "free" && (
          <Link
            to={`/app/${id}/settings/subscription`}
            className="text-sm font-medium text-amber-500 transition-colors hover:text-amber-400"
          >
            Upgrade
          </Link>
        )}
      </div>
    </div>
  );
}
