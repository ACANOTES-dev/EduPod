import { createHash, randomUUID } from 'crypto';
import { resolve4, resolve6, resolveCname, resolveMx, resolveTxt } from 'dns/promises';
import { connect as tlsConnect } from 'tls';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SyntheticCheckKind } from '@prisma/client';
import { Job, Queue, QueueEvents } from 'bullmq';

import { SyntheticCredentialResolverService } from './synthetic-credential-resolver.service';
import type { HandlerResult, SyntheticCheckHandler } from './synthetic-types';

const SYNTHETIC_CANARY_QUEUE = 'synthetic-canary';
const SYNTHETIC_CANARY_JOB = 'synthetic-canary:ping';
const CRITICAL_CANARY_JOB = 'synthetic:critical-queue-canary';
const SYNTHETIC_TENANT_SENTINEL = '00000000-0000-0000-0000-000000000000';
const CRITICAL_QUEUES = new Set(['notifications', 'behaviour', 'finance', 'payroll', 'pastoral']);

function nowMs(): number {
  return Date.now();
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? value
    : fallback;
}

function numberArray(value: unknown, fallback: number[]): number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'number')
    ? value
    : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function failure(message: string, detail: Record<string, unknown> = {}): HandlerResult {
  return { status: 'failed', failure_detail: { message, ...detail } };
}

@Injectable()
export class SyntheticCheckHandlersService {
  private readonly handlers: Map<SyntheticCheckKind, SyntheticCheckHandler>;

  constructor(
    private readonly configService: ConfigService,
    private readonly credentials: SyntheticCredentialResolverService,
  ) {
    this.handlers = new Map<SyntheticCheckKind, SyntheticCheckHandler>([
      ['http_get', new HttpCheckHandler('http_get', this.credentials)],
      ['http_post', new HttpCheckHandler('http_post', this.credentials)],
      ['websocket_handshake', new WebsocketHandshakeHandler(this.credentials)],
      ['queue_canary', new QueueCanaryHandler(this.configService)],
      ['notification_self_test', new NotificationSelfTestHandler(this.credentials)],
      ['dns_lookup', new DnsLookupHandler()],
      ['tls_check', new TlsCheckHandler()],
      ['external_dependency_status', new ExternalDependencyStatusHandler()],
    ]);
  }

  get(kind: SyntheticCheckKind): SyntheticCheckHandler {
    const handler = this.handlers.get(kind);
    if (!handler) {
      throw new Error(`No synthetic check handler registered for ${kind}`);
    }
    return handler;
  }
}

class HttpCheckHandler implements SyntheticCheckHandler {
  constructor(
    readonly kind: 'http_get' | 'http_post',
    private readonly credentials: SyntheticCredentialResolverService,
  ) {}

