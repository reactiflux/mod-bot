import { NodeSdk } from "@effect/opentelemetry";
import {
  SentryPropagator,
  SentrySampler,
  SentrySpanProcessor,
} from "@sentry/opentelemetry";

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
 */
export const TracingLive = NodeSdk.layer(() => ({
  resource: { serviceName: "mod-bot" },
  // Only add Sentry processors if Sentry is configured
  // SentrySpanProcessor is already a SpanProcessor, don't wrap in BatchSpanProcessor
  spanProcessor: isValidDsn ? new SentrySpanProcessor() : undefined,
  sampler:
    isValidDsn && sentryClient ? new SentrySampler(sentryClient) : undefined,
  propagator: isValidDsn ? new SentryPropagator() : undefined,
}));
