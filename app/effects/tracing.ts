import { NodeSdk } from "@effect/opentelemetry";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  SentryPropagator,
  SentrySampler,
  SentrySpanProcessor,
} from "@sentry/opentelemetry";

import { DevTreeSpanExporter } from "#~/effects/devSpanExporter.js";
import Sentry, { isValidDsn } from "#~/helpers/sentry.server.js";

const sentryClient = Sentry.getClient();

/**
 * Effect OpenTelemetry layer that exports spans to Sentry.
 *
 * This layer integrates Effect's native tracing (Effect.withSpan) with Sentry.
 * All spans created with Effect.withSpan will be exported to Sentry for
 * visualization in their Performance dashboard.
 *
 * The layer uses:
 * - SentrySpanProcessor: Exports spans to Sentry (it IS a SpanProcessor, not an exporter)
 * - SentrySampler: Respects Sentry's tracesSampleRate
 * - SentryPropagator: Enables distributed tracing
 *
 * In dev mode (no Sentry DSN), spans are printed as a human-readable timing
 * tree via DevTreeSpanExporter.
 */
export const TracingLive = NodeSdk.layer(() => ({
  resource: { serviceName: "mod-bot" },
  // Only add Sentry processors if Sentry is configured
  // SentrySpanProcessor is already a SpanProcessor, don't wrap in BatchSpanProcessor
  spanProcessor: isValidDsn
    ? new SentrySpanProcessor()
    : new SimpleSpanProcessor(new DevTreeSpanExporter()),
  sampler:
    isValidDsn && sentryClient ? new SentrySampler(sentryClient) : undefined,
  propagator: isValidDsn ? new SentryPropagator() : undefined,
}));
