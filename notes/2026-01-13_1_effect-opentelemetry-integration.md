# Effect + OpenTelemetry Integration

## Overview

Effect provides first-class OpenTelemetry integration via `@effect/opentelemetry`. This package
bridges Effect's native observability primitives to the OpenTelemetry standard, enabling export
to any OTel-compatible backend (Prometheus, Grafana, Jaeger, Sentry, DataDog, etc.).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Effect Application                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Effect.withSpan()     │  Effect.log*()        │  Metric.counter/gauge/...  │
│  ─────────────────     │  ────────────         │  ────────────────────────  │
│  Native tracing API    │  Native logging API   │  Native metrics API        │
└─────────────┬──────────┴──────────┬────────────┴────────────┬───────────────┘
              │                     │                         │
              ▼                     ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        @effect/opentelemetry                                 │
│                           NodeSdk.layer()                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  SpanProcessor         │  LogRecordProcessor   │  MetricReader               │
│  (traces)              │  (logs)               │  (metrics)                  │
└─────────────┬──────────┴──────────┬────────────┴────────────┬───────────────┘
              │                     │                         │
              ▼                     ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OpenTelemetry Protocol (OTLP)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Jaeger / Tempo        │  Loki / CloudWatch    │  Prometheus / Grafana       │
│  Sentry Performance    │  (via OTLP exporter)  │  (via OTLP or Prometheus)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Current Implementation (mod-bot)

### Tracing (`app/effects/tracing.ts`)

```typescript
import { NodeSdk } from "@effect/opentelemetry";
import {
  SentryPropagator,
  SentrySampler,
  SentrySpanProcessor,
} from "@sentry/opentelemetry";

export const TracingLive = NodeSdk.layer(() => ({
  resource: { serviceName: "mod-bot" },
  spanProcessor: new SentrySpanProcessor(), // Exports spans to Sentry
  sampler: new SentrySampler(client), // Respects Sentry's tracesSampleRate
  propagator: new SentryPropagator(), // Enables distributed tracing
}));
```

**How it works:**

1. `NodeSdk.layer()` creates an Effect Layer that initializes OpenTelemetry
2. When `Effect.withSpan("name")` is called, Effect creates a span
3. The span is processed by `SentrySpanProcessor` and sent to Sentry
4. Sentry displays it in their Performance dashboard

### Logging (`app/effects/logger.ts`)

```typescript
const JsonLogger = Logger.make(({ logLevel, message, annotations, spans }) => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: logLevel.label,
      message: String(message),
      spanName: spans[0]?.label, // Correlates with active trace
      ...annotations,
    }),
  );
});

export const LoggerLive = Logger.replace(Logger.defaultLogger, JsonLogger);
```

**Current state:** Logs output to stdout as JSON. Not yet connected to OpenTelemetry.

**To connect to OTel:** Add a `logRecordProcessor` to `NodeSdk.layer()`:

```typescript
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";

NodeSdk.layer(() => ({
  // ... existing config
  logRecordProcessor: new SimpleLogRecordProcessor(
    new OTLPLogExporter({ url: "https://otlp.example.com/v1/logs" }),
  ),
}));
```

### Metrics (`app/effects/metrics.ts`)

```typescript
import { Metric, MetricBoundaries } from "effect";

export const dbQueryLatency = Metric.histogram(
  "db_query_latency_ms",
  MetricBoundaries.linear({ start: 1, width: 5, count: 20 }),
);

export const commandExecutions = Metric.counter(
  "discord_command_executions_total",
);
export const connectedGuilds = Metric.gauge("discord_connected_guilds");
```

**Current state:** Metrics are tracked in-memory. Not yet exported.

**To connect to OTel:** Add a `metricReader` to `NodeSdk.layer()`:

```typescript
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

NodeSdk.layer(() => ({
  // ... existing config
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.GRAFANA_OTLP_ENDPOINT,
      headers: { Authorization: `Bearer ${process.env.GRAFANA_API_KEY}` },
    }),
    exportIntervalMillis: 60000,
  }),
}));
```

## Effect's Three Pillars of Observability

### 1. Tracing (Effect.withSpan)

Spans represent units of work with timing, attributes, and hierarchy.

```typescript
const getUserData = (userId: string) =>
  Effect.gen(function* () {
    const user = yield* fetchUser(userId);
    const settings = yield* fetchSettings(userId);
    return { user, settings };
  }).pipe(Effect.withSpan("getUserData", { attributes: { userId } }));
```

