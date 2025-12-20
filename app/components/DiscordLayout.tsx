import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";

import { Logout } from "#~/basics/logout";
import { useUser } from "#~/utils";

interface DiscordLayoutProps {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  guilds: {
    id: string;
    name: string;
    icon?: string;
    hasBot: boolean;
    authz: string[];
  }[];
  manageableGuilds: {
    id: string;
    name: string;
    icon?: string;
    hasBot: boolean;
    authz: string[];
  }[];
}

export function DiscordLayout({
  children,
  rightPanel,
  guilds,
}: DiscordLayoutProps) {
  const user = useUser();
  const location = useLocation();
  const [accountExpanded, setAccountExpanded] = useState(false);
  const { guildId } = useParams();

  // Filter to only show manageable guilds (where Euno is installed) in the server selector
  const manageableGuilds = guilds.filter((guild) => guild.hasBot);

  const isActive = (href: string, strict = false) => {
    const isExact = location.pathname === href;
    return strict
      ? isExact
      : isExact || location.pathname.startsWith(href + "/");
  };

  return (
    <div className="flex h-screen bg-gray-800 text-white">
      {/* Server Selector Column */}
      <div className="flex w-16 flex-col border-r border-gray-800 bg-gray-900">
        {/* Home/Euno Icon */}
        <div className="flex h-16 items-center justify-center border-b border-gray-800">
          <Link
            to="/app"
            className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-200 hover:rounded-xl ${
              isActive("/app", true)
                ? "rounded-xl bg-indigo-600"
                : "bg-gray-800 hover:bg-gray-600"
            }`}
          >
            E
          </Link>
        </div>

        {/* Server Icons */}
        <div className="flex-1 space-y-2 overflow-y-auto py-3">
          {manageableGuilds.map((guild) => (
            <div key={guild.id} className="flex justify-center">
              <Link
                to={`/app/${guild.id}/settings`}
                className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-200 hover:rounded-xl ${
                  isActive(`/app/${guild.id}`)
                    ? "rounded-xl bg-indigo-600"
                    : "bg-gray-800 hover:bg-gray-600"
                }`}
                title={guild.name}
              >
                {guild.icon ? (
                  <img
                    src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`}
                    alt={guild.name}
                    className="h-10 w-10 rounded-xl"
                  />
                ) : (
                  <span className="font-semibold text-white">
                    {guild.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </Link>
            </div>
          ))}
          <div className="flex justify-center">
            <Link
              target="_blank"
              to={
                "https://discord.com/oauth2/authorize?client_id=976541718109368361"
              }
              className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-700 transition-all duration-200 hover:rounded-xl hover:bg-gray-600`}
              title={"Add to server"}
            >
              <span className="font-semibold text-white">+</span>
            </Link>
          </div>
        </div>

        {/* Settings gear at bottom */}
        {/* <div className="pb-3">
          <Link
            to={`/app/${guildId}/settings`}
            className={`mx-3 flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-200 ${
              isActive("/settings")
                ? "rounded-xl bg-indigo-600"
                : "bg-gray-700 hover:rounded-xl hover:bg-gray-600"
            }`}
          >
            <span className="text-lg">⚙️</span>
          </Link>
        </div> */}
      </div>

      {/* Channel Sidebar */}
      <div className="flex w-60 flex-col bg-gray-800">
        {/* Channel Header */}
        <div className="flex h-16 items-center border-b border-gray-700 px-4">
          <h2 className="text-lg font-semibold text-white">Euno Dashboard</h2>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {guildId ? (
            <>
              <Link
                to={`/app/${guildId}/sh`}
                className={`group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(`/app/${guildId}/sh`)
                    ? "bg-gray-600 text-white"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                🌟 Star Hunter
              </Link>
              <hr className="" />
              <Link
                to={`/app/${guildId}/settings`}
                className={`group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(`/app/${guildId}/settings`)
                    ? "bg-gray-600 text-white"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                ⚙️ Settings
              </Link>
              <Link
                to={`/app/${guildId}/onboard`}
                className={`group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(`/app/${guildId}/onboard`)
                    ? "bg-gray-600 text-white"
                    : "text-gray-300 hover:bg-gray-700 hover:text-white"
                }`}
              >
                🆕 Onboarding flow
              </Link>
            </>
          ) : null}
        </nav>

        {/* Expanded Account Menu */}
        {accountExpanded && (
          <div className="border-t border-gray-700 bg-gray-700">
            <div className="px-3 py-2">
              <p className="mb-2 text-xs text-gray-400">Account</p>
              <div className="space-y-1">
                {/* <Link
                    to="/profile"
                    className="block rounded px-2 py-1 text-sm text-gray-300 hover:bg-gray-600 hover:text-white"
                  >
                    Profile
                  </Link> */}
                <Link
                  to="/profile"
                  className="block rounded px-2 py-1 text-sm text-gray-300 hover:bg-gray-600 hover:text-white"
                >
                  Profile
                </Link>

                <Link
                  to="/terms"
                  className="block rounded px-2 py-1 text-sm text-gray-300 hover:bg-gray-600 hover:text-white"
                >
                  Terms of Service
                </Link>
                <Link
                  to="/privacy"
                  className="block rounded px-2 py-1 text-sm text-gray-300 hover:bg-gray-600 hover:text-white"
                >
                  Privacy Policy
                </Link>
                <Link
                  to="mailto:support@euno.reactiflux.com"
                  className="block rounded px-2 py-1 text-sm text-gray-300 hover:bg-gray-600 hover:text-white"
                >
                  Contact Support
                </Link>

                <hr />

                <div className="rounded px-2 py-1 text-sm text-gray-300 hover:bg-gray-600 hover:text-white">
                  <Logout>Log Out</Logout>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Account Section */}
        <div className="border-t border-gray-700 bg-gray-800">
          <button
            onClick={() => setAccountExpanded(!accountExpanded)}
            className="flex w-full items-center px-3 py-3 text-left text-sm transition-colors hover:bg-gray-700"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white">
              {user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="ml-3 min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user.email?.split("@")[0]}
              </p>
              <p className="truncate text-xs text-gray-400">Online</p>
            </div>
            <svg
              className={`h-4 w-4 text-gray-400 transition-transform ${
                accountExpanded ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden bg-gray-600">
        {/* Main Content */}
        <main className={`flex-1 overflow-auto ${rightPanel ? "pr-0" : ""}`}>
          {children}
        </main>

        {/* Right Panel (conditional) */}
        {rightPanel && (
          <aside className="w-80 overflow-auto border-l border-gray-600 bg-gray-800">
            {rightPanel}
          </aside>
        )}
      </div>
    </div>
  );
}
