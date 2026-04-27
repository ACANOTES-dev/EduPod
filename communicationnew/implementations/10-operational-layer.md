# Implementation 10 — Operational Layer (Sentry + Logging + Metrics + Runbooks)

> **Wave:** 3
> **Depends on:** 01 (schema — webhook events / suppression list / status enum), 03 (`EmailConfigService` / `SmsConfigService` / `WhatsAppConfigService` exist for the wiring step)
> **Restart targets:** API + worker (both consume `CommsLoggerService` + `CommsMetricsService`; worker also publishes dispatch metrics)
> **Worktree only:** NO CI. NO production. Local dev server testing.

---

## Goal

Per `docs/architecture/communication-architecture.md` §3.12, build the per-tenant **observability layer** for the comms module so operations can answer "why aren't tenant X's emails arriving?" in 30 seconds, not 30 minutes of SSH and grep.

This impl ships four orthogonal capabilities and the wiring that consumes them:

1. **Structured logging** — `CommsLoggerService` wraps NestJS `Logger`. Every comms log line carries `tenant_id`, `channel`, `template_key`, `notification_id`, `correlation_id`. JSON in production, human-readable in dev. Direct `console.log` / `Logger.log` from inside the comms code path is forbidden after this impl.
2. **Per-tenant metrics** — `CommsMetricsService` registers Prometheus counters and histograms with full per-tenant labels using the existing `prom-client` registry exposed by `MetricsModule`. Six metrics cover dispatch outcomes, latency, suppression, webhook ingress, template renders, provider errors.
3. **Sentry context helper** — `withCommsContext` wraps comms try/catch in a Sentry scope. Re-throws unchanged. Centralises the `Sentry.setTag` boilerplate so every captureException has `tenant_id`, `channel`, `template_key`, `notification_id`.
4. **Wiring across the comms code path** — dispatch service, providers, worker processor, webhook controller (Impl 06) are updated to use the three new helpers. No direct `Logger.log` survives in `apps/api/src/modules/communications/**` or `apps/worker/src/processors/communications/**`. A custom ESLint rule (`no-direct-logger-in-comms`) enforces this from this impl onward.

Plus the artefacts that turn the metrics into something a human can read:

- A versioned **Grafana dashboard** at `docs/operations/dashboards/communications.json`.
- Three **runbooks** under `docs/runbooks/`: tenant dispatch failures, credential rotation, webhook debugging.

The dispatch engine itself is untouched. This is a pure observability layer added in front of and alongside existing services.

### Key invariants (must hold after this impl ships)

