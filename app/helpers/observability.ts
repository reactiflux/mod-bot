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
