import Sentry from "#~/helpers/sentry.server";

// Structured logging with consistent format
export const log = (
  level: "debug" | "info" | "warn" | "error",
  service: string | Record<string, string>,
  message: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: Record<string, any> = {},
) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    service,
    message,
    context,
  };

  // Use structured logging for better parsing
  console.log(JSON.stringify(logEntry));

  // Also log to Sentry for error tracking and performance monitoring
  if (level === "error") {
    Sentry.captureException(new Error(message), {
      tags: typeof service === "string" ? { service } : service,
      extra: context,
    });
  } else if (level === "warn") {
    Sentry.captureMessage(message, {
      level: "warning",
      tags: typeof service === "string" ? { service } : service,
      extra: context,
    });
  }
};

// Performance tracking helper
export const trackPerformance = <T>(
  operation: string,
  fn: () => T,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: Record<string, any> = {},
): T => {
  return Sentry.startSpan({ name: operation, attributes: context }, fn);
};
