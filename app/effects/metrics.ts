import { Metric, MetricBoundaries } from "effect";

/**
 * Effect-native metrics for APM-style observability.
 *
 * Metrics work in-memory immediately. When connected to OpenTelemetry, they
 * export to Prometheus/Grafana Cloud.
 *
 * Usage:
 *   yield* Metric.increment(Metrics.commandExecutions)
 *   yield* Metric.trackDuration(Metrics.commandLatency)(someEffect)
 */

// Discord Command Metrics
export const commandExecutions = Metric.counter(
  "discord_command_executions_total",
);
export const commandErrors = Metric.counter("discord_command_errors_total");
export const commandLatency = Metric.histogram(
  "discord_command_latency_ms",
  MetricBoundaries.exponential({ start: 16, count: 10, factor: 2 }),
  // Buckets: 50, 150, 250, 350, 450, 550, 650, 750, 850, 950
);

// Database Metrics
export const dbQueries = Metric.counter("db_queries_total");
export const dbErrors = Metric.counter("db_errors_total");
export const dbQueryLatency = Metric.histogram(
  "db_query_latency_ms",
  MetricBoundaries.linear({ start: 1, width: 5, count: 20 }),
  // Buckets: 1, 6, 11, 16, 21, 26, 31, 36, 41, 46, 51, ...
);

// Gateway / Connection Metrics
export const connectedGuilds = Metric.gauge("discord_connected_guilds");
export const gatewayErrors = Metric.counter("discord_gateway_errors_total");
