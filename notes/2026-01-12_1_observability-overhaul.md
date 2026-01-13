# Effect-Native Observability Overhaul

## Summary

Replaced the patchwork observability bridge (`app/effects/observability.ts`) with
Effect-native logging and metrics. This lays the foundation for exporting to
Grafana Cloud (Prometheus/Loki) in future phases.

## Changes

### New Files

- `app/effects/logger.ts` - JSON logger using Effect's Logger service
- `app/effects/metrics.ts` - Effect.Metric definitions (counters, gauges, histograms)

### Modified Files

- `app/effects/runtime.ts` - Added `LoggerLive` to the runtime layer
- `app/effects/observability.ts` - Now uses Effect.log\* internally instead of
  legacy console.log wrapper
- `app/effects/services/Database.ts` - Instrumented with query latency, count,
  and error metrics
- `app/effects/models/reportedMessages.ts` - Converted `deleteAllReportedForUser`
  to Effect-based with proper Effect-native logging

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Effect Runtime                          │
├─────────────────────────────────────────────────────────────┤
│  TracingLive (OpenTelemetry → Sentry)                      │
│  LoggerLive (JSON to stdout)                               │
│  Metrics (in-memory, exportable to Prometheus)             │
└─────────────────────────────────────────────────────────────┘
```

## Metrics Defined

| Metric                             | Type      | Purpose                    |
| ---------------------------------- | --------- | -------------------------- |
| `discord_command_latency_ms`       | Histogram | Command execution time     |
| `discord_command_executions_total` | Counter   | Command count by name      |
| `discord_command_errors_total`     | Counter   | Command failures           |
| `db_query_latency_ms`              | Histogram | Database query time        |
| `db_queries_total`                 | Counter   | Query count by operation   |
| `db_errors_total`                  | Counter   | Database errors            |
| `discord_connected_guilds`         | Gauge     | Active guild connections   |
| `discord_gateway_reconnects_total` | Counter   | Gateway reconnection count |
| `honeypot_triggers_total`          | Counter   | Honeypot activations       |
| `spam_detections_total`            | Counter   | Spam detected              |
| `escalation_votes_total`           | Counter   | Escalation votes cast      |
| `reports_submitted_total`          | Counter   | User reports submitted     |

## Next Steps (Infrastructure)

1. Sign up for Grafana Cloud (free tier: 10k metrics, 50GB logs/month)
2. Add `@opentelemetry/exporter-metrics-otlp-http` package
3. Configure OpenTelemetry metrics export in `app/effects/tracing.ts`
4. Deploy Grafana Agent as K8s DaemonSet for log shipping
5. Build Grafana dashboards

## Usage

Logging (existing code continues to work):

```typescript
yield * logEffect("info", "Gateway", "Bot connected", { guildCount: 5 });
```

Metrics (new):

```typescript
import { Metric } from "effect";

import { commandExecutions, tagCounter } from "#~/effects/metrics";

yield * Metric.increment(tagCounter(commandExecutions, { command: "ban" }));
```

## Notes

- Metrics are in-memory until OpenTelemetry export is configured
- Logging still outputs to stdout (K8s-friendly JSON format)
- Database service now tracks latency/errors automatically
- PostHog continues to handle product analytics (separate concern)
