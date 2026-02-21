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
        className="flex space-x-1 border-b border-stone-600"
        aria-label="Tabs"
        aria-controls="settings-pane"
      >
        {tabs.map((tab) => (
          <Link
            role="tab"
            aria-selected={isActive(tab.path)}
            key={tab.name}
            to={basePath + tab.path}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap ${tab.style === "upsell" ? "upsell-tab" : ""} ${
              isActive(tab.path)
                ? "-mb-px border-b-2 border-amber-500 text-amber-400"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            {tab.name}
          </Link>
        ))}
      </nav>

      {/* Tab Content */}
      <main id="settings-pane">
        <Outlet />
      </main>
    </Page>
  );
}