- Every comms log line carries `tenant_id`, `channel` (where applicable), `template_key` (where applicable), `correlation_id` (where the request scope provides one).
- No direct `Logger`, `console.log`, `console.error`, `console.warn`, `console.debug` usage anywhere under `apps/api/src/modules/communications/` or `apps/worker/src/processors/communications/`.
- Per-tenant Sentry tags (`tenant_id`, `channel`, `template_key`, `notification_id`, `feature='communications'`) are set on every comms exception.
- The `/api/metrics` endpoint exposes the new counters/histograms with full per-tenant labels and is gated to internal scrapers (`127.0.0.1` and Kubernetes pod ranges, OR a known internal header).
- The dashboard JSON is versioned in repo — Grafana is not the source of truth.
- Runbooks reference real SQL tables / endpoints / log fields (a CI-style smoke test verifies this; it isn't heavy parsing, but every table name in a runbook must exist in `schema.prisma`).
- **Sensitive data — recipients, message bodies, raw credentials — NEVER appear in info/warn logs.** Last-4 mask only at debug level if redaction context demands it.
- Cardinality of `tenant_id` label is documented as bounded (~hundreds, capped by tenant count).

---

## What to change

### 1. New service — `apps/api/src/modules/communications/comms-logger.service.ts`

The structured logger. Consumes `REQUEST` when available so `tenant_id` and `correlation_id` are auto-pulled inside HTTP scopes; falls back to caller-supplied context inside worker / cron scopes (no request).

```typescript
import { Inject, Injectable, Logger, Optional, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

import type { CommsProviderChannel } from '@school/shared';

/**
 * Required context on every comms log line.
 *
 * `tenant_id` is REQUIRED (we are a multi-tenant platform; an unlabelled
 * comms log line is a defect). The other fields are optional because some
 * code paths (e.g. cache invalidation) don't have a single channel /
 * template in scope.
 */
export interface CommsLogContext {
  tenant_id: string;
  channel?: CommsProviderChannel | 'in_app';
  template_key?: string;
  notification_id?: string;
  correlation_id?: string;
  // Free-form tail — keys are flattened into the JSON record. NEVER put
  // recipient address, plaintext body, or any credential value here.
  [extra: string]: unknown;
}

/**
 * Allowed log levels. Mirrors NestJS Logger's surface.
 */
export type CommsLogLevel = 'log' | 'error' | 'warn' | 'debug';

/**
 * `CommsLoggerService` is the ONLY logging path for code under
 * `apps/api/src/modules/communications/` and
 * `apps/worker/src/processors/communications/` — enforced by the custom
 * ESLint rule `school/no-direct-logger-in-comms`.
 *
 * Construction style mirrors `Logger`: pass the consuming class name to
 * the constructor so log lines are attributable.
 *
 * Request-scoped: when `REQUEST` is injectable (HTTP path), the logger
 * pulls `tenant_id` and `correlation_id` from the request automatically.
 * In worker / cron scopes there is no request, so callers MUST pass
 * `tenant_id` (and ideally `correlation_id`) explicitly.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class CommsLoggerService {
  private readonly logger: Logger;
  private context: string = 'Comms';

  constructor(@Optional() @Inject(REQUEST) private readonly request?: Request) {
    this.logger = new Logger();
  }

  setContext(context: string): this {
    this.context = context;
    this.logger.localInstance?.setContext?.(context);
    return this;
  }

  log(message: string, ctx: CommsLogContext): void {
    this.write('log', message, ctx);
  }

  error(message: string, ctx: CommsLogContext, trace?: string): void {
    this.write('error', message, ctx, trace);
  }

  warn(message: string, ctx: CommsLogContext): void {
    this.write('warn', message, ctx);
  }

  debug(message: string, ctx: CommsLogContext): void {
    this.write('debug', message, ctx);
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private write(level: CommsLogLevel, message: string, ctx: CommsLogContext, trace?: string): void {
    const merged = this.mergeRequestContext(ctx);

    if (process.env.NODE_ENV === 'production') {
      // JSON line for log aggregation (loki / cloudwatch).
      const record: Record<string, unknown> = {
        level,
        msg: message,
        context: this.context,
        ts: new Date().toISOString(),
        ...merged,
      };
      if (trace) record.trace = trace;
      // Use the underlying NestJS logger so request-id / pid prefixes
      // remain consistent across the app.
      this.logger.log(JSON.stringify(record), this.context);
      return;
    }

    // Dev: human-readable single-line format.
    // Format: [Email] tenant=abc-123 template=invoice.issued — Sent successfully
    const channelLabel = merged.channel ? `[${merged.channel}]` : '';
    const tenantLabel = `tenant=${merged.tenant_id}`;
    const templateLabel = merged.template_key ? `template=${merged.template_key}` : '';
    const corrLabel = merged.correlation_id ? `corr=${merged.correlation_id}` : '';
    const notifLabel = merged.notification_id ? `notif=${merged.notification_id}` : '';
    const tags = [tenantLabel, templateLabel, notifLabel, corrLabel].filter(Boolean).join(' ');
    const formatted = `${channelLabel} ${tags} — ${message}`.trim();

    switch (level) {
      case 'log':
        this.logger.log(formatted, this.context);
        break;
      case 'error':
        this.logger.error(formatted, trace, this.context);
        break;
      case 'warn':
        this.logger.warn(formatted, this.context);
        break;
      case 'debug':
        this.logger.debug(formatted, this.context);
        break;
    }
  }

  private mergeRequestContext(ctx: CommsLogContext): CommsLogContext {
    if (!this.request) return ctx;
    // Pull tenant + correlation from request only if the caller didn't
    // pass them explicitly — caller-supplied context wins.
    const out: CommsLogContext = { ...ctx };
    const reqAny = this.request as unknown as {
      tenantContext?: { tenant_id?: string };
      correlation_id?: string;
      headers?: { 'x-correlation-id'?: string };
    };
    if (!out.tenant_id && reqAny.tenantContext?.tenant_id) {
      out.tenant_id = reqAny.tenantContext.tenant_id;
    }
    if (!out.correlation_id) {
      out.correlation_id =
        reqAny.correlation_id ?? reqAny.headers?.['x-correlation-id'] ?? undefined;
    }
    return out;
  }
}
```

Notes:

- `Scope.TRANSIENT` so each consuming class gets its own instance with its own `setContext(...)` label without leaking the request-scoped REQUEST proxy across modules.
- The logger writes the JSON record through the underlying `Logger` so the existing NestJS request-id middleware doesn't lose the prefix. We don't bypass NestJS's logger entirely.
- We never log credentials. The `[extra: string]: unknown` spread is convenient but is the most likely place for accidental leakage — code review enforces, and the ESLint rule from §3 catches direct `console.log` calls that would bypass this entirely.

---

### 2. New service — `apps/api/src/modules/communications/comms-metrics.service.ts`

Registers six Prometheus counters/histograms on the **shared** `prom-client` global registry (so the existing `/metrics` endpoint exposes them). The existing `MetricsService` (`apps/api/src/modules/metrics/metrics.service.ts`) keeps its own `Registry` for HTTP metrics and exports `getMetrics()` on it; we extend `MetricsService` with one method (`getCommsRegistry()`) to share state, OR — preferred — switch the comms service to register on the same registry by accepting the registry from `MetricsService`.

```typescript
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Histogram, type Registry } from 'prom-client';

import { COMMS_PROVIDER_CHANNELS, type CommsProviderChannel } from '@school/shared';

import { MetricsService } from '../metrics/metrics.service';

const ALL_CHANNELS = [...COMMS_PROVIDER_CHANNELS, 'in_app'] as const;
type AnyChannel = (typeof ALL_CHANNELS)[number];

const DISPATCH_STATUSES = ['sent', 'delivered', 'failed', 'suppressed', 'skipped'] as const;
type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

const SUPPRESSION_REASONS = [
  'hard_bounce',
  'soft_bounce_threshold',
  'complaint',
  'manual',
  'unsubscribe',
] as const;
type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

const DISPATCH_DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;

/**
 * Per-tenant Prometheus metrics for the comms module.
 *
 * **Cardinality note:** `tenant_id` is high-cardinality but BOUNDED — capped
 * by the number of tenants on the platform (target ≤ 200 in V1, hard
 * production cap ~hundreds before we revisit). Beyond that, switch to a
 * sampling approach: keep tenant labels on the top-K tenants by traffic
 * and bucket the rest as `tenant_id="other"`. Documented in the operational
 * layer's runbook.
 */
@Injectable()
export class CommsMetricsService implements OnModuleInit {
  private dispatched!: Counter<'tenant_id' | 'channel' | 'status'>;
  private dispatchDuration!: Histogram<'tenant_id' | 'channel'>;
  private suppressed!: Counter<'tenant_id' | 'channel' | 'reason'>;
  private webhookReceived!: Counter<'tenant_id' | 'channel' | 'event_type' | 'signature_valid'>;
  private templateRenders!: Counter<'tenant_id' | 'channel' | 'template_key' | 'locale'>;
  private providerErrors!: Counter<'tenant_id' | 'channel' | 'error_code'>;

  constructor(@Inject(MetricsService) private readonly metricsService: MetricsService) {}

  onModuleInit(): void {
    const registry = this.metricsService.getCommsRegistry();

    this.dispatched = new Counter({
      name: 'notifications_dispatched_total',
      help: 'Total notifications dispatched by channel and outcome.',
      labelNames: ['tenant_id', 'channel', 'status'] as const,
      registers: [registry],
    });

    this.dispatchDuration = new Histogram({
      name: 'notifications_dispatch_duration_seconds',
      help: 'Duration of provider dispatch calls in seconds.',
      labelNames: ['tenant_id', 'channel'] as const,
      buckets: [...DISPATCH_DURATION_BUCKETS],
      registers: [registry],
    });

    this.suppressed = new Counter({
      name: 'notifications_suppressed_total',
      help: 'Notifications skipped because the recipient is on the suppression list.',
      labelNames: ['tenant_id', 'channel', 'reason'] as const,
      registers: [registry],
    });

    this.webhookReceived = new Counter({
      name: 'notifications_webhook_received_total',
      help: 'Inbound webhook events received (Resend / Twilio status callbacks).',
      labelNames: ['tenant_id', 'channel', 'event_type', 'signature_valid'] as const,
      registers: [registry],
    });

    this.templateRenders = new Counter({
      name: 'notifications_template_renders_total',
      help: 'Template renders by template key and locale.',
      labelNames: ['tenant_id', 'channel', 'template_key', 'locale'] as const,
      registers: [registry],
    });

    this.providerErrors = new Counter({
      name: 'notifications_provider_errors_total',
      help: 'Provider-side errors mapped to error codes (Resend status / Twilio error codes).',
      labelNames: ['tenant_id', 'channel', 'error_code'] as const,
      registers: [registry],
    });
  }

  // ─── Recording API ─────────────────────────────────────────────────────

  recordDispatch(
    tenantId: string,
    channel: AnyChannel,
    status: DispatchStatus,
    durationMs: number,
  ): void {
    this.dispatched.inc({ tenant_id: tenantId, channel, status });
    this.dispatchDuration.observe({ tenant_id: tenantId, channel }, Math.max(0, durationMs) / 1000);
  }

  recordSuppression(tenantId: string, channel: AnyChannel, reason: SuppressionReason): void {
    this.suppressed.inc({ tenant_id: tenantId, channel, reason });
  }

  recordWebhook(
    tenantId: string,
    channel: AnyChannel,
    eventType: string,
    signatureValid: boolean,
  ): void {
    this.webhookReceived.inc({
      tenant_id: tenantId,
      channel,
      event_type: eventType,
      signature_valid: String(signatureValid),
    });
  }

  recordTemplateRender(
    tenantId: string,
    channel: AnyChannel,
    templateKey: string,
    locale: string,
  ): void {
    this.templateRenders.inc({
      tenant_id: tenantId,
      channel,
      template_key: templateKey,
      locale,
    });
  }

  recordProviderError(tenantId: string, channel: AnyChannel, errorCode: string): void {
    this.providerErrors.inc({ tenant_id: tenantId, channel, error_code: errorCode });
  }
}
```

#### Tiny update to `MetricsService`

Make the existing `Registry` accessible to comms metrics. Add one method; do NOT split state.

```typescript
// apps/api/src/modules/metrics/metrics.service.ts (existing file — add one accessor)

  /**
   * Returns the shared registry so other modules can register their own
   * metrics on a single endpoint. Used by `CommsMetricsService` to expose
   * comms counters/histograms via the same `/api/metrics` endpoint as
   * HTTP metrics.
   */
  getCommsRegistry(): Registry {
    return this.registry;
  }
```

Verify in §5's local run that hitting `/api/metrics` shows the new comms metrics alongside the existing HTTP metrics.

---

### 3. New helper — `apps/api/src/modules/communications/comms-sentry.helper.ts`

Pure utility — no class, no DI, no Nest module entry. Keeps the body of every comms try/catch terse and forces consistent tagging.

```typescript
import * as Sentry from '@sentry/nestjs';

import type { CommsProviderChannel } from '@school/shared';

/**
 * Fields tagged on every comms-originated Sentry capture.
 *
 * `tenant_id` is REQUIRED — anything without it can't be triaged
 * per-tenant. Other fields are best-effort — pass what you have in scope.
 */
export interface CommsSentryContext {
  tenant_id: string;
  channel?: CommsProviderChannel | 'in_app';
  template_key?: string;
  notification_id?: string;
}

/**
 * Wrap a comms code block in a Sentry scope that pre-sets the comms tags.
 * If `fn` throws, the exception is captured WITH the scope already set,
 * then re-thrown unchanged so caller-side error handling is unaffected.
 *
 * Use this in place of raw `Sentry.captureException(err)` everywhere in
 * the comms code path (providers, dispatch service, worker processors,
 * webhook handlers). A code-review checklist enforces it; the ESLint
 * rule from §4 catches the most common bypass (direct
 * `Sentry.captureException` calls without a surrounding scope).
 */
export async function withCommsContext<T>(
  context: CommsSentryContext,
  fn: () => Promise<T>,
): Promise<T> {
  return Sentry.withScope(async (scope) => {
    scope.setTag('feature', 'communications');
    scope.setTag('tenant_id', context.tenant_id);
    if (context.channel) scope.setTag('channel', context.channel);
    if (context.template_key) scope.setTag('template_key', context.template_key);
    if (context.notification_id) scope.setTag('notification_id', context.notification_id);

    try {
      return await fn();
    } catch (err) {
      Sentry.captureException(err);
      throw err;
    }
  });
}

/**
 * Synchronous variant for the rare comms path that doesn't await
 * (e.g. a logger fallback that throws). Mirrors `withCommsContext`
 * one-for-one minus the `await`.
 */
export function withCommsContextSync<T>(context: CommsSentryContext, fn: () => T): T {
  return Sentry.withScope((scope) => {
    scope.setTag('feature', 'communications');
    scope.setTag('tenant_id', context.tenant_id);
    if (context.channel) scope.setTag('channel', context.channel);
    if (context.template_key) scope.setTag('template_key', context.template_key);
    if (context.notification_id) scope.setTag('notification_id', context.notification_id);

    try {
      return fn();
    } catch (err) {
      Sentry.captureException(err);
      throw err;
    }
  });
}
```

#### Bootstrap-time tag

In `apps/api/src/instrument.ts` (existing file), the global Sentry init runs before NestJS starts. Add a one-liner so every event in the API process is tagged with `feature=communications` whenever it originates from a request that ends up in a comms route. Easier path: the helper sets this tag inside the scope, so we don't need a global tag — every comms capture is already scoped.

If a future event (e.g. a worker startup error) needs a process-level tag, add `Sentry.setTag('service', 'comms-worker')` in `apps/worker/src/instrument.ts`. Out of scope for this impl unless the wiring requires it.

---

### 4. New ESLint rule — `packages/eslint-config/rules/no-direct-logger-in-comms.js`

Enforces the rule that comms code uses `CommsLoggerService` exclusively. Applies to files under `apps/api/src/modules/communications/` and `apps/worker/src/processors/communications/`. Flags:

- `import { Logger } from '@nestjs/common'` — disallowed within scope
- `new Logger(...)` — disallowed within scope
- `console.log`, `console.error`, `console.warn`, `console.debug`, `console.info` — disallowed within scope

```javascript
// packages/eslint-config/rules/no-direct-logger-in-comms.js

const path = require('path');

const SCOPE_PATTERNS = [
  /apps[\\/]api[\\/]src[\\/]modules[\\/]communications[\\/]/,
  /apps[\\/]worker[\\/]src[\\/]processors[\\/]communications[\\/]/,
];

const FORBIDDEN_CONSOLE = new Set(['log', 'error', 'warn', 'debug', 'info']);

function isInScope(filename) {
  if (!filename) return false;
  // Test files are exempt — we mock both the Nest Logger and CommsLoggerService.
  if (/\.spec\.[jt]sx?$/.test(filename) || /\.test\.[jt]sx?$/.test(filename)) {
    return false;
  }
  // The CommsLoggerService implementation IS allowed to import Logger.
  if (filename.endsWith(path.join('communications', 'comms-logger.service.ts'))) {
    return false;
  }
  return SCOPE_PATTERNS.some((re) => re.test(filename));
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct `Logger` / `console.*` usage inside comms code. Use CommsLoggerService instead so every log line carries tenant_id, channel, template_key, and correlation_id.',
    },
    messages: {
      noNestLoggerImport:
        'Import { CommsLoggerService } from "./comms-logger.service" (or a relative path) instead of NestJS Logger inside comms code.',
      noNestLoggerCtor:
        'Do not instantiate `new Logger(...)` inside comms code. Inject `CommsLoggerService` and call `setContext(<className>)` on it.',
      noConsole:
        'Do not use console.{{method}} inside comms code. Use CommsLoggerService.{log,error,warn,debug} so structured fields are preserved.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();
    if (!isInScope(filename)) return {};

    return {
      // import { Logger } from '@nestjs/common';
      ImportDeclaration(node) {
        if (node.source.value !== '@nestjs/common') return;
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier' && spec.imported.name === 'Logger') {
            context.report({ node: spec, messageId: 'noNestLoggerImport' });
          }
        }
      },
      // new Logger(...)
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'Logger') {
          context.report({ node, messageId: 'noNestLoggerCtor' });
        }
      },
      // console.log / console.error / console.warn / console.debug / console.info
      MemberExpression(node) {
        if (
          node.object.type === 'Identifier' &&
          node.object.name === 'console' &&
          node.property.type === 'Identifier' &&
          FORBIDDEN_CONSOLE.has(node.property.name)
        ) {
          context.report({
            node,
            messageId: 'noConsole',
            data: { method: node.property.name },
          });
        }
      },
    };
  },
};
```

Wire into the plugin:

```javascript
// packages/eslint-config/plugin.js — add the require + the rule entry
const noDirectLoggerInComms = require('./rules/no-direct-logger-in-comms');
// ...
module.exports = {
  rules: {
    // ...existing rules...
    'no-direct-logger-in-comms': noDirectLoggerInComms,
  },
};
```

Enable it in the API and worker eslint configs as `error`. The existing tests for sibling custom rules (e.g. `no-unguarded-survey-access.test.js`) provide the pattern for the rule's unit test.

---

### 5. Wiring across the comms code path

This is the bulk of the impl. Replace direct `Logger` usage and add metric/sentry hooks at the four anchor points. Each change is small and surgical.

#### 5a. `notification-dispatch.service.ts`

Inject `CommsLoggerService` and `CommsMetricsService`. Replace the existing `private readonly logger = new Logger(...)`. Wrap the outermost provider call in `withCommsContext`. Record the dispatch outcome and duration.

Pattern (sketch — adapt to the real method shape):

```typescript
constructor(
  // ...existing deps...
  private readonly commsLogger: CommsLoggerService,
  private readonly metrics: CommsMetricsService,
) {
  this.commsLogger.setContext(NotificationDispatchService.name);
}

async dispatchWithFallback(notificationId: string): Promise<void> {
  const start = Date.now();
  const notification = /* ...existing read... */;
  if (!notification) return;

  const ctx = {
    tenant_id: notification.tenant_id,
    channel: notification.channel,
    template_key: notification.template_key ?? undefined,
    notification_id: notification.id,
  };

  try {
    await withCommsContext(ctx, async () => {
      // ...existing dispatch switch...
    });
    this.metrics.recordDispatch(
      notification.tenant_id,
      notification.channel,
      'sent',
      Date.now() - start,
    );
    this.commsLogger.log('Dispatched successfully', ctx);
  } catch (err) {
    this.metrics.recordDispatch(
      notification.tenant_id,
      notification.channel,
      'failed',
      Date.now() - start,
    );
    this.commsLogger.error(
      `Dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
      ctx,
      err instanceof Error ? err.stack : undefined,
    );
    throw err;
  }
}
```

When the dispatch path detects suppression or `channel_not_configured` (Impl 04 / Impl 06 added these branches), call `recordDispatch(..., 'suppressed' | 'skipped', ...)` and `recordSuppression(...)` accordingly.

#### 5b. Each provider — `resend-email.provider.ts`, `twilio-sms.provider.ts`, `twilio-whatsapp.provider.ts`

Replace `private readonly logger = new Logger(...)` with `CommsLoggerService`. Wrap external HTTP calls with `withCommsContext`. On provider error, call `recordProviderError(tenantId, channel, errorCode)` with the Resend HTTP status or Twilio `code` mapped to a string label.

Concrete provider error mapping (single source of truth, re-exported from `@school/shared/constants/communications.ts`):

```typescript
export const PROVIDER_ERROR_CODES = {
  // Resend (HTTP statuses we map; everything else maps to 'unknown')
  RESEND_RATE_LIMITED: 'resend.rate_limited', // HTTP 429
  RESEND_INVALID_KEY: 'resend.invalid_key', // HTTP 401
  RESEND_BAD_REQUEST: 'resend.bad_request', // HTTP 400
  RESEND_DOMAIN_UNVERIFIED: 'resend.domain_unverified', // HTTP 422 (specific reason)
  RESEND_UNKNOWN: 'resend.unknown',
  // Twilio (https://www.twilio.com/docs/api/errors — mapping is bounded)
  TWILIO_INVALID_NUMBER: 'twilio.21211',
  TWILIO_NUMBER_BLOCKED: 'twilio.21610',
  TWILIO_AUTH_FAILED: 'twilio.20003',
  TWILIO_BAD_PARAMETER: 'twilio.21201',
  TWILIO_RATE_LIMITED: 'twilio.20429',
  TWILIO_UNKNOWN: 'twilio.unknown',
} as const;
```

The mapping helper itself lives in `apps/api/src/modules/communications/providers/provider-error-mapping.ts` and is small — a switch on Resend HTTP status / Twilio error code returning the constant. Keeps cardinality bounded.

#### 5c. Worker — `apps/worker/src/processors/communications/dispatch-notifications.processor.ts`

Worker-side mirror of the API-side wiring. The worker has no `REQUEST` scope, so `tenant_id` and `correlation_id` MUST be passed to `commsLogger` explicitly from the job payload. The job already carries `tenant_id` per the worker rules (see `.claude/rules/worker.md`); use the BullMQ `job.id` as `correlation_id` so log lines can be joined with API-side traces.

```typescript
// apps/worker/src/processors/communications/dispatch-notifications.processor.ts
async process(job: Job<DispatchPayload>): Promise<void> {
  const ctx = {
    tenant_id: job.data.tenant_id,
    channel: job.data.channel,
    template_key: job.data.template_key,
    notification_id: job.data.notification_id,
    correlation_id: `bull:${job.id}`,
  };

  await withCommsContext(ctx, async () => {
    const start = Date.now();
    try {
      await /* existing dispatch logic */;
      this.metrics.recordDispatch(
        ctx.tenant_id,
        ctx.channel,
        'sent',
        Date.now() - start,
      );
      this.commsLogger.log('Worker dispatch succeeded', ctx);
    } catch (err) {
      this.metrics.recordDispatch(
        ctx.tenant_id,
        ctx.channel,
        'failed',
        Date.now() - start,
      );
      this.commsLogger.error(
        `Worker dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
        ctx,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
  });
}
```

The worker module imports `CommsLoggerService`, `CommsMetricsService`, and the `MetricsModule` from the API side. Since `apps/worker` is a sibling NestJS app, follow the existing pattern: register the services as providers in `apps/worker/src/worker.module.ts` directly (the worker re-uses individual API module classes today; this is established).

#### 5d. Webhook controller (Impl 06 owns the file)

Impl 06 ships `apps/api/src/modules/communications/webhooks/communications-webhooks.controller.ts`. This impl adds the metrics call AFTER signature verification:

```typescript
this.metrics.recordWebhook(tenantId, channel, eventType, signatureVerified);
```

Plus a `commsLogger.log` line at every successful ingest and a `commsLogger.warn` on signature failure. This is a **shared-file edit** with Impl 06 — coordinate via Rule 17. Impl 06 lands first (it's authoring the file); this impl layers in the observability hooks as a follow-on commit on top of Impl 06's work.

---

### 6. Metrics endpoint — verify gating

The existing `/api/metrics` endpoint (`apps/api/src/modules/metrics/metrics.controller.ts`) already exposes the `prom-client` registry. With the comms registry sharing pattern above, the new comms counters automatically appear on the same response.

#### Verify gating

If the endpoint is currently unauthenticated and ungated, add a guard or middleware that allows ONLY:

- `127.0.0.1` and `::1` (loopback)
- The Kubernetes pod CIDR (`10.0.0.0/8` is too broad in practice; check `kubernetes.io/service-name` label header or use the configured cluster CIDR via env)
- A header-based bypass for Prometheus configured with a known internal token: `X-Metrics-Auth: <env-loaded-secret>`

Implementation outline (add to `metrics.controller.ts` as a guard, not as a separate filter, so all access goes through one place):

```typescript
// apps/api/src/modules/metrics/metrics-access.guard.ts (NEW)
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

const ALLOWED_LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

@Injectable()
export class MetricsAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    if (ALLOWED_LOOPBACK.has(ip)) return true;

    const expectedToken = process.env.METRICS_INTERNAL_TOKEN;
    const presented = req.header('x-metrics-auth');
    if (expectedToken && presented && presented === expectedToken) return true;

    return false;
  }
}
```

Register on the controller:

```typescript
@SkipThrottle()
@UseGuards(MetricsAccessGuard)
@Controller('metrics')
export class MetricsController { ... }
```

Add `METRICS_INTERNAL_TOKEN` to `.env.example` with a generated value placeholder. Document in §9 (Local verification) that tests against `/api/metrics` without the token from a non-loopback origin must return 403.

> **Pre-launch note (per `.claude/rules/pre-launch-tracking.md`):** the pod-CIDR allowlist is left as a follow-up. Loopback + token covers local dev and the production reverse-proxy scrape pattern. Add to `docs/operations/PRE-LAUNCH-CHECKLIST.md` Part 5 if not already tracked.

---

### 7. Grafana dashboard — `docs/operations/dashboards/communications.json`

Versioned with the codebase. The dashboard file is a Grafana 10.x export with `templating.list[]` for the `tenant` and `channel` variables and `panels[]` for the five required panels.

#### Variables

```json
"templating": {
  "list": [
    {
      "name": "tenant",
      "type": "query",
      "datasource": { "type": "prometheus" },
      "query": "label_values(notifications_dispatched_total, tenant_id)",
      "includeAll": true,
      "multi": true,
      "current": { "selected": false, "text": "All", "value": "$__all" }
    },
    {
      "name": "channel",
      "type": "query",
      "datasource": { "type": "prometheus" },
      "query": "label_values(notifications_dispatched_total, channel)",
      "includeAll": true,
      "multi": true,
      "current": { "selected": false, "text": "All", "value": "$__all" }
    }
  ]
}
```

#### Panels (five, exact PromQL)

1. **Dispatch rate per channel per tenant (last 24h)** — `timeseries`:

   ```promql
   sum by (tenant_id, channel) (rate(notifications_dispatched_total{tenant_id=~"$tenant", channel=~"$channel"}[5m]))
   ```

   Y-axis: messages/sec. Legend: `{{tenant_id}} / {{channel}}`.

2. **Failure rate % per channel (rolling 1h)** — `timeseries`:

   ```promql
   100 * sum by (channel) (rate(notifications_dispatched_total{status="failed", channel=~"$channel"}[1h]))
   /
   sum by (channel) (rate(notifications_dispatched_total{channel=~"$channel"}[1h]))
   ```

   Threshold: red above 5%, amber above 1%.

3. **Webhook ingest rate + signature failure rate** — two stacked `timeseries`:

   ```promql
   # Top: ingest rate
   sum by (channel, event_type) (rate(notifications_webhook_received_total{channel=~"$channel"}[5m]))

   # Bottom: signature failure rate
   sum by (channel) (rate(notifications_webhook_received_total{signature_valid="false", channel=~"$channel"}[5m]))
   ```

4. **Template render heatmap (top templates by tenant)** — `bargauge` or `table`:

   ```promql
   topk(20,
     sum by (tenant_id, template_key, locale) (
       rate(notifications_template_renders_total{tenant_id=~"$tenant"}[1h])
     )
   )
   ```

5. **Per-tenant dispatch latency p95** — `timeseries`:
   ```promql
   histogram_quantile(0.95,
     sum by (tenant_id, channel, le) (
       rate(notifications_dispatch_duration_seconds_bucket{tenant_id=~"$tenant", channel=~"$channel"}[5m])
     )
   )
   ```
   Y-axis: seconds. Legend: `{{tenant_id}} / {{channel}}`.

#### Import procedure (documented in dashboard JSON's top-level "description")

The dashboard description field must contain:

```
Communications module — per-tenant observability.

Importing this dashboard:

1. Grafana UI: Dashboards → New → Import → Upload JSON file (this file).
   Select the Prometheus datasource that scrapes /api/metrics.

2. Grafana provisioning (preferred for production): copy this file to
   /var/lib/grafana/dashboards/communications.json and reference it from
   /etc/grafana/provisioning/dashboards/edupod.yaml. Grafana picks up
   changes on reload.

Source of truth: docs/operations/dashboards/communications.json in the
EduPod repo. Edit there, never in the Grafana UI — UI edits are lost
on the next provisioning sync.
```

The full JSON is ~600 lines. Pin the schema version to Grafana 10.4 (`"schemaVersion": 39`) and `"version": 1` so subsequent edits in repo bump cleanly.

---

### 8. Three runbooks under `docs/runbooks/`

Each runbook is a self-contained markdown file. Format follows the existing runbook style (see `agent-sentry-triage.md` and `monitoring.md`): top-level purpose, "When to use", numbered flow, common-cause table, exact bash / SQL / curl snippets.

#### 8a. `docs/runbooks/comms-tenant-dispatch-failures.md`

````markdown
# Runbook — Tenant reports comms not arriving

**Purpose.** A tenant says "we're not getting any emails / SMS / WhatsApp." Triage in ≤ 10 minutes using the dashboard + a small SQL toolkit. End either (a) a fix shipped or (b) a clean root cause attributed to provider / DNS / customer config.

## Step 1 — Open the dashboard, filter to tenant

Open Grafana → "Communications" dashboard. Set `$tenant` to the tenant's UUID. Look at the last 1 hour:

- **Dispatch rate panel:** is anything being attempted? If zero, the platform is not producing notifications — skip to Step 6 (tenant config status).
- **Failure rate panel:** what's the % failed? If > 5% the failure is real and ongoing.
- **Latency panel:** if p95 has spiked, look at provider status pages first (Resend / Twilio).

## Step 2 — Last 1h failure rate

If failure rate is high, check:

- `notifications_provider_errors_total{tenant_id="<id>"}` by `error_code` — what kind of error?
- If `error_code="resend.invalid_key"` — Step 7 (credential rotation).
- If `error_code="resend.domain_unverified"` — Step 8 (DNS).
- If `error_code="twilio.21610"` (number blocked) — recipient suppressed; check suppression list.
- If `error_code="resend.rate_limited"` or `"twilio.20429"` — provider throttling; back off and re-queue.

## Step 3 — Recent webhook events

```sql
SELECT id, channel, event_type, signature_verified, processing_error, received_at
FROM notification_webhook_events
WHERE tenant_id = '<TENANT_UUID>'
ORDER BY received_at DESC
LIMIT 50;
```
````

Look for:

- `signature_verified = false` rows — provider sent something but our secret is wrong (Step 7).
- `processing_error IS NOT NULL` — our handler crashed; capture the error and file in `agent-fix-log.md`.
- A run of `event_type = 'bounced'` or `'complained'` — the recipient list is unhealthy.

## Step 4 — Bounce / complaint patterns

```sql
SELECT
  channel,
  reason,
  COUNT(*) AS count,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest
FROM notification_suppression_list
WHERE tenant_id = '<TENANT_UUID>'
  AND created_at > now() - interval '7 days'
GROUP BY channel, reason
ORDER BY count DESC;
```

If a single template has flooded the suppression list (e.g. > 50 hard bounces from one template_key in a day), the tenant has a dirty list — they need to clean their parent contact data before re-sending.

## Step 5 — Suppression list growth

```sql
SELECT
  date_trunc('day', created_at) AS day,
  reason,
  COUNT(*) AS additions
FROM notification_suppression_list
WHERE tenant_id = '<TENANT_UUID>'
  AND created_at > now() - interval '14 days'
GROUP BY day, reason
ORDER BY day DESC;
```

A growing curve at +50/day means we are actively damaging our sender reputation. Pause sends to the affected channel until the tenant cleans their list.

## Step 6 — Tenant config status

```sql
SELECT
  'email' AS channel, is_enabled, last_verified_at, key_last_rotated_at
FROM tenant_email_configs WHERE tenant_id = '<TENANT_UUID>'
UNION ALL
SELECT
  'sms', is_enabled, last_verified_at, key_last_rotated_at
FROM tenant_sms_configs WHERE tenant_id = '<TENANT_UUID>'
UNION ALL
SELECT
  'whatsapp', is_enabled, last_verified_at, key_last_rotated_at
FROM tenant_whatsapp_configs WHERE tenant_id = '<TENANT_UUID>';
```

If any row has `is_enabled = false`, the tenant disabled it themselves — this is operating-as-designed. Confirm with the tenant whether this was intentional.

If `last_verified_at` is null or > 30 days old, ask the tenant to re-run "Send test" from `/settings/communications/<channel>`.

## Step 7 — Domain verification status

```sql
SELECT domain, status, spf_status, dkim_status, dmarc_status, last_checked_at, failure_reason
FROM tenant_email_domains
WHERE tenant_id = '<TENANT_UUID>';
```

Any DNS record `failed`: tenant's DNS provider has not been updated. Send them the verbatim record list from `dns_records_json`.

## Step 8 — Trigger verifyConfig from the settings UI

As the operator (logged in as a tenant admin if escalated), navigate to:

- `/settings/communications/email` — click "Send test message", enter a recipient.
- `/settings/communications/sms` — same flow.
- `/settings/communications/whatsapp` — same flow (template required outside service window).

Capture the verbatim error message returned. The UI surfaces the provider error directly per Impl 09.

## Common causes table

| Symptom                                             | Cause                                                                       | Fix                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `resend.invalid_key` errors                         | API key revoked or rotated outside our settings UI                          | Tenant rotates key, updates via `PUT /v1/email-config`                                                           |
| `resend.domain_unverified` errors                   | Tenant added DNS records but they have not propagated, OR records are wrong | Check `tenant_email_domains.dns_records_json` against tenant's DNS; trigger `POST /v1/email-domains/:id/refresh` |
| `twilio.21610` (number blocked)                     | Recipient is in Twilio's blocklist                                          | Add to suppression list manually; do not retry                                                                   |
| Bounce flood from one template                      | Dirty contact data                                                          | Pause that template; tenant cleans data                                                                          |
| `signature_verified = false` for all webhooks       | Provider misconfigured webhook URL or our `webhook_secret` is wrong         | Check tenant config matches the webhook secret in the provider's dashboard                                       |
| Zero dispatch rate but non-zero `notification` rows | Worker stopped or queue backed up                                           | Check `pm2 logs worker`; check BullMQ queue depth                                                                |

## Step 9 — Closing out

If the cause was a tenant misconfiguration: write a short message to the tenant explaining what to do, link the relevant settings page, and STOP — no engineering work needed.

If the cause was a platform bug: open a Sentry issue (the comms tags should already filter to the right tenant), file in `agent-fix-log.md`, fix forward.

````

#### 8b. `docs/runbooks/comms-credential-rotation.md`

```markdown
# Runbook — Rotate a tenant's Resend / Twilio credentials safely

**Purpose.** A tenant rotated their provider key (Resend revoked, Twilio rotated, security incident). They need to push the new key into the platform without losing in-flight notifications. This runbook drives the safe path.

## Pre-conditions

- Tenant admin has the new credentials in hand.
- Both old and new credentials are valid (overlap window) — recommend rotation start before old is revoked, since in-flight jobs use cached old client until eviction.

## Steps

### 1. Tenant updates via Settings UI

- Navigate `/settings/communications/<email|sms|whatsapp>`.
- Paste new credentials into the form. Save.
- The UI calls `PUT /v1/email-config` (or `/sms-config`, `/whatsapp-config`) → service `upsertConfig` writes the encrypted blob and updates `key_last_rotated_at = now()`.

### 2. Cache invalidation propagates

- `upsertConfig` publishes `comms:config-changed` Redis event with `{ tenant_id, channel }`.
- Both API and worker subscribers receive the event and call `clientCache.invalidate(tenantId)` per Impl 04.
- New dispatches use the new credentials; cached old clients are evicted.

### 3. In-flight jobs

- BullMQ jobs already `process()`-ing use the cached old client (one-shot read). Up to ~30 seconds of in-flight messages may still go via the old credentials.
- Jobs fetched from the queue AFTER cache invalidation receive the new client.
- This is the eventual-consistency window we accept by design — if you need stricter, drain the worker first (see Step 5).

### 4. Verify rotation

```sql
SELECT key_last_rotated_at, last_verified_at, is_enabled
FROM tenant_email_configs WHERE tenant_id = '<TENANT_UUID>';
````

`key_last_rotated_at` should be ≤ 1 minute old.

Have the tenant click "Send test message" in the Settings UI. The verbatim provider response is shown — success means the new key is live.

### 5. (Optional) Drain worker before rotation

For zero in-flight overlap:

```bash
# On worker host
pm2 stop worker
# Tenant rotates via UI
# Worker pulls new config on restart
pm2 start worker
```

This is the only safe pattern when the old credentials are revoked at the same instant they are replaced.

### 6. Rollback

If the new credentials are wrong (typo, paste error), the verify step (Step 4) returns the verbatim provider error in the UI. Tenant updates again with corrected credentials — this is just another `PUT /v1/email-config`. There is no separate rollback flow; the latest write wins.

If the rotation makes everything worse and the only recovery is the original credentials:

```bash
# Tenant has the old key in their password manager
# Tenant updates via UI again with the original key
# This becomes a "rotation back" — no special tooling needed
```

## Common causes of rotation failure

| Symptom                                          | Cause                                                                              | Fix                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `verify` returns `resend.invalid_key` after save | Tenant pasted wrong key, or copied trailing space                                  | Tenant re-pastes, save, verify                                          |
| In-flight jobs continue with old key after save  | Cache invalidation delivered but jobs already in-flight                            | Wait 30 seconds, OR drain worker (Step 5)                               |
| `key_last_rotated_at` did not update             | The `upsertConfig` call failed silently                                            | Check API logs filtered to tenant; refile in `agent-fix-log.md`         |
| Resend webhook events stop arriving              | Tenant rotated Resend key but didn't rotate `webhook_secret` in Resend's dashboard | Tenant updates `webhook_secret` in Resend dashboard to match our config |

````

#### 8c. `docs/runbooks/comms-webhook-debugging.md`

```markdown
# Runbook — Debug a webhook that didn't update notification status

**Purpose.** A `notification` row is stuck in status `sent` (provider acknowledged) and never moved to `delivered` / `bounced` / `complained`. The webhook chain is the suspect.

## Step 1 — Find the suspect notification

```sql
SELECT id, tenant_id, channel, status, provider_message_id, sent_at, updated_at
FROM notification
WHERE id = '<NOTIFICATION_UUID>';
````

Note the `provider_message_id`. It maps to:

- Resend: `re_<uuid>` — the Resend email ID.
- Twilio: `SM<...>` (SMS) or `MM<...>` (MMS) or `WA<...>` (WhatsApp) — the Twilio MessageSid.

## Step 2 — Find webhook events

```sql
SELECT id, channel, event_type, signature_verified, processing_error, received_at, payload_json
FROM notification_webhook_events
WHERE notification_id = '<NOTIFICATION_UUID>'
ORDER BY received_at;
```

Three outcomes:

- **Empty result set:** provider never sent a webhook. Either provider has not yet delivered (wait), OR the provider's webhook URL is misconfigured (check provider dashboard).
- **Rows present, `signature_verified = false`:** provider DID send, but our verifier rejected. Step 4.
- **Rows present, `signature_verified = true`, `processing_error IS NOT NULL`:** our handler crashed. Step 5.

## Step 3 — If no webhook events arrived

Check the provider's webhook URL configuration:

- Resend: https://resend.com/webhooks → tenant's webhook → "Recent deliveries"
- Twilio: https://console.twilio.com → Messaging → Settings → Status callback URL on the tenant's number

The URL must match `https://<our-domain>/api/v1/webhooks/communications/<channel>/<tenant_id>` (Impl 06's contract). If it doesn't match, fix in the provider dashboard.

## Step 4 — Signature verification failed

```sql
SELECT id, payload_json, received_at
FROM notification_webhook_events
WHERE tenant_id = '<TENANT_UUID>'
  AND signature_verified = false
ORDER BY received_at DESC
LIMIT 10;
```

The payload is logged (we always log on signature failure per Impl 06's invariants). Check whether the signature header is missing or wrong.

Most common cause: tenant rotated `webhook_secret` in our config but didn't update it in the provider dashboard. Fix: tenant updates the secret in the provider's dashboard.

Replay manually after the secret is fixed:

```bash
# Capture the original payload from notification_webhook_events.payload_json
# Compute the correct signature with the new secret
# POST it back to /v1/webhooks/communications/<channel>/<tenant_id>

# A helper script lives at scripts/replay-webhook.sh:
./scripts/replay-webhook.sh \
  --event-id '<UUID FROM notification_webhook_events>' \
  --webhook-secret '<NEW SECRET>' \
  --target https://<our-domain>/api/v1/webhooks/communications/<channel>/<tenant_id>
```

(Provide the script as part of this impl — see §F below.)

## Step 5 — Handler crashed (`processing_error` is non-null)

The error message is in the column. Common cases:

- `Notification not found` — `provider_message_id` did not match any `notification` row. Orphan event. Either (a) the notification was deleted, or (b) the provider sent an event for a notification we don't know about (impossible if signature verified and `tenant_id` correct). Mark the row processed with a no-op:

```sql
UPDATE notification_webhook_events
SET processed_at = now(), processing_error = 'no-op: orphan event'
WHERE id = '<EVENT_ID>';
```

- `Unknown event type` — provider added a new event type we don't handle. Add support to `resend-webhook-handler.service.ts` / `twilio-webhook-handler.service.ts`. File in `agent-fix-log.md`.

- Database deadlock / connection error — transient; the cron `comms:webhook-replay` (if registered) will retry. If not, replay manually with the script in §4.

## Step 6 — Replay an event manually

Helper script `scripts/replay-webhook.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
EVENT_ID="$1"          # UUID from notification_webhook_events.id
WEBHOOK_SECRET="$2"    # Tenant's current webhook_secret
TARGET_URL="$3"        # /api/v1/webhooks/communications/<channel>/<tenant_id>

# Fetch payload from DB
PAYLOAD=$(psql "$DATABASE_URL" -tAc \
  "SELECT payload_json FROM notification_webhook_events WHERE id = '$EVENT_ID'")

# Compute Svix-Signature (for Resend) or X-Twilio-Signature (for Twilio)
# The script delegates to a small Node helper that imports our verifier
# in reverse to compute the signature.

node scripts/internal/sign-webhook.js \
  --secret "$WEBHOOK_SECRET" \
  --payload "$PAYLOAD" \
  --target "$TARGET_URL" \
| while IFS= read -r line; do
    eval "$line"  # exports SIGNATURE_HEADER, SIGNATURE_VALUE
done

curl -sS -X POST "$TARGET_URL" \
  -H "$SIGNATURE_HEADER: $SIGNATURE_VALUE" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

Document the script in `scripts/README.md` so it's discoverable.

## Common scenarios table

| Scenario                                | Where to look                                            | Fix                                                         |
| --------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Provider didn't send webhook            | Provider dashboard "deliveries" log                      | Configure webhook URL correctly                             |
| Signature mismatch                      | `notification_webhook_events.signature_verified = false` | Match `webhook_secret` in our config and provider dashboard |
| Handler crashed                         | `notification_webhook_events.processing_error`           | Fix handler, replay event                                   |
| Unknown event type                      | `processing_error = "Unknown event type: ..."`           | Add handler branch, replay                                  |
| Orphan event (no matching notification) | `processing_error = "Notification not found"`            | Mark no-op; track frequency in dashboard                    |

## Step 7 — Closing out

After resolution:

- Update `notification_webhook_events.processed_at` to mark the original row processed.
- Update `notification.status` to the correct final state if the replay didn't.
- File a one-line summary in `agent-fix-log.md` so the next session has the audit trail.

````

#### F. Replay helper

The `scripts/replay-webhook.sh` and `scripts/internal/sign-webhook.js` are NEW files. Keep `sign-webhook.js` minimal — it imports `WebhookSignatureVerifier` (from Impl 06) and exposes the inverse `signResend()` / `signTwilio()` helpers as a CLI. Tests in §8 cover the round-trip.

---

## Tests

Co-located `.spec.ts` files. Per `.claude/rules/testing.md`, every method gets at least one positive and one negative path.

### `apps/api/src/modules/communications/comms-logger.service.spec.ts`

- **JSON output in production:** set `process.env.NODE_ENV = 'production'`, instantiate the service with a stubbed REQUEST proxy, call `log('hello', { tenant_id: 'T1', channel: 'email', template_key: 'invoice.issued' })`. Spy on the underlying `Logger.log`. Assert the spy received a single argument that is a string parseable as JSON, and the parsed object has keys `level`, `msg`, `context`, `ts`, `tenant_id`, `channel`, `template_key`.
- **Dev format:** unset `NODE_ENV`. Same call. Spy receives `[email] tenant=T1 template=invoice.issued — hello`.
- **REQUEST auto-pull:** stub REQUEST with `{ tenantContext: { tenant_id: 'T1' }, headers: { 'x-correlation-id': 'corr-9' } }`. Call `log('msg', { channel: 'email' })` (note: no tenant_id passed). Assert the emitted record carries `tenant_id: 'T1'` and `correlation_id: 'corr-9'`.
- **Caller wins over REQUEST:** caller passes `tenant_id: 'T2'` while REQUEST has `'T1'`. Emitted record carries `T2`.
- **Trace forwarded on error:** call `error('boom', ctx, 'STACK_LINES')`. Spy receives the trace.
- **No REQUEST scope:** instantiate without REQUEST (worker path). Caller must pass `tenant_id` — TypeScript enforces; runtime test sanity-checks that the absent REQUEST is not dereferenced.

### `apps/api/src/modules/communications/comms-metrics.service.spec.ts`

- **Counter increment:** call `recordDispatch('T1', 'email', 'sent', 240)`. Use `prom-client`'s `register.metrics()` to scrape; assert `notifications_dispatched_total{tenant_id="T1",channel="email",status="sent"} 1` is in the output.
- **Histogram observation:** call `recordDispatch('T1', 'email', 'sent', 240)`. Assert the `notifications_dispatch_duration_seconds_bucket{tenant_id="T1",channel="email",le="0.25"}` count is 1 (240ms = 0.24s falls in the `0.25` bucket).
- **Suppression / webhook / template / provider error:** one positive case each. Assert label values are correctly stringified (`signature_valid: "false"` not `false`).
- **Cardinality sanity:** loop 100 unique tenants with one increment each; scrape and confirm 100 rows emit (no silent dedup). This is a sanity check that we did not accidentally aggregate.
- **Shared registry:** assert that `MetricsService.getMetrics()` (or the controller's response) includes the comms metric names alongside the existing `http_requests_total`. Confirms the registry is shared, not split.

### `apps/api/src/modules/communications/comms-sentry.helper.spec.ts`

- **Tags set on success:** mock `@sentry/nestjs`. Wrap `withCommsContext({ tenant_id: 'T1', channel: 'email', template_key: 'k', notification_id: 'N' }, async () => 'ok')`. Resolve to `'ok'`. Assert `Sentry.withScope` invoked, scope's `setTag` called with each of `feature='communications'`, `tenant_id='T1'`, `channel='email'`, `template_key='k'`, `notification_id='N'`.
- **Captures + re-throws on error:** wrap a function that throws `new Error('boom')`. Assert `Sentry.captureException` called with the error AND that the wrapper re-throws the same error (instance equality).
- **Optional tags omitted when missing:** ctx with only `tenant_id`. Assert `setTag` called with `feature` and `tenant_id` only.

### `packages/eslint-config/rules/no-direct-logger-in-comms.test.js`

- **In-scope file flags `import { Logger } from '@nestjs/common'`:** RuleTester invalid case.
- **In-scope file flags `new Logger('Foo')`:** RuleTester invalid case.
- **In-scope file flags `console.log('x')`:** RuleTester invalid case (one for each of `log`, `error`, `warn`, `debug`, `info`).
- **Out-of-scope file is not flagged:** RuleTester valid case for a file path under `apps/api/src/modules/students/`.
- **`comms-logger.service.ts` itself is not flagged:** valid case — the implementation is the one allowed Logger import.
- **Test files are not flagged:** valid case for a `*.spec.ts` path even within scope.

### Wiring smoke (added to existing specs)

Update `notification-dispatch.service.spec.ts` to:

- Inject mocked `CommsLoggerService` and `CommsMetricsService` and assert they are called with the expected context and metric arguments at least once per dispatch outcome (sent / failed / suppressed).
- Confirm no direct `Logger` mock is needed any more.

### Dashboard JSON validation — `apps/api/src/modules/communications/__tests__/dashboard-json.spec.ts` (or co-located in `docs/operations/__tests__/` if a tests-on-docs path exists)

- Read `docs/operations/dashboards/communications.json`.
- `JSON.parse(...)` must succeed.
- Top-level keys present: `title`, `templating`, `panels`, `schemaVersion`, `version`.
- `templating.list` includes a variable named `tenant` and one named `channel`.
- `panels` length ≥ 5 (the five required panels).
- Every panel has a `targets[]` whose `expr` references at least one of our metric names.

### Runbook smoke — `apps/api/src/modules/communications/__tests__/runbook-references.spec.ts`

For each of the three runbook files:

- Read the markdown.
- Extract every `FROM <table>` SQL token and assert each table name exists in `packages/prisma/schema.prisma` (`@@map(...)` strings or model names).
- Extract every `/api/v1/...` endpoint string and assert the prefix matches a route declared in the comms / configuration module set (rough check — substring match against a hand-maintained allowlist of comms routes is fine; perfect AST extraction is overkill).

This is a smoke check, not a strict gate. A passing run means the runbooks are not stale referencing dropped tables; a failing run is a code change without a runbook update.

---

## Verification (local dev server)

Per Rule 27a, this impl ships a local dev verification block in §5 of `IMPLEMENTATION_LOG.md`. The steps below are the spot-check.

### Pre-flight

```bash
# Ensure DB and Redis are up
pnpm --filter @school/prisma migrate status
docker ps | grep -E 'postgres|redis'
````

### Start servers

```bash
pnpm --filter @school/api dev    # http://localhost:3001
pnpm --filter @school/worker dev # tail logs
```

Watch the API boot — confirm `[CommsMetricsService] onModuleInit` log line and no new errors.

### 1. Trigger a dispatch + verify metrics

Authenticate as `owner@nhqs.test`. Use `browser_evaluate` (or curl with the JWT):

```javascript
await fetch('/api/v1/announcements', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Operational layer smoke test',
    body: 'Testing obs hooks',
    audience: { kind: 'school' },
    channels: ['email'],
  }),
}).then((r) => r.json());
```

The announcement queues notifications. Wait ~5 seconds for the worker to pick them up.

### 2. Scrape /metrics

```bash
curl -sS http://127.0.0.1:3001/api/metrics | grep notifications_
```

Confirm:

```
# HELP notifications_dispatched_total Total notifications dispatched by channel and outcome.
# TYPE notifications_dispatched_total counter
notifications_dispatched_total{tenant_id="<NHQS_UUID>",channel="email",status="sent"} 1
# ...
notifications_dispatch_duration_seconds_bucket{tenant_id="<NHQS_UUID>",channel="email",le="0.25"} 1
```

`tenant_id` label should match NHQS's UUID. `channel` is `email`. Status is `sent` (or `delivered` if a webhook arrived in time).

### 3. Confirm gating

From a non-loopback origin (or by sending `Host: example.com` from a non-loopback IP), confirm `/api/metrics` returns 403 without `X-Metrics-Auth`. From loopback, no header needed → 200.

```bash
# 200 from loopback
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/metrics
# 200 (or 403 — depends on dev env config) — document the actual outcome in §5.
```

### 4. Tail server logs — verify structured JSON

In the API log stream, confirm dispatch events look like:

```
[NotificationDispatchService] [email] tenant=<UUID> template=announcement.published notif=<UUID> — Dispatched successfully
```

In dev, format is human-readable. Set `NODE_ENV=production` ad-hoc and re-run to verify JSON output:

```bash
NODE_ENV=production pnpm --filter @school/api dev
```

(Ad-hoc; revert immediately. This is purely a format-check.)

### 5. Trigger a deliberate failure → assert Sentry captured

Configure NHQS with deliberately-bad SMS credentials via `PUT /v1/sms-config` (use a fake `twilio_auth_token`). Trigger an SMS dispatch (admissions form a parent inquiry → chooses SMS). Watch:

- `commsLogger.error` line in API logs with the verbatim Twilio error.
- `notifications_provider_errors_total{error_code="twilio.20003"}` increments on `/api/metrics`.
- In a real Sentry-enabled dev env, the captured event has the `tenant_id`, `channel='sms'`, and `feature='communications'` tags (the unit test for `withCommsContext` is the canonical assertion; the dev Sentry confirmation is observational).

Restore the good Twilio creds.

### 6. Open Grafana locally

If you have a local Grafana with Prometheus pointed at `localhost:3001/api/metrics`:

```bash
# In a Grafana container
docker run -d -p 3000:3000 grafana/grafana
# Import docs/operations/dashboards/communications.json via UI
```

Confirm the dashboard loads without panel errors. Tenant and channel variables populate from real data.

### 7. Walk through one runbook with a fake scenario

Pick `comms-tenant-dispatch-failures.md`. Pretend NHQS has reported "no emails arriving":

- Filter dashboard to NHQS — confirm dispatch rate.
- Run the SQL queries — confirm they execute against the dev DB (some return empty rows; fine).
- Observe the runbook's tables / endpoints all exist.

If any SQL fails (e.g. column does not exist), the runbook smoke test in §8 caught it; otherwise fix the runbook.

### Local verification block (paste into §5 of `IMPLEMENTATION_LOG.md`)

```
## Local verification — Impl 10 (Operational Layer)

- Verified at: <ISO timestamp>
- API boot: clean — CommsMetricsService init log present
- Dispatch smoke: created announcement, observed `notifications_dispatched_total{tenant_id=<NHQS>,channel=email,status=sent} 1`
- Logs: structured JSON record verified in NODE_ENV=production mode; dev format verified in default mode
- Metrics gating: confirmed 200 from loopback, configured METRICS_INTERNAL_TOKEN
- Failure path: bad Twilio creds triggered `notifications_provider_errors_total{error_code=twilio.20003} +1` and a CommsLogger error line
- Dashboard JSON: parsed, tenant + channel variables populated against local Prometheus
- Runbook smoke test: all three runbooks parsed; SQL tables and endpoints all exist
- Console errors observed: 0
```

---

## Files touched

### NEW

- `apps/api/src/modules/communications/comms-logger.service.ts`
- `apps/api/src/modules/communications/comms-logger.service.spec.ts`
- `apps/api/src/modules/communications/comms-metrics.service.ts`
- `apps/api/src/modules/communications/comms-metrics.service.spec.ts`
- `apps/api/src/modules/communications/comms-sentry.helper.ts`
- `apps/api/src/modules/communications/comms-sentry.helper.spec.ts`
- `apps/api/src/modules/communications/providers/provider-error-mapping.ts`
- `apps/api/src/modules/metrics/metrics-access.guard.ts`
- `apps/api/src/modules/communications/__tests__/dashboard-json.spec.ts`
- `apps/api/src/modules/communications/__tests__/runbook-references.spec.ts`
- `packages/eslint-config/rules/no-direct-logger-in-comms.js`
- `packages/eslint-config/rules/no-direct-logger-in-comms.test.js`
- `docs/operations/dashboards/communications.json`
- `docs/runbooks/comms-tenant-dispatch-failures.md`
- `docs/runbooks/comms-credential-rotation.md`
- `docs/runbooks/comms-webhook-debugging.md`
- `scripts/replay-webhook.sh`
- `scripts/internal/sign-webhook.js`

### EDITED (all small, one-purpose edits)

- `apps/api/src/modules/communications/communications.module.ts` — register `CommsLoggerService`, `CommsMetricsService`; import `MetricsModule`.
- `apps/api/src/modules/communications/notification-dispatch.service.ts` — replace `Logger` with `CommsLoggerService`, wrap dispatch in `withCommsContext`, record metrics.
- `apps/api/src/modules/communications/providers/resend-email.provider.ts` — same pattern.
- `apps/api/src/modules/communications/providers/twilio-sms.provider.ts` — same pattern.
- `apps/api/src/modules/communications/providers/twilio-whatsapp.provider.ts` — same pattern.
- `apps/api/src/modules/communications/template-renderer.service.ts` — record `notifications_template_renders_total` per render.
- `apps/api/src/modules/communications/webhooks/communications-webhooks.controller.ts` (Impl 06's file) — record `notifications_webhook_received_total` per event; replace any direct `Logger` with `CommsLoggerService`. Coordinate via Rule 17 with Impl 06.
- `apps/api/src/modules/metrics/metrics.service.ts` — add `getCommsRegistry()` accessor.
- `apps/api/src/modules/metrics/metrics.controller.ts` — apply `@UseGuards(MetricsAccessGuard)`.
- `apps/api/src/modules/metrics/metrics.module.ts` — register the new guard provider.
- `apps/worker/src/processors/communications/dispatch-notifications.processor.ts` — replace `Logger` with `CommsLoggerService`, wrap in `withCommsContext`, record metrics.
- `apps/worker/src/worker.module.ts` — register `CommsLoggerService`, `CommsMetricsService` and import the API-side `MetricsModule` (existing pattern in this monorepo).
- `apps/api/src/instrument.ts` — no edits (per §3, the helper's scope tag is sufficient).
- `packages/eslint-config/plugin.js` — register `no-direct-logger-in-comms`.
- `packages/eslint-config/index.js` (or wherever rule severity maps live) — set `'school/no-direct-logger-in-comms': 'error'` in the API + worker config presets.
- `packages/shared/src/constants/communications.ts` (Impl 04 already created this file; coordinate via Rule 17) — add `PROVIDER_ERROR_CODES` constant.
- `.env.example` — add `METRICS_INTERNAL_TOKEN=<placeholder>`.
- `docs/operations/PRE-LAUNCH-CHECKLIST.md` — Part 5 entry: "pod-CIDR allowlist for /metrics endpoint" (deferred follow-up).

### Cross-impl shared file claims (Rule 17)

This impl needs to edit:

- `apps/api/src/modules/communications/communications.module.ts` — claim against Impl 04, 06, 07, 08, 09 (all in Wave 3).
- `apps/api/src/modules/communications/webhooks/communications-webhooks.controller.ts` — claim against Impl 06.
- `apps/worker/src/worker.module.ts` — claim against Impl 04, 05, 06, 07, 08.
- `apps/worker/src/processors/communications/dispatch-notifications.processor.ts` — claim against Impl 04, 05.
- `packages/shared/src/constants/communications.ts` — claim against Impl 04.
- `packages/eslint-config/plugin.js` — sole touch in Wave 3 expected.
- `.env.example` — claim against Impl 05 (which removes 6 keys).

Coordinate by appending the claim block to `IMPLEMENTATION_LOG.md` §5 BEFORE writing code. Impl 06 owns the webhook controller file initially — wait for Impl 06's commit, pull, then layer the metrics/log hooks on top as a fix-forward commit.

---

## Rollback

This impl is purely additive — no schema, no migration, no destructive change. Rollback is `git revert <commit-sha-range>`.

If reverted partially (e.g. just the wiring but keeping the new services available for a future re-introduction):

- The new services `CommsLoggerService`, `CommsMetricsService`, `withCommsContext` can stay registered as providers without any consumer; they're idle.
- The ESLint rule `no-direct-logger-in-comms` should be reverted at the same time as any unwiring — otherwise CI lint fails on a code path that no longer routes through `CommsLoggerService`.
- The dashboard JSON and runbooks can stay (they're documentation; reverting them removes nothing operational).

If the metrics endpoint guard (`MetricsAccessGuard`) breaks production scraping in some env (e.g. Prometheus is on a different IP than expected and the token is not set), the safe revert is:

```bash
# Drop just the guard:
git revert <SHA-of-the-guard-commit>
```

Without affecting any other observability work. The guard is independently revertable.

If the eslint rule causes a CI flood of failures on legacy comms files we did not anticipate:

```bash
# Temporarily downgrade severity in packages/eslint-config:
# 'school/no-direct-logger-in-comms': 'warn'
# Then fix forward and ratchet back to 'error'.
```

Document the downgrade in `IMPLEMENTATION_LOG.md` §5 with a TODO.

---

## Follow-ups for subsequent waves

- **Impl 11 (frontend Settings UI):** the Settings page for each channel should display dispatch metrics from `/api/metrics` (last 24h sent / failed counters scraped via a thin internal-only API endpoint, NOT raw Prometheus to the browser). Out of scope here; tracked.
- **Impl 14 (architecture docs + E2E):** add an entry to `docs/architecture/danger-zones.md` covering "tenant_id as a Prometheus label is bounded by tenant count — if we cross ~hundreds, switch to top-K + 'other' bucketing." Add to `docs/architecture/event-job-catalog.md` documenting the metrics emission points.
- **Pre-launch (`docs/operations/PRE-LAUNCH-CHECKLIST.md` Part 5):**
  - Configure the production `METRICS_INTERNAL_TOKEN` and rotate it on the same cadence as other operational secrets.
  - Add the production pod-CIDR to `MetricsAccessGuard` if Prometheus does not scrape from loopback.
  - Confirm Grafana provisioning picks up `docs/operations/dashboards/communications.json` on first deploy.
- **Impl 13 (tenant backfill):** when the test tenants are seeded, sanity-check that each tenant's UUID appears as a `tenant_id` label after a real test send.
- **V2 (engagement tracking):** the metric `notifications_engagement_events_total{tenant_id, channel, event_type}` is reserved for when Resend `email.opened` / `email.clicked` events are surfaced. This impl does not add that counter, but the structure of `CommsMetricsService` makes adding it a one-line change.
- **Cardinality monitor:** add a Grafana alert that fires if `count(count by (tenant_id) (notifications_dispatched_total))` exceeds 200 — that's our trigger to revisit the bounded-cardinality assumption documented in §2.
