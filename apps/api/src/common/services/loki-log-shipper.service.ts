import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface StructuredLogEntry {
  timestamp: string;
  level: string;
  message: string;
  requestId: string | null;
  tenantId: string | null;
  userId: string | null;
  context: string | null;
  trace?: string;
}

interface LokiStream {
  stream: Record<string, string>;
  values: [string, string][];
}

interface LokiPushPayload {
  streams: LokiStream[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 5_000;
const BATCH_SIZE_THRESHOLD = 100;

// ─── Service ───────────────────────────────────────────────────────────────────

/**
 * Ships structured log entries to Grafana Loki via the HTTP push API.
 *
 * Buffers entries in memory and flushes them in batches — either when the
 * buffer reaches 100 entries or every 5 seconds, whichever comes first.
 * Gracefully degrades when LOKI_PUSH_URL is not configured.
 */
@Injectable()
export class LokiLogShipper implements OnModuleInit, OnModuleDestroy {
  private readonly lokiPushUrl: string | undefined;
  private readonly serviceLabel: string;
  private readonly environment: string;
  private readonly buffer: StructuredLogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  private readonly logger = new Logger(LokiLogShipper.name);

  constructor(private readonly configService: ConfigService) {
    this.lokiPushUrl = this.configService.get<string>('LOKI_PUSH_URL');
    this.serviceLabel = this.configService.get<string>('LOKI_SERVICE_LABEL') ?? 'api';
    this.environment = this.configService.get<string>('LOKI_ENVIRONMENT') ?? 'development';
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  onModuleInit(): void {
    if (!this.lokiPushUrl) {
      this.logger.log('Loki not configured, log shipping disabled');
      return;
    }

    this.logger.log(
      `Log shipping enabled — pushing to ${this.lokiPushUrl} (service=${this.serviceLabel}, env=${this.environment})`,
    );

    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Buffer a structured log entry for shipping to Loki.
   * If the buffer reaches the threshold, triggers an immediate flush.
   */
  ship(entry: StructuredLogEntry): void {
    if (!this.lokiPushUrl) {
      return;
    }

    this.buffer.push(entry);

    if (this.buffer.length >= BATCH_SIZE_THRESHOLD) {
      void this.flush();
    }
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  /**
   * Flush the current buffer to Loki. On failure, logs to stderr and drops
   * the batch — log shipping must never block the application.
   */
  private flush(): Promise<void> {
    if (this.buffer.length === 0 || !this.lokiPushUrl) {
      return Promise.resolve();
    }

    // Drain the buffer into a local copy
    const entries = this.buffer.splice(0, this.buffer.length);
    const payload = this.buildPayload(entries);

    return fetch(this.lokiPushUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((response) => {
        if (!response.ok) {
          console.error(
            `[LokiLogShipper] Push failed with status ${response.status}: ${response.statusText}`,
          );
        }
      })
      .catch((err: unknown) => {
        console.error('[LokiLogShipper]', err);
      });
  }

  /**
   * Build the Loki push API payload. Groups entries by level label so each
   * stream has a consistent label set (required by Loki).
   *
   * High-cardinality fields (tenant_id, user_id, request_id) are embedded
   * in the log line JSON — NOT as Loki labels.
   */
  private buildPayload(entries: StructuredLogEntry[]): LokiPushPayload {
    // Group entries by level to create one stream per level
    const streamMap = new Map<string, [string, string][]>();

    for (const entry of entries) {
      const level = entry.level;
      const nanosTimestamp = this.toNanos(entry.timestamp);

      // Build the log line with structured metadata inline
      const logLine = JSON.stringify({
        message: entry.message,
        tenant_id: entry.tenantId,
        user_id: entry.userId,
        request_id: entry.requestId,
        context: entry.context,
        ...(entry.trace ? { trace: entry.trace } : {}),
      });

      const existing = streamMap.get(level);
      if (existing) {
        existing.push([nanosTimestamp, logLine]);
      } else {
        streamMap.set(level, [[nanosTimestamp, logLine]]);
      }
    }

    const streams: LokiStream[] = [];
    for (const [level, values] of streamMap) {
      streams.push({
        stream: {
          service: this.serviceLabel,
          level,
          environment: this.environment,
        },
        values,
      });
    }

    return { streams };
  }

  /**
   * Convert an ISO 8601 timestamp to nanosecond-precision Unix timestamp
   * string, as required by Loki's push API.
   */
  private toNanos(isoTimestamp: string): string {
    const ms = new Date(isoTimestamp).getTime();
    // Loki expects nanoseconds as a string
    return `${ms}000000`;
  }
}
