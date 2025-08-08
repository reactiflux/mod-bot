import * as Sentry from "@sentry/node";
import { isProd, sentryIngest } from "#~/helpers/env.server";

Sentry.init({
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
});

export default Sentry;
