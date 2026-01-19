import * as Sentry from "@sentry/node";

import { isProd, sentryIngest } from "#~/helpers/env.server";

// Only initialize Sentry if DSN is valid (not a placeholder like "example.com")
export const isValidDsn = sentryIngest.startsWith("https://");

if (isValidDsn) {
  const sentryOptions: Sentry.NodeOptions = {
    dsn: sentryIngest,
    environment: isProd() ? "production" : "development",
    // Skip Sentry's auto OpenTelemetry setup - we'll use Effect's OpenTelemetry
    // and provide the SentrySpanProcessor to it
    skipOpenTelemetrySetup: true,
    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    tracesSampleRate: isProd() ? 0.2 : 1,
    sendDefaultPii: true,
  };

  console.log("Sentry initialized:", sentryOptions);
  Sentry.init(sentryOptions);
} else {
  console.log("Sentry disabled: No valid DSN configured");
}

export default Sentry;
