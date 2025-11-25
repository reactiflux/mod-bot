import { Link, Outlet, useLocation, useParams } from "react-router";

import { Page } from "#~/basics/page.js";

const tabs = [
  { name: "Settings", path: "" },
  { name: "Upgrade", path: "/upgrade" },
];

export default function TabsLayout() {
  const location = useLocation();
  const { guildId } = useParams();

  const basePath = `/app/${guildId}/settings`;

  const isActive = (tabPath: string) => {
    const fullPath = basePath + tabPath;
    // Exact match for the tab path
    return location.pathname === fullPath;
  };

  return (
    <Page>
      {/* Tabs Navigation */}
      <div className="border-b border-gray-700 bg-gray-700">
        <nav className="-mb-px flex space-x-4" aria-label="Tabs">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={basePath + tab.path}
              className={`whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
                isActive(tab.path)
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300"
              }`}
            >
              {tab.name}
            </Link>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <Outlet />
    </Page>
  );
}
