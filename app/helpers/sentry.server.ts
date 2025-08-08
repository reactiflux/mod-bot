import * as Sentry from "@sentry/node";
import { isProd, sentryIngest } from "#~/helpers/env.server";

const sentryOptions = {
  dsn: sentryIngest,
  environment: isProd() ? "production" : "development",
  integrations: [
    new Sentry.Integrations.OnUncaughtException(),
    new Sentry.Integrations.OnUnhandledRejection(),
  ],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: isProd() ? 0.2 : 1,
  sendDefaultPii: true,
};

console.log("Sentry initialized:", sentryOptions);

Sentry.init(sentryOptions);

export default Sentry;