**Span output:**

```json
{
  "traceId": "abc123",
  "spanId": "def456",
  "parentSpanId": "ghi789",
  "name": "getUserData",
  "duration": 45000,
  "attributes": { "userId": "12345" },
  "status": { "code": 1 }
}
```

### 2. Logging (Effect.log\*)

Effect's native logging integrates with tracing context.

```typescript
yield *
  Effect.logInfo("User fetched").pipe(
    Effect.annotateLogs({ userId, source: "cache" }),
  );
```

**Key feature:** Logs within a span automatically become "span events", creating
a timeline of what happened during that operation.

### 3. Metrics (Effect.Metric)

Effect provides four metric types that map directly to OpenTelemetry:

| Effect Type        | OTel Type | Use Case                            |
| ------------------ | --------- | ----------------------------------- |
| `Metric.counter`   | Counter   | Monotonic counts (requests, errors) |
| `Metric.gauge`     | Gauge     | Point-in-time values (connections)  |
| `Metric.histogram` | Histogram | Distributions (latencies)           |
| `Metric.summary`   | Summary   | Quantiles (P50, P99)                |

```typescript
// Usage within Effect
yield * Metric.increment(requestCounter);
yield * Metric.set(activeConnections, 42);
yield * Metric.update(latencyHistogram, 150);
```

## How Effect Converts to OpenTelemetry

### Span Conversion

Effect spans → OTel spans via `@effect/opentelemetry`:

| Effect Concept               | OpenTelemetry Equivalent   |
| ---------------------------- | -------------------------- |
| `Effect.withSpan("name")`    | `tracer.startSpan("name")` |
| `Effect.annotateCurrentSpan` | `span.setAttribute()`      |
| `Effect.logInfo()` in span   | `span.addEvent()`          |
| Effect fiber context         | OTel context propagation   |

### Metric Conversion

Effect metrics → OTel metrics via `MetricProducerImpl`:

| Effect Metric              | OpenTelemetry Metric |
| -------------------------- | -------------------- |
| `Metric.counter("name")`   | `Counter`            |
| `Metric.gauge("name")`     | `ObservableGauge`    |
| `Metric.histogram("name")` | `Histogram`          |
| `Metric.tagged(m, k, v)`   | Metric attributes    |

## NodeSdk.layer Configuration Options

```typescript
NodeSdk.layer(() => ({
  // Service identification
  resource: {
    serviceName: "mod-bot",
    serviceVersion: "1.0.0",
    attributes: { environment: "production" },
  },

  // Tracing
  spanProcessor: SpanProcessor, // Where to send spans
  tracerConfig: TracerConfig, // Tracer settings

  // Metrics
  metricReader: MetricReader, // Where to send metrics

  // Logging
  logRecordProcessor: LogRecordProcessor, // Where to send logs
  loggerProviderConfig: LoggerProviderConfig,

  // Lifecycle
  shutdownTimeout: Duration, // Graceful shutdown timeout
}));
```

## Current vs Target State

| Signal  | Current        | Target                        |
| ------- | -------------- | ----------------------------- |
| Traces  | → Sentry       | → Sentry (no change)          |
| Metrics | In-memory only | → Grafana Cloud Prometheus    |
| Logs    | stdout (JSON)  | stdout → Grafana Agent → Loki |

## Dependencies

```json
{
  "@effect/opentelemetry": "^0.59.2",
  "@opentelemetry/api": "^1.9.0",
  "@opentelemetry/sdk-trace-base": "^2.2.0",
  "@opentelemetry/sdk-trace-node": "^2.2.0",
  "@opentelemetry/sdk-metrics": "^2.2.0",
  "@opentelemetry/sdk-logs": "^0.208.0",
  "@sentry/opentelemetry": "^10.29.0"
}
```

## References

- [Effect Tracing Documentation](https://effect.website/docs/observability/tracing/)
- [@effect/opentelemetry API Reference](https://effect-ts.github.io/effect/docs/opentelemetry)
- [NodeSdk.ts Source](https://effect-ts.github.io/effect/opentelemetry/NodeSdk.ts.html)
- [@effect/opentelemetry on npm](https://www.npmjs.com/package/@effect/opentelemetry)
