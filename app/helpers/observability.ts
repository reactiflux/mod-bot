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
export const trackPerformance = async <T>(
  operation: string,
  fn: () => Promise<T>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: Record<string, any> = {},
): Promise<T> => {
  const startTime = Date.now();
  const startHrTime = process.hrtime.bigint();

  try {
    log("info", "Performance", `Starting ${operation}`, {
      operation,
      context: JSON.stringify(context),
    });

    const result = await fn();

    const duration = Date.now() - startTime;
    const hrDuration = Number(process.hrtime.bigint() - startHrTime) / 1000000; // Convert to milliseconds

    log("info", "Performance", `Completed ${operation}`, {
      operation,
      duration_ms: duration,
      hr_duration_ms: hrDuration,
      success: true,
      context: JSON.stringify(context),
    });

    // Track performance metrics in Sentry
    Sentry.addBreadcrumb({
      category: "performance",
      message: `${operation} completed`,
      level: "info",
      data: {
        operation,
        duration_ms: duration,
        hr_duration_ms: hrDuration,
        context: JSON.stringify(context),
      },
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const hrDuration = Number(process.hrtime.bigint() - startHrTime) / 1000000;

    log("info", "Performance", `Failed ${operation}`, {
      operation,
      duration_ms: duration,
      hr_duration_ms: hrDuration,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
    });

    throw error;
  }
};
