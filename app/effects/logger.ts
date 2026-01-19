import { List, Logger } from "effect";

/**
 * Custom JSON logger for Effect.
 *
 * Outputs structured JSON logs to stdout for consumption by log aggregators
 * (Loki, CloudWatch, etc.). Replaces the legacy console.log(JSON.stringify(...))
 * approach with Effect-native logging.
 *
 * Usage: Use Effect.log, Effect.logDebug, Effect.logInfo, Effect.logWarning, Effect.logError
 * within Effect pipelines. The LoggerLive layer must be provided.
 *
 * Annotations:
 * - Add service name: Effect.annotateLogs("service", "Gateway")
 * - Add context: Effect.annotateLogs({ userId, guildId })
 */

// Custom replacer to serialize Error objects properly
const errorReplacer = (_key: string, value: unknown) => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
};

/**
 * JSON Logger that outputs structured logs to stdout.
 *
 * Output format:
 * {
 *   "timestamp": "2024-01-15T10:30:00.000Z",
 *   "level": "INFO",
 *   "message": "User logged in",
 *   "service": "Auth",          // from annotations
 *   "spanName": "handleLogin",  // from active span
 *   ...otherAnnotations
 * }
 */
const JsonLogger = Logger.make(({ logLevel, message, annotations, spans }) => {
  const logEntry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: logLevel.label,
    message: typeof message === "string" ? message : String(message),
    ...annotations,
  };

  // Add span context if available
  const firstSpan = List.head(spans);
  if (firstSpan._tag === "Some") {
    logEntry.spanName = firstSpan.value.label;
  }

  // Output to stdout for K8s log collectors
  globalThis.console.log(JSON.stringify(logEntry, errorReplacer));
});

/**
 * Layer that replaces the default Effect logger with our JSON logger.
 * Provide this layer to enable structured JSON logging.
 */
export const LoggerLive = Logger.replace(Logger.defaultLogger, JsonLogger);