  async execute(input: {
    expected: Record<string, unknown>;
    target: Record<string, unknown>;
    timeout_ms: number;
  }): Promise<HandlerResult> {
    const started = nowMs();
    const url = stringValue(input.target.url);
    if (!url) return failure('Missing HTTP target URL');
    const headers: Record<string, string> = {
      Accept: '*/*',
      ...(toRecord(input.target.headers) as Record<string, string>),
    };
    for (const [header, envKey] of Object.entries(toRecord(input.target.headers_env))) {
      if (typeof envKey === 'string') headers[header] = this.credentials.resolveEnvKey(envKey);
    }
    const init: RequestInit = {
      headers,
      method: this.kind === 'http_post' ? 'POST' : 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(input.timeout_ms),
    };
    if (this.kind === 'http_post') {
      init.headers = { ...headers, 'Content-Type': 'application/json' };
      init.body = JSON.stringify(this.credentials.resolveValue(input.target.body ?? {}));
    }

    try {
      const response = await fetch(url, init);
      const body = await response.text();
      const latency = nowMs() - started;
      const statusCodes = numberArray(input.expected.status_codes, [200]);
      const maxLatency = numberValue(input.expected.max_latency_ms, 3000);
      const regex = stringValue(input.expected.body_regex);
      const matchesBody = regex ? new RegExp(regex).test(body) : true;
      const status =
        statusCodes.includes(response.status) && latency <= maxLatency && matchesBody
          ? 'passed'
          : 'failed';

      await this.logoutIfConfigured(input.expected, response, input.timeout_ms);

      return {
        status,
        latency_ms: latency,
        response_status_code: response.status,
        response_body: body,
        failure_detail:
          status === 'passed'
            ? undefined
            : {
                expected_status_codes: statusCodes,
                latency_ms: latency,
                max_latency_ms: maxLatency,
                status_code: response.status,
                body_regex_matched: matchesBody,
              },
      };
    } catch (err: unknown) {
      return {
        status: 'error',
        latency_ms: nowMs() - started,
        failure_detail: { message: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  private async logoutIfConfigured(
    expected: Record<string, unknown>,
    response: Response,
    timeoutMs: number,
  ): Promise<void> {
    const logoutUrl = stringValue(expected.logout_url);
    if (!logoutUrl) return;
    const cookie = response.headers.get('set-cookie');
    await fetch(logoutUrl, {
      headers: cookie ? { Cookie: cookie } : undefined,
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
    }).catch(() => undefined);
  }
}

class WebsocketHandshakeHandler implements SyntheticCheckHandler {
  readonly kind = 'websocket_handshake' as const;

  constructor(private readonly credentials: SyntheticCredentialResolverService) {}

  async execute(input: {
    expected: Record<string, unknown>;
    target: Record<string, unknown>;
    timeout_ms: number;
  }): Promise<HandlerResult> {
    const started = nowMs();
    const rawUrl = stringValue(input.target.url);
    if (!rawUrl) return failure('Missing websocket target URL');
    const url = new URL(rawUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:'));
    url.pathname = `${url.pathname.replace(/\/$/, '')}/socket.io/`;
    url.searchParams.set('EIO', '4');
    url.searchParams.set('transport', 'polling');
    for (const [key, envKey] of Object.entries(toRecord(input.target.auth_env))) {
      if (typeof envKey === 'string')
        url.searchParams.set(key, this.credentials.resolveEnvKey(envKey));
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(input.timeout_ms) });
      const body = await response.text();
      const latency = nowMs() - started;
      const maxLatency = numberValue(input.expected.max_latency_ms, 3000);
      return {
        status: response.ok && latency <= maxLatency ? 'passed' : 'failed',
        latency_ms: latency,
        response_status_code: response.status,
        response_body: body,
        failure_detail:
          response.ok && latency <= maxLatency
            ? undefined
            : { status_code: response.status, latency_ms: latency, max_latency_ms: maxLatency },
      };
    } catch (err: unknown) {
      return {
        status: 'error',
        latency_ms: nowMs() - started,
        failure_detail: { message: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}

class QueueCanaryHandler implements SyntheticCheckHandler {
  readonly kind = 'queue_canary' as const;

  constructor(private readonly configService: ConfigService) {}

  async execute(input: {
    expected: Record<string, unknown>;
    target: Record<string, unknown>;
    timeout_ms: number;
  }): Promise<HandlerResult> {
    const queueKind = stringValue(input.target.queue_kind);
    const queueName =
      queueKind === 'synthetic_canary'
        ? SYNTHETIC_CANARY_QUEUE
        : stringValue(input.target.queue_name);
    if (!queueName || (queueKind === 'critical_queue_canary' && !CRITICAL_QUEUES.has(queueName))) {
      return failure('Invalid synthetic queue canary target');
    }
    const connection = this.redisConnection();
    const queue = new Queue(queueName, { connection });
    const events = new QueueEvents(queueName, { connection });
    const canaryId = randomUUID();
    const started = nowMs();
    try {
      await events.waitUntilReady();
      const job = await queue.add(
        queueKind === 'synthetic_canary' ? SYNTHETIC_CANARY_JOB : CRITICAL_CANARY_JOB,
        {
          _synthetic: true,
          canary_id: canaryId,
          tenant_id: SYNTHETIC_TENANT_SENTINEL,
        },
        { jobId: `synthetic:${canaryId}`, removeOnComplete: 10, removeOnFail: 10 },
      );
      await (job as Job).waitUntilFinished(events, input.timeout_ms);
      const latency = nowMs() - started;
      const maxLatency = numberValue(input.expected.max_latency_ms, 3000);
      return {
        status: latency <= maxLatency ? 'passed' : 'degraded',
        latency_ms: latency,
        failure_detail:
          latency <= maxLatency ? undefined : { latency_ms: latency, max_latency_ms: maxLatency },
      };
    } catch (err: unknown) {
      return {
        status: 'failed',
        latency_ms: nowMs() - started,
        failure_detail: { message: err instanceof Error ? err.message : String(err) },
      };
    } finally {
      await Promise.all([queue.close(), events.close()]);
    }
  }

  private redisConnection() {
    const redisUrl = new URL(
      this.configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
    );
    return {
      host: redisUrl.hostname,
      password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
      port: Number.parseInt(redisUrl.port || '6379', 10),
    };
  }
}

class NotificationSelfTestHandler implements SyntheticCheckHandler {
  readonly kind = 'notification_self_test' as const;

  constructor(private readonly credentials: SyntheticCredentialResolverService) {}

  async execute(input: {
    expected: Record<string, unknown>;
    target: Record<string, unknown>;
    timeout_ms: number;
  }): Promise<HandlerResult> {
    const started = nowMs();
    const channel = stringValue(input.target.channel);
    const sinkEnv = stringValue(input.target.sink_env);
    if (!channel || !sinkEnv) return failure('Missing notification self-test channel or sink env');
    const sink = this.credentials.resolveEnvKey(sinkEnv);
    if (channel !== 'resend') {
      return {
        status: 'degraded',
        latency_ms: nowMs() - started,
        failure_detail: { message: `${channel} self-test is configured but not enabled in 5A` },
      };
    }
    const apiKey = this.credentials.resolveEnvKey('RESEND_API_KEY');
    try {
      const response = await fetch('https://api.resend.com/emails', {
        body: JSON.stringify({
          from: 'EduPod Monitoring <monitoring@edupod.app>',
          html: '<p>EduPod synthetic monitoring ping.</p>',
          subject: 'EduPod synthetic monitoring ping',
          to: sink,
        }),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(input.timeout_ms),
      });
      const body = await response.text();
      return {
        status: response.ok ? 'passed' : 'failed',
        latency_ms: nowMs() - started,
        response_status_code: response.status,
        response_body: body,
        failure_detail: response.ok ? undefined : { status_code: response.status },
      };
    } catch (err: unknown) {
      return {
        status: 'error',
        latency_ms: nowMs() - started,
        failure_detail: { message: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}

class DnsLookupHandler implements SyntheticCheckHandler {
  readonly kind = 'dns_lookup' as const;

  async execute(input: {
    expected: Record<string, unknown>;
    target: Record<string, unknown>;
    timeout_ms: number;
  }): Promise<HandlerResult> {
    const started = nowMs();
    const hostname = stringValue(input.target.hostname);
    if (!hostname) return failure('Missing DNS hostname');
    try {
      const records = await resolveDnsRecords(
        hostname,
        stringValue(input.target.record_type) ?? 'A',
      );
      const min = numberValue(input.expected.record_count_min, 1);
      const latency = nowMs() - started;
      return {
        status: records.length >= min ? 'passed' : 'failed',
        latency_ms: latency,
        response_body: JSON.stringify(records),
        failure_detail:
          records.length >= min
            ? undefined
            : { record_count: records.length, record_count_min: min },
      };
    } catch (err: unknown) {
      return {
        status: 'failed',
        latency_ms: nowMs() - started,
        failure_detail: { message: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}

class TlsCheckHandler implements SyntheticCheckHandler {
  readonly kind = 'tls_check' as const;

  async execute(input: {
    expected: Record<string, unknown>;
    target: Record<string, unknown>;
    timeout_ms: number;
  }): Promise<HandlerResult> {
    const started = nowMs();
    const hostname = stringValue(input.target.hostname);
    const port = numberValue(input.target.port, 443);
    if (!hostname) return failure('Missing TLS hostname');
    return new Promise<HandlerResult>((resolve) => {
      const socket = tlsConnect(
        { host: hostname, port, servername: hostname, timeout: input.timeout_ms },
        () => {
          const cert = socket.getPeerCertificate();
          const notAfter = cert.valid_to ? new Date(cert.valid_to) : null;
          const notBefore = cert.valid_from ? new Date(cert.valid_from) : null;
          const daysUntilExpiry = notAfter
            ? Math.ceil((notAfter.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
            : null;
          const warningDays = numberValue(input.expected.warning_days, 14);
          const criticalDays = numberValue(input.expected.critical_days, 3);
          const checkStatus =
            daysUntilExpiry === null
              ? 'invalid_chain'
              : daysUntilExpiry <= 0
                ? 'expired'
                : daysUntilExpiry <= warningDays
                  ? 'expiring_soon'
                  : 'ok';
          const status =
            daysUntilExpiry !== null && daysUntilExpiry > criticalDays
              ? daysUntilExpiry <= warningDays
                ? 'degraded'
                : 'passed'
              : 'failed';
          socket.end();
          resolve({
            status,
            latency_ms: nowMs() - started,
            certificate: {
              check_status: checkStatus,
              days_until_expiry: daysUntilExpiry,
              hostname,
              issuer: cert.issuer ? JSON.stringify(cert.issuer).slice(0, 255) : null,
              not_after: notAfter,
              not_before: notBefore,
              subject: cert.subject ? JSON.stringify(cert.subject).slice(0, 255) : null,
            },
            failure_detail:
              status === 'passed' ? undefined : { days_until_expiry: daysUntilExpiry },
          });
        },
      );
      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          status: 'error',
          latency_ms: nowMs() - started,
          certificate: {
            check_error: 'TLS socket timed out',
            check_status: 'fetch_error',
            hostname,
          },
          failure_detail: { message: 'TLS socket timed out' },
        });
      });
      socket.on('error', (err) => {
        resolve({
          status: 'error',
          latency_ms: nowMs() - started,
          certificate: { check_error: err.message, check_status: 'fetch_error', hostname },
          failure_detail: { message: err.message },
        });
      });
    });
  }
}

class ExternalDependencyStatusHandler implements SyntheticCheckHandler {
  readonly kind = 'external_dependency_status' as const;

  async execute(input: {
    expected: Record<string, unknown>;
    target: Record<string, unknown>;
    timeout_ms: number;
  }): Promise<HandlerResult> {
    const started = nowMs();
    const url = stringValue(input.target.url);
    const providerKey = stringValue(input.target.provider_key);
    const displayName = stringValue(input.target.display_name);
    const source = stringValue(input.target.source);
    if (!url || !providerKey || !displayName || !source) {
      return failure('Missing external dependency status target');
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(input.timeout_ms) });
      const body = await response.text();
      const normalized = normalizeProviderStatus(body);
      const operational = stringArray(input.expected.operational_indicators, ['operational']);
      return {
        status: response.ok && operational.includes(normalized) ? 'passed' : 'failed',
        latency_ms: nowMs() - started,
        response_status_code: response.status,
        response_body: body,
        external_dependency: {
          display_name: displayName,
          provider_key: providerKey,
          source,
          status: normalized,
          status_detail: normalized,
          upstream_url: url,
        },
        failure_detail:
          response.ok && operational.includes(normalized)
            ? undefined
            : { provider_status: normalized, status_code: response.status },
      };
    } catch (err: unknown) {
      return {
        status: 'error',
        latency_ms: nowMs() - started,
        external_dependency: {
          display_name: displayName,
          provider_key: providerKey,
          source,
          status: 'unknown',
          status_detail: err instanceof Error ? err.message : String(err),
          upstream_url: url,
        },
        failure_detail: { message: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}

function normalizeProviderStatus(body: string): string {
  try {
    const parsed = JSON.parse(body) as { status?: { indicator?: string; description?: string } };
    const indicator = parsed.status?.indicator ?? parsed.status?.description;
    if (!indicator) return 'unknown';
    const normalized = indicator.toLowerCase().replace(/\s+/g, '_');
    if (normalized.includes('major')) return 'major_outage';
    if (normalized.includes('partial')) return 'partial_outage';
    if (normalized.includes('degraded')) return 'degraded';
    if (normalized.includes('operational') || normalized === 'none') return 'operational';
    return normalized.slice(0, 40);
  } catch {
    const digest = createHash('sha256').update(body).digest('hex');
    return digest ? 'unknown' : 'unknown';
  }
}

async function resolveDnsRecords(hostname: string, recordType: string): Promise<string[]> {
  if (recordType === 'AAAA') return resolve6(hostname);
  if (recordType === 'CNAME') return resolveCname(hostname);
  if (recordType === 'MX') {
    const records = await resolveMx(hostname);
    return records.map((record) => `${record.priority} ${record.exchange}`);
  }
  if (recordType === 'TXT') {
    const records = await resolveTxt(hostname);
    return records.map((record) => record.join(''));
  }
  return resolve4(hostname);
}
