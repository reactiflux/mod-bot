import { HydratedRouter } from "react-router/dom";
import { hydrateRoot } from "react-dom/client";
import { PostHogProvider } from "posthog-js/react";

const options = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: "2025-05-24" as const,
};

hydrateRoot(
  document,
  <PostHogProvider
    apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
    options={options}
  >
    <HydratedRouter />
  </PostHogProvider>,
);
