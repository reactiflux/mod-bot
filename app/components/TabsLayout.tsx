import { Link, Outlet, useLocation, useParams } from "react-router";

import { Page } from "#~/basics/page.js";

const tabs: { name: string; path: string; style?: "upsell" }[] = [
  { name: "Settings", path: "" },
  { name: "Upgrade", path: "/upgrade", style: "upsell" },
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
      <nav
        className="-mb-px flex space-x-4 border-b-2 border-gray-500"
        aria-label="Tabs"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.name}
            to={basePath + tab.path}
            className={`whitespace-nowrap px-1 py-2 text-sm font-medium transition-colors ${tab.style === "upsell" ? "upsell-tab" : ""} ${
              isActive(tab.path)
                ? "-mb-[2px] border-b-2 border-indigo-500 text-indigo-400"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            {tab.name}
          </Link>
        ))}
      </nav>

      {/* Tab Content */}
      <Outlet />
    </Page>
  );
}
