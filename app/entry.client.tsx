import { PostHogProvider } from "posthog-js/react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

const options = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined,
  defaults: "2025-05-24" as const,
};

hydrateRoot(
  document,
  <PostHogProvider
    apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string}
    options={options}
  >
    <HydratedRouter />
  </PostHogProvider>,
);
