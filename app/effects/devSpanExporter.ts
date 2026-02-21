import { SpanStatusCode } from "@opentelemetry/api";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

const ORPHAN_TTL_MS = 30_000;

function hrTimeToMs(hrTime: [number, number]): number {
  return hrTime[0] * 1000 + hrTime[1] / 1_000_000;
}

/**
 * Dev-mode span exporter that prints a human-readable timing tree to console.
 *
 * Accumulates spans by trace ID and prints the full tree when the root span
 * (no parent) completes. Use with SimpleSpanProcessor for immediate output.
 *
 * Example output:
 *
 *   --- Trace: DeletionLogger.messageDelete (1823.4ms) ---
 *     discord.fetchGuild 45.2ms
 *     fetchAuditLogEntry 1612.8ms
 *       discord.fetchAuditLogs 89.3ms
 *       discord.fetchAuditLogs 76.1ms
 *     getOrCreateDeletionLogThread 89.4ms
 *       sql.execute 2.1ms
 *     discord.sendMessage 48.2ms
 */
export class DevTreeSpanExporter implements SpanExporter {
  private spansByTrace = new Map<
    string,
    { spans: ReadableSpan[]; firstSeen: number }
  >();

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    for (const span of spans) {
      const traceId = span.spanContext().traceId;

      let entry = this.spansByTrace.get(traceId);
      if (!entry) {
        entry = { spans: [], firstSeen: Date.now() };
        this.spansByTrace.set(traceId, entry);
      }
      entry.spans.push(span);

      // Root span (no parent) — print the tree
      const parentId = span.parentSpanContext?.spanId;
      if (!parentId) {
        this.printTree(traceId);
        this.spansByTrace.delete(traceId);
      }
    }

    // Evict orphaned traces older than TTL
    const now = Date.now();
    for (const [traceId, entry] of this.spansByTrace) {
      if (now - entry.firstSeen > ORPHAN_TTL_MS) {
        this.spansByTrace.delete(traceId);
      }
    }

    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  private printTree(traceId: string): void {
    const entry = this.spansByTrace.get(traceId);
    if (!entry) return;
    const { spans } = entry;

    // Build parent→children map
    const childMap = new Map<string, ReadableSpan[]>();
    let root: ReadableSpan | undefined;

    for (const span of spans) {
      const parentId = span.parentSpanContext?.spanId;
      if (!parentId) {
        root = span;
      } else {
        let children = childMap.get(parentId);
        if (!children) {
          children = [];
          childMap.set(parentId, children);
        }
        children.push(span);
      }
    }

    if (!root) return;

    const rootDuration = hrTimeToMs(root.duration);
    const lines: string[] = [];
    this.renderChildren(root, childMap, 1, lines);

    if (lines.length === 0) {
      // Single span, no children — print on one line
      console.log(`[trace] ${root.name} ${rootDuration.toFixed(1)}ms`);
    } else {
      console.log(`--- Trace: ${root.name} (${rootDuration.toFixed(1)}ms) ---`);
      for (const line of lines) console.log(line);
    }
  }

  private renderChildren(
    parent: ReadableSpan,
    childMap: Map<string, ReadableSpan[]>,
    depth: number,
    lines: string[],
  ): void {
    const children = childMap.get(parent.spanContext().spanId) ?? [];

    // Sort by start time
    children.sort((a, b) => {
      const diff = a.startTime[0] - b.startTime[0];
      return diff !== 0 ? diff : a.startTime[1] - b.startTime[1];
    });

    for (const child of children) {
      const durationMs = hrTimeToMs(child.duration);
      const status = child.status.code === SpanStatusCode.ERROR ? " ERROR" : "";
      const indent = "  ".repeat(depth);
      lines.push(`${indent}${child.name} ${durationMs.toFixed(1)}ms${status}`);

      this.renderChildren(child, childMap, depth + 1, lines);
    }
  }

  async shutdown(): Promise<void> {
    this.spansByTrace.clear();
  }

  async forceFlush(): Promise<void> {
    // No-op: SimpleSpanProcessor exports immediately, nothing to flush
  }
}
