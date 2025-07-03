import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_INGEST,
  environment: process.env.NODE_ENV,
  integrations: [
    // enable HTTP calls tracing
    // new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.OnUncaughtException(),
    new Sentry.Integrations.OnUnhandledRejection(),
    // enable Express.js middleware tracing
    // new Tracing.Integrations.Express({ app }),
  ],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 0.2,
});

export default Sentry;
