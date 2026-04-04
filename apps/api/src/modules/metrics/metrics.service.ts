import { Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

// ─── Constants ───────────────────────────────────────────────────────────────

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const DURATION_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry = new Registry();
  private httpRequestsTotal!: Counter;
  private httpRequestDurationSeconds!: Histogram;
  private httpRequestsInFlight!: Gauge;

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'path', 'status_code'],
      buckets: DURATION_BUCKETS,
      registers: [this.registry],
    });

    this.httpRequestsInFlight = new Gauge({
      name: 'http_requests_in_flight',
      help: 'Number of HTTP requests currently being processed',
      labelNames: ['method'],
      registers: [this.registry],
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  recordRequest(method: string, path: string, statusCode: number, durationSeconds: number): void {
    const normalizedPath = this.stripUuids(path);
    const labels = { method, path: normalizedPath, status_code: String(statusCode) };

    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(labels, durationSeconds);
  }

  incrementInFlight(method: string): void {
    this.httpRequestsInFlight.inc({ method });
  }

  decrementInFlight(method: string): void {
    this.httpRequestsInFlight.dec({ method });
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private stripUuids(value: string): string {
    return value.replace(UUID_RE, ':id');
  }
}
