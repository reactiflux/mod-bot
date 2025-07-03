import { useState } from "react";
import { Link, useLocation } from "react-router";
import { useUser } from "#~/utils";
import { Logout } from "#~/basics/logout";

interface DiscordLayoutProps {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  serverIcons?: Array<{
    id: string;
    name: string;
    icon?: string;
    href: string;
    isActive?: boolean;
  }>;
}

export function DiscordLayout({ children, rightPanel, serverIcons }: DiscordLayoutProps) {
  const user = useUser();
  const location = useLocation();
  const [accountExpanded, setAccountExpanded] = useState(false);

  const navigation = [
    { name: "Servers", href: "/guilds", icon: "🏠" },
    { name: "Settings", href: "/settings", icon: "⚙️" },
  ];

  const isActive = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

  return (
    <div className="flex h-screen bg-gray-800 text-white">
      {/* Server Selector Column */}
      <div className="flex w-16 flex-col bg-gray-900 border-r border-gray-800">
        {/* Home/Euno Icon */}
        <div className="flex h-16 items-center justify-center border-b border-gray-800">
          <Link
            to="/guilds"
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white font-bold text-lg hover:rounded-xl transition-all duration-200 hover:bg-indigo-500"
          >
            E
          </Link>
        </div>

        {/* Server Icons */}
        <div className="flex-1 py-3 space-y-2 overflow-y-auto">
          {serverIcons?.map((server) => (
            <div key={server.id} className="flex justify-center">
              <Link
                to={server.href}
                className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-200 hover:rounded-xl ${
                  server.isActive || isActive(server.href)
                    ? "bg-indigo-600 rounded-xl"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
                title={server.name}
              >
                {server.icon ? (
                  <img
                    src={`https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png?size=64`}
                    alt={server.name}
                    className="h-10 w-10 rounded-xl"
                  />
                ) : (
                  <span className="font-semibold text-white">
                    {server.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </Link>
            </div>
          ))}
        </div>

        {/* Settings gear at bottom */}
        <div className="pb-3">
          <Link
            to="/settings"
            className={`mx-3 flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-200 ${
              isActive("/settings")
                ? "bg-indigo-600 rounded-xl"
                : "bg-gray-700 hover:bg-gray-600 hover:rounded-xl"
            }`}
          >
            <span className="text-lg">⚙️</span>
          </Link>
        </div>
      </div>

      {/* Channel Sidebar */}
      <div className="flex w-60 flex-col bg-gray-800">
        {/* Channel Header */}
        <div className="flex h-16 items-center px-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Euno Dashboard</h2>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          <Link
            to="/guilds"
            className={`group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive("/guilds")
                ? "bg-gray-600 text-white"
                : "text-gray-300 hover:bg-gray-700 hover:text-white"
            }`}
          >
            <span className="mr-3 text-lg">🏠</span>
            Servers
          </Link>
          <Link
            to="/analytics"
            className={`group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive("/analytics")
                ? "bg-gray-600 text-white"
                : "text-gray-300 hover:bg-gray-700 hover:text-white"
            }`}
          >
            <span className="mr-3 text-lg">📊</span>
            Analytics
          </Link>
        </nav>

        {/* Account Section */}
        <div className="border-t border-gray-700 bg-gray-800">
          <button
            onClick={() => setAccountExpanded(!accountExpanded)}
            className="flex w-full items-center px-3 py-3 text-left text-sm hover:bg-gray-700 transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {user.email.split("@")[0]}
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

          {/* Expanded Account Menu */}
          {accountExpanded && (
            <div className="border-t border-gray-700 bg-gray-700">
              <div className="px-3 py-2">
                <p className="text-xs text-gray-400 mb-2">Account</p>
                <div className="space-y-1">
                  <Link
                    to="/profile"
                    className="block rounded px-2 py-1 text-sm text-gray-300 hover:bg-gray-600 hover:text-white"
                  >
                    Profile
                  </Link>
                  <div className="rounded px-2 py-1 text-sm text-gray-300 hover:bg-gray-600 hover:text-white">
                    <Logout>Log Out</Logout>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Content */}
        <main className={`flex-1 overflow-auto ${rightPanel ? "pr-0" : ""}`}>
          <div className="h-full bg-gray-700">
            {children}
          </div>
        </main>

        {/* Right Panel (conditional) */}
        {rightPanel && (
          <aside className="w-80 border-l border-gray-600 bg-gray-800 overflow-auto">
            {rightPanel}
          </aside>
        )}
      </div>
    </div>
  );
}