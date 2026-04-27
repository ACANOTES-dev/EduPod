# Implementation 05 — Worker Parity & `.env` Credential Removal

> **Wave:** 3
> **Depends on:** 01 (schema), 03 (config services), 04 (provider refactor + cache bus)
> **Restart targets:** API + worker
> **Deployment:** worktree commit only — NO CI, NO production. Local dev server only.

---

## Goal

Bring the worker's `dispatch-notifications.processor.ts` to **full parity** with the API providers refactored in Impl 04, then **delete every platform `.env` credential path** so the only way to dispatch is a configured tenant config row with `is_enabled=true`.

After this implementation ships:

1. The worker uses `EmailConfigService.getDecryptedConfig(tenant_id)` (and the SMS / WhatsApp equivalents) — same code path the API uses, same per-tenant client cache from Impl 04, same Redis pub/sub invalidation.
2. The six environment variables `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` are removed from env validation, removed from `.env.example`, and have no remaining `ConfigService.get(...)` callers anywhere in the repo.
3. The worker re-fetches each notification's tenant `is_enabled` flag **per row**, not once per batch. A tenant that disables their email config mid-batch sees the next pending row marked `failed:channel_disabled` and the batch continues with the remaining rows.
4. The provider's "no tenant config" path returns `{ skipped: true, reason: 'channel_not_configured' }` instead of falling back to env. The dispatch service translates that into `notification.status='failed'` with `failure_reason='channel_not_configured'`.
5. `failure_reason` is now a closed, documented vocabulary — no untyped strings escape into the database.

This is a **destructive change**. Reverting to `.env` credentials requires re-adding the keys to env validation AND restoring the env-fallback branch inside each provider. Document the rollback steps thoroughly (§7).

---

## Background — what Impl 04 left in place

Impl 04 (provider refactor + cache bus) added the `EmailConfigService.getDecryptedConfig(tenantId)` lookup as the **first** dispatch path. It kept a guarded fallback to the platform `.env` behind a `COMMS_ALLOW_ENV_FALLBACK` boolean (default `true`) so existing test tenants without seeded configs would not break overnight. Impl 05 is the demolition step: the env-fallback branch goes away, the boolean goes away, and the env keys themselves go away.

If Impl 04 chose a different fallback boolean name (or never landed `COMMS_ALLOW_ENV_FALLBACK`), check Impl 04's completion record in `IMPLEMENTATION_LOG.md` §5 and grep for `allowEnvFallback` / `ALLOW_ENV_FALLBACK` before starting. The intent is the same regardless of the name: **delete the fallback branch and its toggle.**

The dispatch infrastructure itself — the two-phase RLS-safe dispatch (`loadNotifications` inside transaction, HTTP sends outside transaction), the fallback chain, idempotency keys, retry backoff, rate limiter, consent gate — is unchanged. This implementation is purely about credential resolution and `is_enabled` enforcement.

---

## What to change

### 5.1 Worker provider parity refactor

#### 5.1.1 The DI graph the worker now needs

The current `DispatchNotificationsProcessor` (`apps/worker/src/processors/communications/dispatch-notifications.processor.ts`) is self-contained: it imports `Resend` and `twilio` directly, reads keys from `ConfigService`, and lazily initialises a single client per process. After this impl it instead:

- Imports `EmailConfigService`, `SmsConfigService`, `WhatsAppConfigService` from `@/modules/configuration` (the same services the API controllers use).
- Imports the per-tenant client cache + cache bus added in Impl 04 (`PerTenantClientCache`, `CommsCacheBusService`).
- Takes a small `IsEnabledCacheService` (new in this impl — see §5.2) that holds a 30-second TTL on `is_enabled` per `(tenant_id, channel)`, invalidated by the same `comms:config-changed` Redis pub/sub event.

The worker can DI-inject these because they live in `apps/api/src/modules/configuration/`. The `apps/api` codebase is already imported into the worker package via the shared monorepo TypeScript paths — Impl 04 set this up. If Impl 04 instead chose to copy provider classes into `apps/worker`, this impl reverses that and consolidates the providers into a single shared module that both apps import, so no drift can creep in.

> **Decision (consolidate, do not copy):** providers live in `apps/api/src/modules/communications/providers/`. The worker module imports `ConfigurationModule` and the relevant provider classes via the existing monorepo paths. This eliminates the "two copies of the dispatch logic" risk that the audit flagged and that this impl exists to prevent. If Impl 04 copied, the first commit of Impl 05 deletes the worker copies and re-points imports.

#### 5.1.2 Refactored processor structure

`apps/worker/src/processors/communications/dispatch-notifications.processor.ts` after this impl:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  EmailConfigService,
  SmsConfigService,
  WhatsAppConfigService,
} from '../../../../api/src/modules/configuration';
import {
  ResendEmailProvider,
  TwilioSmsProvider,
  TwilioWhatsAppProvider,
} from '../../../../api/src/modules/communications/providers';
import { CommsCacheBusService } from '../../../../api/src/modules/communications/comms-cache-bus.service';
import { IsEnabledCacheService } from '../../../../api/src/modules/communications/is-enabled-cache.service';

import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

export const DISPATCH_NOTIFICATIONS_JOB = 'communications:dispatch-notifications';

export interface DispatchNotificationsPayload extends TenantJobPayload {
  notification_ids?: string[];
  announcement_id?: string;
  batch_index?: number;
}

@Injectable()
export class DispatchNotificationsProcessor {
  private readonly logger = new Logger(DispatchNotificationsProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly emailProvider: ResendEmailProvider,
    private readonly smsProvider: TwilioSmsProvider,
    private readonly whatsappProvider: TwilioWhatsAppProvider,
    private readonly emailConfig: EmailConfigService,
    private readonly smsConfig: SmsConfigService,
    private readonly whatsappConfig: WhatsAppConfigService,
    private readonly isEnabledCache: IsEnabledCacheService,
    private readonly cacheBus: CommsCacheBusService,
  ) {}

  async process(job: Job<DispatchNotificationsPayload>): Promise<void> {
    if (job.name !== DISPATCH_NOTIFICATIONS_JOB) return;
    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    const dispatchJob = new DispatchNotificationsJob(
      this.prisma,
      this.emailProvider,
      this.smsProvider,
      this.whatsappProvider,
      this.emailConfig,
      this.smsConfig,
      this.whatsappConfig,
      this.isEnabledCache,
    );
    await dispatchJob.execute(job.data);
  }
}
```

The legacy `getResendClient()` and `getTwilioClient()` lazy initialisers and the `ConfigService` import are deleted from this file. They have no remaining callers.

#### 5.1.3 The mid-flight check, in-line in `dispatchAll`

Inside `DispatchNotificationsJob.dispatchAll`:

```ts
private async dispatchAll(data: DispatchNotificationsPayload): Promise<void> {
  for (const notification of this.loadedNotifications) {
    // ── Mid-flight is_enabled check ─────────────────────────────────────
    // Re-read every iteration. The tenant may have disabled the channel
    // between batch enqueue and this row's turn; we must skip cleanly.
    if (notification.channel !== 'in_app') {
      const enabled = await this.isEnabledCache.getEnabled(
        notification.tenant_id,
        notification.channel,
      );
      if (!enabled) {
        await this.markFailed(notification, 'channel_disabled');
        // No fallback — the tenant explicitly turned this channel off.
        // In-app fallback only fires when *delivery* fails, not when
        // dispatch was administratively skipped.
        continue;
      }
    }

    try {
      switch (notification.channel) {
        case 'in_app': await this.dispatchInApp(notification); break;
        case 'email': await this.dispatchEmail(notification); break;
        case 'sms': await this.dispatchSms(notification); break;
        case 'whatsapp': await this.dispatchWhatsApp(notification); break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.handleFailure(notification, message);
    }
  }
}
```

The `is_enabled` lookup goes through `IsEnabledCacheService.getEnabled(tenant_id, channel)`, which returns `true | false` after consulting:

1. The in-memory map keyed by `(tenant_id, channel)`. If the entry is < 30 seconds old, return it.
2. Otherwise hit the DB once: `SELECT is_enabled FROM tenant_<channel>_configs WHERE tenant_id = $1`. Cache the result.

Cache invalidation is driven by the existing `comms:config-changed` Redis pub/sub channel from Impl 04. On every published `{ tenant_id, channel }` payload, the service deletes the corresponding entry. Next call is a fresh DB read.

#### 5.1.4 Per-channel dispatch bodies — provider delegation

Each `dispatchEmail` / `dispatchSms` / `dispatchWhatsApp` method now delegates **entirely** to the API provider class. The provider already does the tenant-config lookup and per-tenant client cache; the worker's job is only to:

1. Resolve the recipient contact (email / phone) — unchanged.
2. Resolve the template — unchanged.
3. Build the call params and invoke `provider.send({...})`.
4. On `{ skipped: true, reason }` — mark the notification `failed` with that reason. Trigger fallback chain only when the failure is provider-side (rate limit, network, 5xx). Skips like `channel_not_configured`, `channel_disabled`, `suppressed:*`, `sender_domain_unverified` are administrative and do NOT trigger fallback.

Sketch for email:

```ts
private async dispatchEmail(notification: DispatchableNotification): Promise<void> {
  const template = await this.resolveTemplate(notification.tenant_id, ...);
  if (!template) {
    await this.markFailed(notification, 'template_not_found');
    await this.createFallbackNotification(notification, 'in_app');
    return;
  }
  const email = await this.resolveRecipientContact(...);
  if (!email) {
    await this.markFailed(notification, 'recipient_no_email');
    await this.createFallbackNotification(notification, 'in_app');
    return;
  }
  const variables = (notification.payload_json as Record<string, unknown>) ?? {};
  const renderedBody = renderTemplate(template.body_template, variables);
  const renderedSubject = renderSubject(template.subject_template, variables);

  const result = await this.emailProvider.send({
    tenantId: notification.tenant_id,
    to: email,
    subject: renderedSubject ?? 'Notification',
    html: renderedBody,
    idempotencyKey: notification.id,
    tags: [
      { name: 'notification_id', value: notification.id },
      { name: 'template_key', value: notification.template_key ?? 'default' },
    ],
  });

  if ('skipped' in result && result.skipped) {
    await this.markFailed(notification, result.reason);
    return; // administrative skip — no fallback
  }

  await this.prisma.notification.update({
    where: { id: notification.id },
    data: {
      status: 'sent',
      provider_message_id: result.messageId,
      sent_at: new Date(),
      attempt_count: notification.attempt_count + 1,
    },
  });
}
```

The SMS and WhatsApp methods follow the identical shape. The `from_email`, `from_name`, `reply_to_email`, `twilio_from_number`, `twilio_whatsapp_from_number` are read inside the provider from the decrypted tenant config — the worker no longer touches `RESEND_FROM_EMAIL` / `TWILIO_SMS_FROM` / `TWILIO_WHATSAPP_FROM` at all.

#### 5.1.5 Cache bus subscription on worker boot

The worker subscribes to `comms:config-changed` exactly the same way the API does. This is part of the `CommsCacheBusService` from Impl 04: it has `subscribe()` and `publish()` methods, both processes call `subscribe()` on bootstrap. The subscription handler invalidates:

1. The per-tenant Resend / Twilio client cache (Impl 04 — `PerTenantClientCache`).
2. The `is_enabled` TTL cache (this impl — `IsEnabledCacheService`).

If the worker's bootstrap path doesn't already call `cacheBus.subscribe()` after Impl 04, this impl wires it: a `WorkerCacheBusBootstrap` provider in `apps/worker/src/worker.module.ts` that runs `cacheBus.subscribe()` in `OnModuleInit`. Confirm in Impl 04's completion record before adding — do not double-subscribe.

### 5.2 Mid-flight `is_enabled` check — `IsEnabledCacheService`

New file: `apps/api/src/modules/communications/is-enabled-cache.service.ts`. Lives in the API codebase (worker imports it via monorepo paths, same as the providers).

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

import { CommsCacheBusService } from './comms-cache-bus.service';

const TTL_MS = 30_000; // 30 seconds

interface CacheEntry {
  enabled: boolean;
  fetchedAt: number;
}

@Injectable()
export class IsEnabledCacheService {
  private readonly logger = new Logger(IsEnabledCacheService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheBus: CommsCacheBusService,
  ) {
    // Wire the pub/sub invalidator. The bus publishes
    // `comms:config-changed` payloads; we drop the matching key.
    this.cacheBus.onConfigChanged((evt) => {
      const key = this.cacheKey(evt.tenant_id, evt.channel);
      this.cache.delete(key);
    });
  }

  /**
   * Returns the current `is_enabled` for the tenant + channel.
   * Hits the DB at most once per 30 seconds per (tenant, channel)
   * unless invalidated by a `comms:config-changed` event.
   *
   * Returns `false` if no config row exists for the tenant — a
   * channel that's never been configured is never enabled.
   */
  async getEnabled(tenantId: string, channel: 'email' | 'sms' | 'whatsapp'): Promise<boolean> {
    const key = this.cacheKey(tenantId, channel);
    const now = Date.now();

    const cached = this.cache.get(key);
    if (cached && now - cached.fetchedAt < TTL_MS) {
      return cached.enabled;
    }

    const enabled = await this.fetchFromDb(tenantId, channel);
    this.cache.set(key, { enabled, fetchedAt: now });
    return enabled;
  }

  /** Manually evict — exported for tests and the cache bus handler. */
  invalidate(tenantId: string, channel: 'email' | 'sms' | 'whatsapp'): void {
    this.cache.delete(this.cacheKey(tenantId, channel));
  }

  private cacheKey(tenantId: string, channel: string): string {
    return `${tenantId}:${channel}`;
  }

  private async fetchFromDb(
    tenantId: string,
    channel: 'email' | 'sms' | 'whatsapp',
  ): Promise<boolean> {
    // No RLS context here — these tables enforce tenant isolation in the
    // policy + we filter explicitly. This call is read-only and tenant-id
    // is the single field we filter on; this is the canonical "lookup
    // by tenant_id only" pattern (same as cache bus subscriptions).
    if (channel === 'email') {
      const row = await this.prisma.tenantEmailConfig.findUnique({
        where: { tenant_id: tenantId },
        select: { is_enabled: true },
      });
      return row?.is_enabled === true;
    }
    if (channel === 'sms') {
      const row = await this.prisma.tenantSmsConfig.findUnique({
        where: { tenant_id: tenantId },
        select: { is_enabled: true },
      });
      return row?.is_enabled === true;
    }
    const row = await this.prisma.tenantWhatsAppConfig.findUnique({
      where: { tenant_id: tenantId },
      select: { is_enabled: true },
    });
    return row?.is_enabled === true;
  }
}
```

#### 5.2.1 Why a separate `is_enabled` cache, not piggyback on the per-tenant client cache?

The per-tenant client cache from Impl 04 stores instantiated `Resend` / `Twilio` SDK objects keyed by tenant. Eviction happens on config-changed events and on LRU pressure. But its primary job is to avoid per-call client construction (Resend's constructor parses URLs, Twilio's pre-warms TLS).

The `is_enabled` flag has different semantics:

- It's a single boolean. We want to hit the DB at most once per 30 sec per (tenant, channel).
- It's the **gate** that decides whether to even ask the provider for a client. We have to consult it before the per-tenant client cache.
- A disabled tenant should never instantiate a client, so the two caches are not 1:1 — a `false` from `is_enabled` short-circuits the entire dispatch path.

Splitting them keeps each cache's invariant simple. They share the same Redis pub/sub channel for invalidation.

#### 5.2.2 Per-notification cost analysis

A 500-row batch with all rows on the same tenant + channel:

- First row: 1 DB read for `is_enabled` (cache miss). 1 Resend call.
- Rows 2–500: 0 DB reads (cache hit, < 30 sec old). 1 Resend call each.

A 500-row batch spanning 5 tenants × 1 channel: 5 DB reads total for `is_enabled` (one per tenant). Plus the 500 Resend calls — which are the dominant cost.

A pathological worst case (500 tenants × 500 rows, all distinct): 500 DB reads in the first 30 seconds, then 0 until TTL expiry. Postgres can serve a unique-index `findUnique` in well under 1ms; this is negligible compared to the network cost of the actual sends.

The cost calculus is "one extra DB read per send, mitigated by the cache." That is the correct trade-off for safety: the alternative (one read per batch) means a tenant who disables their config sees the next 499 already-queued messages still go out under the old key. That's the exact failure mode the PLAN.md flags as why mid-flight enforcement is non-negotiable.

### 5.3 `.env` credential removal

#### 5.3.1 `.env.example` — exact lines to delete

`/Users/ram/Desktop/SDB/.env.example` currently has these blocks:

```
# ============================================================
# EMAIL — Resend (Phase 7)
# ============================================================
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...
RESEND_FROM_EMAIL=noreply@yourplatform.com

# ============================================================
# WHATSAPP — Twilio (Phase 7)
# ============================================================
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_SMS_FROM=+1234567890
```

After this impl those two blocks become a **single** comment-only block explaining the removal:

```
# ============================================================
# COMMUNICATIONS — Resend (email) + Twilio (SMS, WhatsApp)
# ============================================================
# Per-tenant credentials only. There is no platform fallback.
# Configure via the school settings UI:
#   /<locale>/settings/communications/email
#   /<locale>/settings/communications/sms
#   /<locale>/settings/communications/whatsapp
# Test tenants are seeded by Impl 13 (development DB only).
# RESEND_WEBHOOK_SECRET stays per-tenant on the config row;
# webhooks resolve the secret from `tenant_email_configs.webhook_secret_encrypted`.
```

`RESEND_WEBHOOK_SECRET` is also removed — webhook secrets are per-tenant (stored encrypted on each config row) and verified per-tenant in Impl 06's webhook receivers.

#### 5.3.2 `apps/api/src/modules/config/env.validation.ts`

Delete these lines from the schema object (preserving alphabetical ordering of the rest):

```ts
// Optional -- Email (Resend)
RESEND_API_KEY: z.string().optional(),
RESEND_FROM_EMAIL: z.string().email().default('noreply@edupod.app'),

// Optional -- Webhook secrets
// (keep STRIPE_WEBHOOK_SECRET — that one remains platform-level)
RESEND_WEBHOOK_SECRET: z.string().optional(),
TWILIO_ACCOUNT_SID: z.string().optional(),
TWILIO_AUTH_TOKEN: z.string().optional(),
TWILIO_WHATSAPP_FROM: z.string().optional(),
TWILIO_SMS_FROM: z.string().optional(),
```

Also: check the `.superRefine` block. It currently only validates `ENCRYPTION_KEY` in production; nothing comms-related. No changes needed there.

#### 5.3.3 `apps/worker/src/env.validation.ts`

Delete:

```ts
RESEND_API_KEY: z.string().optional(),
RESEND_FROM_EMAIL: z.string().email().default('noreply@edupod.app'),

TWILIO_ACCOUNT_SID: z.string().optional(),
TWILIO_AUTH_TOKEN: z.string().optional(),
TWILIO_WHATSAPP_FROM: z.string().optional(),
TWILIO_SMS_FROM: z.string().optional(),
```

The worker schema will be smaller after this — that's the intended state.

#### 5.3.4 `COMMS_ALLOW_ENV_FALLBACK` / `allowEnvFallback`

Grep the codebase:

```bash
# from repo root, via the Grep tool not bash:
# pattern: COMMS_ALLOW_ENV_FALLBACK|allowEnvFallback
```

Delete every reference. If Impl 04 added it as a `ConfigService.get(...)` call inside the providers, delete that branch entirely along with its `else if` arm. If Impl 04 added it to env validation, delete that too. If neither added it (Impl 04 tracked the flag mentally and never landed code), confirm via grep returning empty and add a §5 note in the completion record.

#### 5.3.5 The provider `.env` fallback branches

Each provider currently has an `ensureClient()` method that reads `RESEND_API_KEY` / `TWILIO_ACCOUNT_SID` etc. After Impl 04 those methods grew an `if (tenantConfig) ... else if (allowEnvFallback) ...` shape. After this impl:

```ts
// In ResendEmailProvider.send(...) — new shape after Impl 05
async send(params: { tenantId: string; ... }): Promise<SendResult | SkipResult> {
  // 1. Suppression check (Impl 06 will own this)
  // 2. Tenant config
  const cfg = await this.emailConfigService.getDecryptedConfig(params.tenantId);
  if (!cfg) {
    return { skipped: true, reason: 'channel_not_configured' };
  }
  if (!cfg.is_enabled) {
    return { skipped: true, reason: 'channel_disabled' };
  }

  // 3. Domain verification check (Impl 07 owns the lookup; for now this
  //    is just a placeholder — Impl 07 lands the real call).
  // ...

  // 4. Per-tenant client cache
  const client = this.clientCache.getOrCreate(params.tenantId, cfg.resend_api_key);

  // 5. Send
  const fromAddress = cfg.from_name
    ? `${cfg.from_name} <${cfg.from_email}>`
    : cfg.from_email;

  const { data, error } = await this.circuitBreaker.exec('resend', () =>
    client.emails.send({
      from: fromAddress,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      ...(cfg.reply_to_email ? { reply_to: cfg.reply_to_email } : {}),
      ...(params.tags && params.tags.length > 0 ? { tags: params.tags } : {}),
      ...(params.idempotencyKey ? { headers: { 'X-Entity-Ref-ID': params.idempotencyKey } } : {}),
    }),
  );

  if (error) {
    this.logger.error(`Resend send failed: ${error.message}`, error.name);
    throw new Error(`Resend send failed: ${error.message}`);
  }

  return { messageId: data?.id ?? '' };
}
```

The `else if (this.allowEnvFallback) { ... apiKey from env ... }` branch is **deleted**. So is `isConfigured()` — it relied on env vars and is no longer meaningful. Replace any `isConfigured()` call site with a tenant-scoped `emailConfigService.getDecryptedConfig(tenantId).then(c => !!c?.is_enabled)`.

The matching changes go into `TwilioSmsProvider` and `TwilioWhatsAppProvider`. The `from` numbers come off the tenant config (`twilio_from_number`, `twilio_whatsapp_from_number`); the env-derived `TWILIO_SMS_FROM` / `TWILIO_WHATSAPP_FROM` reads are deleted.

#### 5.3.6 Grep targets — every place to clean

Run these greps before considering this impl complete. Each must return empty:

```
RESEND_API_KEY
RESEND_FROM_EMAIL
RESEND_WEBHOOK_SECRET
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_SMS_FROM
TWILIO_WHATSAPP_FROM
COMMS_ALLOW_ENV_FALLBACK
allowEnvFallback
```

Allowed exceptions (do NOT delete these):

- `docs/` — historical audit reports, archived plans, secret inventory documents. These are immutable references to the old setup.
- `CHANGELOG.md` — the entry that records the removal.
- Test files that explicitly test "env vars are gone." Those should remain but reference the removal, not the keys.

For everything else (production code under `apps/`, packages under `packages/`, `.env.example`, env validation files), the greps must come back empty. The implementation is incomplete until they do.

#### 5.3.7 What about test environments?

CI's `apps/api/test/setup-env.ts` may set these keys for legacy tests. After this impl those tests no longer have anything to assert against — the providers don't read env. Delete the assignments. If a legacy test file fails because it expected env to be the credential source, update the test to seed a `tenant_email_config` row in setup instead.

### 5.4 Provider `.env` fallback removal — exhaustive list

Files modified (every callsite that touches one of the seven removed env keys):

- `apps/api/src/modules/communications/providers/resend-email.provider.ts` — delete env-fallback branch in `ensureClient`, delete `isConfigured()`, delete `RESEND_FROM_EMAIL` lookup.
- `apps/api/src/modules/communications/providers/twilio-sms.provider.ts` — delete env-fallback branch in `ensureClient`, delete `isConfigured()`, delete `TWILIO_SMS_FROM` lookup.
- `apps/api/src/modules/communications/providers/twilio-whatsapp.provider.ts` — delete env-fallback branch in `ensureClient`, delete `isConfigured()`, delete `TWILIO_WHATSAPP_FROM` lookup.
- `apps/api/src/modules/communications/webhook.controller.ts` — webhook signature verification was reading `RESEND_WEBHOOK_SECRET` for the platform-shared verification path. Impl 06 owns the per-tenant webhook secret lookup; this impl deletes the env reference now and Impl 06 lands the per-tenant resolver. Coordinate via Rule 17 shared-file claim if Impl 06 has not yet committed.
- `apps/api/src/modules/health/health.service.ts` — health checks may currently report "comms env configured" via env-key presence. Replace with "at least one tenant has a configured + enabled config row" — or remove the check entirely. This is a **status surface only**; delete the env reads.
- `apps/worker/src/processors/communications/dispatch-notifications.processor.ts` — already covered above.
- `apps/worker/src/processors/reports/scheduled-reports-deliver.processor.ts` — uses `ConfigService.get('RESEND_API_KEY')` for the scheduled-report email delivery. Migrate to the same tenant-config path: each scheduled report has a tenant; resolve via `EmailConfigService.getDecryptedConfig(tenantId)` and reuse `ResendEmailProvider.send({...})`. Delete the env path.

The relevant test files (`*.provider.spec.ts`, `*.processor.spec.ts`, `webhook.controller.spec.ts`, `env.validation.spec.ts`, `health.service.spec.ts`) need their fixtures updated to match the new shape — see §6.

### 5.5 `failure_reason` vocabulary — closed list

After this impl, every value `notification.failure_reason` can take is one of:

| `failure_reason` value               | Set by          | Meaning                                                                                                  |
| ------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------- |
| `channel_not_configured`             | Impl 05 (this)  | No tenant config row exists for the channel.                                                             |
| `channel_disabled`                   | Impl 05 (this)  | Config row exists but `is_enabled = false`.                                                              |
| `template_not_found`                 | Impl 05 (this)  | No `notification_template` row matches `(tenant_id, key, channel, locale)`.                              |
| `recipient_no_email`                 | Impl 05 (this)  | User has no email on file.                                                                               |
| `recipient_no_phone`                 | Impl 05 (this)  | Parent has no phone on file (SMS or WhatsApp).                                                           |
| `recipient_no_whatsapp`              | Impl 05 (this)  | Parent has phone but no WhatsApp number on file.                                                         |
| `suppressed:hard_bounce`             | Impl 06         | Recipient address is in suppression list, hard bounce.                                                   |
| `suppressed:soft_bounce_threshold`   | Impl 06         | Recipient address is in suppression list, repeated soft bounces.                                         |
| `suppressed:complaint`               | Impl 06         | Recipient marked the message as spam.                                                                    |
| `suppressed:manual`                  | Impl 06         | Manually added to suppression list.                                                                      |
| `suppressed:unsubscribe`             | Impl 06         | Recipient unsubscribed via list-unsubscribe.                                                             |
| `sender_domain_unverified`           | Impl 07         | Email sender domain not verified.                                                                        |
| `outside_service_window_no_template` | Impl 08         | WhatsApp send outside 24-hour window with no approved template.                                          |
| `whatsapp_template_not_approved`     | Impl 08         | Required template exists but is not in `approved` state.                                                 |
| `provider_error:<verbatim>`          | Impl 05 (this)  | Provider returned an error after retries exhausted; `<verbatim>` is the provider's message, untruncated. |
| `consent_revoked`                    | already in code | Recipient revoked WhatsApp consent (existing behaviour).                                                 |
| `rate_limited`                       | already in code | Notification rate limit hit (existing behaviour).                                                        |

This implementation owns the rows marked "Impl 05 (this)" and the catch-all `provider_error:<verbatim>`. Other Impl owners must use these exact strings for their additions — no untyped freeform reasons.

Add a new constant file `packages/shared/src/constants/notification-failure-reasons.ts` exporting:

```ts
export const NOTIFICATION_FAILURE_REASONS = {
  CHANNEL_NOT_CONFIGURED: 'channel_not_configured',
  CHANNEL_DISABLED: 'channel_disabled',
  TEMPLATE_NOT_FOUND: 'template_not_found',
  RECIPIENT_NO_EMAIL: 'recipient_no_email',
  RECIPIENT_NO_PHONE: 'recipient_no_phone',
  RECIPIENT_NO_WHATSAPP: 'recipient_no_whatsapp',
} as const;

export type NotificationFailureReason =
  | (typeof NOTIFICATION_FAILURE_REASONS)[keyof typeof NOTIFICATION_FAILURE_REASONS]
  | `suppressed:${string}`
  | `provider_error:${string}`
  | 'sender_domain_unverified'
  | 'outside_service_window_no_template'
  | 'whatsapp_template_not_approved'
  | 'consent_revoked'
  | 'rate_limited';
```

Mid-flight call-sites use these constants, never inline strings. The string union type is enforced at the `markFailed` boundary.

---

## 6. Tests

All tests live in `apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts` and `apps/api/src/modules/communications/is-enabled-cache.service.spec.ts`. New ones added; legacy ones updated.

### 6.1 Mid-flight disable

```ts
describe('mid-flight is_enabled disable', () => {
  it('skips remaining batch rows after is_enabled flips to false', async () => {
    // Set up 5 email notifications for the same tenant
    const notifications = [1, 2, 3, 4, 5].map((i) =>
      buildNotification({
        id: `notif-${i}`,
        channel: 'email',
        status: 'queued',
      }),
    );
    mockTx.notification.findMany.mockResolvedValue(notifications);

    // First two: is_enabled=true. Then flip the cache to false.
    let isEnabledReturns = true;
    isEnabledCache.getEnabled.mockImplementation(async () => isEnabledReturns);
    emailProvider.send.mockImplementation(async () => {
      // After the 2nd send, simulate config-changed pub/sub event.
      if (emailProvider.send.mock.calls.length === 2) {
        isEnabledReturns = false;
      }
      return { messageId: 'msg' };
    });

    await processor.process(
      buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: notifications.map((n) => n.id),
      }),
    );

    // 2 sent, 3 marked failed:channel_disabled
    expect(emailProvider.send).toHaveBeenCalledTimes(2);
    const failedCalls = mockTx.notification.update.mock.calls.filter(
      ([args]) => args.data.status === 'failed' && args.data.failure_reason === 'channel_disabled',
    );
    expect(failedCalls).toHaveLength(3);
  });
});
```

### 6.2 No `.env` fallback

```ts
describe('no env fallback', () => {
  it('marks notification failed:channel_not_configured when tenant has no config', async () => {
    // tenant has no email config row
    emailConfig.getDecryptedConfig.mockResolvedValue(null);
    isEnabledCache.getEnabled.mockResolvedValue(false); // null config → enabled=false

    const notif = buildNotification({ channel: 'email' });
    mockTx.notification.findMany.mockResolvedValue([notif]);

    await processor.process(
      buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [notif.id],
      }),
    );

    // Provider's send method must NEVER be called when there's no tenant config
    expect(emailProvider.send).not.toHaveBeenCalled();
    // Notification marked failed with the canonical reason
    expect(mockTx.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'channel_disabled', // is_enabled cache returned false
        }),
      }),
    );
  });

  it('does not consult RESEND_API_KEY env var even if set', async () => {
    process.env.RESEND_API_KEY = 're_should_not_be_read';
    emailConfig.getDecryptedConfig.mockResolvedValue(null);
    isEnabledCache.getEnabled.mockResolvedValue(false);

    const notif = buildNotification({ channel: 'email' });
    mockTx.notification.findMany.mockResolvedValue([notif]);

    await processor.process(
      buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [notif.id],
      }),
    );

    expect(emailProvider.send).not.toHaveBeenCalled();
    delete process.env.RESEND_API_KEY;
  });
});
```

### 6.3 Env validation passes without removed keys

`apps/worker/src/env.validation.spec.ts`:

```ts
describe('worker env validation after Impl 05', () => {
  it('accepts a config without any RESEND_* or TWILIO_* keys', () => {
    expect(() =>
      envValidation({
        DATABASE_URL: 'postgres://x:y@localhost:5432/db',
        REDIS_URL: 'redis://localhost:6379',
        NODE_ENV: 'development',
      }),
    ).not.toThrow();
  });

  it('does not flag RESEND_API_KEY as unrecognized when present', () => {
    // Zod by default does not reject unknown keys — verify we did not
    // add a `.strict()` that would.
    expect(() =>
      envValidation({
        DATABASE_URL: 'postgres://x:y@localhost:5432/db',
        REDIS_URL: 'redis://localhost:6379',
        NODE_ENV: 'development',
        RESEND_API_KEY: 're_legacy_value', // ignored, not validated
      }),
    ).not.toThrow();
  });
});
```

The same shape applies to `apps/api/src/modules/config/env.validation.spec.ts` if one exists. Add the parallel test there if not.

### 6.4 Cache TTL behaviour

`apps/api/src/modules/communications/is-enabled-cache.service.spec.ts`:

```ts
describe('IsEnabledCacheService', () => {
  it('caches the DB read for 30 seconds', async () => {
    const mockPrisma = buildMockPrisma();
    mockPrisma.tenantEmailConfig.findUnique.mockResolvedValue({ is_enabled: true });
    const cacheBus = buildMockCacheBus();
    const svc = new IsEnabledCacheService(mockPrisma, cacheBus);

    // First call hits DB
    await svc.getEnabled(TENANT_ID, 'email');
    expect(mockPrisma.tenantEmailConfig.findUnique).toHaveBeenCalledTimes(1);

    // Second call within TTL: no extra DB hit
    await svc.getEnabled(TENANT_ID, 'email');
    expect(mockPrisma.tenantEmailConfig.findUnique).toHaveBeenCalledTimes(1);
  });

  it('expires after 30 seconds and re-reads', async () => {
    jest.useFakeTimers();
    const mockPrisma = buildMockPrisma();
    mockPrisma.tenantEmailConfig.findUnique.mockResolvedValueOnce({ is_enabled: true });
    mockPrisma.tenantEmailConfig.findUnique.mockResolvedValueOnce({ is_enabled: false });
    const svc = new IsEnabledCacheService(mockPrisma, buildMockCacheBus());

    expect(await svc.getEnabled(TENANT_ID, 'email')).toBe(true);
    jest.advanceTimersByTime(31_000);
    expect(await svc.getEnabled(TENANT_ID, 'email')).toBe(false);
    jest.useRealTimers();
  });

  it('returns false when no config row exists', async () => {
    const mockPrisma = buildMockPrisma();
    mockPrisma.tenantEmailConfig.findUnique.mockResolvedValue(null);
    const svc = new IsEnabledCacheService(mockPrisma, buildMockCacheBus());

    expect(await svc.getEnabled(TENANT_ID, 'email')).toBe(false);
  });
});
```

### 6.5 Pub/sub invalidation faster than TTL

```ts
describe('pub/sub invalidation', () => {
  it('drops cache entry on comms:config-changed event', async () => {
    const mockPrisma = buildMockPrisma();
    mockPrisma.tenantEmailConfig.findUnique.mockResolvedValueOnce({ is_enabled: true });
    mockPrisma.tenantEmailConfig.findUnique.mockResolvedValueOnce({ is_enabled: false });

    let configChangedHandler: ((evt: { tenant_id: string; channel: string }) => void) | null = null;
    const cacheBus = {
      onConfigChanged: jest.fn((handler) => {
        configChangedHandler = handler;
      }),
    };

    const svc = new IsEnabledCacheService(mockPrisma, cacheBus as never);

    expect(await svc.getEnabled(TENANT_ID, 'email')).toBe(true);

    // Simulate the pub/sub event
    expect(configChangedHandler).not.toBeNull();
    configChangedHandler!({ tenant_id: TENANT_ID, channel: 'email' });

    // Next call hits DB again, sees the new value
    expect(await svc.getEnabled(TENANT_ID, 'email')).toBe(false);
    expect(mockPrisma.tenantEmailConfig.findUnique).toHaveBeenCalledTimes(2);
  });

  it('does not drop entries for unrelated channel/tenant', async () => {
    const mockPrisma = buildMockPrisma();
    mockPrisma.tenantEmailConfig.findUnique.mockResolvedValue({ is_enabled: true });
    let configChangedHandler: ((evt: { tenant_id: string; channel: string }) => void) | null = null;
    const cacheBus = {
      onConfigChanged: jest.fn((h) => {
        configChangedHandler = h;
      }),
    };
    const svc = new IsEnabledCacheService(mockPrisma, cacheBus as never);

    await svc.getEnabled(TENANT_ID, 'email'); // populate cache

    // Event for sms — must NOT evict email entry
    configChangedHandler!({ tenant_id: TENANT_ID, channel: 'sms' });

    await svc.getEnabled(TENANT_ID, 'email');
    expect(mockPrisma.tenantEmailConfig.findUnique).toHaveBeenCalledTimes(1);
  });
});
```

### 6.6 Provider tests — env removal

Update `apps/api/src/modules/communications/providers/resend-email.provider.spec.ts`:

```ts
it('returns skipped:channel_not_configured when tenant has no email config', async () => {
  emailConfig.getDecryptedConfig.mockResolvedValue(null);
  const result = await provider.send({
    tenantId: TENANT_ID,
    to: 'test@example.com',
    subject: 's',
    html: '<p>x</p>',
  });
  expect(result).toEqual({ skipped: true, reason: 'channel_not_configured' });
  expect(mockResendClient.emails.send).not.toHaveBeenCalled();
});

it('returns skipped:channel_disabled when config exists but is_enabled=false', async () => {
  emailConfig.getDecryptedConfig.mockResolvedValue({
    resend_api_key: 're_x', from_email: 'a@b.c', is_enabled: false,
  });
  const result = await provider.send({...});
  expect(result).toEqual({ skipped: true, reason: 'channel_disabled' });
});

it('uses tenant from_name and reply_to_email when provided', async () => {
  emailConfig.getDecryptedConfig.mockResolvedValue({
    resend_api_key: 're_x',
    from_email: 'noreply@school.edu',
    from_name: 'NHQS',
    reply_to_email: 'admin@school.edu',
    is_enabled: true,
  });
  await provider.send({...});
  expect(mockResendClient.emails.send).toHaveBeenCalledWith(
    expect.objectContaining({
      from: 'NHQS <noreply@school.edu>',
      reply_to: 'admin@school.edu',
    }),
  );
});
```

The corresponding tests for `twilio-sms.provider.spec.ts` and `twilio-whatsapp.provider.spec.ts` follow the same shape — the `from` numbers come off the config, the `account_sid` and `auth_token` come off the config, the env keys are never read.

### 6.7 Suite hygiene

After all the above tests are added, `pnpm turbo run test --filter=@school/worker --filter=@school/api` must pass. Coverage on `dispatch-notifications.processor.ts` and `is-enabled-cache.service.ts` must be ≥ 90%. The pre-existing dispatch processor tests need their `buildMockConfigService()` factory updated to drop the env keys (replaced with the new `EmailConfigService` etc. mocks).

---

## 7. Verification (local dev server)

This is the local dev verification step that flips the row from `verifying` to `completed` per Rule 27a. Capture timestamps and outcomes in the §5 completion record.

### 7.1 Pre-flight

1. Stop both API and worker dev processes (`pkill -f 'pnpm.*api'`, `pkill -f 'pnpm.*worker'`).
2. Open the local `.env` in your editor. **Confirm** the six removed keys (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM`) are either commented out or removed. They may have been present from earlier sessions.
3. Verify the worktree state with `git status` — only the files you intentionally changed should be staged.

### 7.2 Boot

In one terminal:

```bash
pnpm --filter @school/api dev
```

In another:

```bash
pnpm --filter @school/worker dev
```

Both must start cleanly with **no validation error** about missing `RESEND_API_KEY` etc. Confirm by tailing the first 20 seconds of each — look for the "API listening on 5552" and "Worker bootstrap complete" log lines without env-validation failures above.

### 7.3 DI smoke

Run the AppModule DI smoke from `CLAUDE.md` Rule 6 — both API and worker. Both must return `DI OK`. The worker test compiles `WorkerModule`, which now wires `IsEnabledCacheService`, `CommsCacheBusService`, and the three provider classes. A failure here is a wiring bug — fix before continuing.

### 7.4 Negative-path: tenant without config

1. Pick a test tenant that has not yet been seeded with email config (Impl 13 hasn't run — choose any of NHQS or stress-a/b/c/d).
2. Authenticate as Owner via the dev login, capture the JWT.
3. Trigger an announcement broadcast that includes email:

   ```bash
   curl -X POST http://localhost:5552/api/v1/announcements \
     -H "Authorization: Bearer $JWT" \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Impl 05 verification — email path",
       "body": "<p>Test body</p>",
       "scope": "school",
       "channels": ["in_app", "email"]
     }'
   ```

4. Wait ~5 seconds for the worker to process the dispatch.
5. Query the database:

   ```sql
   SELECT id, channel, status, failure_reason
     FROM notification
    WHERE tenant_id = '<chosen-tenant-id>'
      AND source_entity_type = 'announcement'
      AND created_at > now() - interval '2 minutes'
    ORDER BY created_at DESC;
   ```

6. **Expected**: in-app rows are `delivered`. Email rows are `failed` with `failure_reason='channel_disabled'` (no config row → IsEnabledCache returns `false` → marked failed).

### 7.5 Positive-path: configured tenant

1. Configure email for the tenant via the Impl 03 endpoint:

   ```bash
   curl -X PUT http://localhost:5552/api/v1/email-config \
     -H "Authorization: Bearer $JWT" \
     -H "Content-Type: application/json" \
     -d '{
       "resend_api_key": "re_<your-test-key>",
       "from_email": "noreply@dev.edupod.app",
       "from_name": "EduPod Dev",
       "reply_to_email": "support@dev.edupod.app"
     }'
   ```

2. Wait < 1 second for the `comms:config-changed` event to invalidate the worker's cache.
3. Trigger another announcement (same payload as 7.4).
4. **Expected**: email rows now go to `status='sent'` (and eventually `delivered` after Impl 06's webhooks land). The Resend dashboard shows the message under the configured tenant's account.

### 7.6 Disable mid-flight

1. With the tenant still configured, queue a larger announcement (target an audience of 5+ recipients).
2. As soon as the worker logs the first dispatch, immediately PUT to disable:

   ```bash
   curl -X PUT http://localhost:5552/api/v1/email-config \
     -H "Authorization: Bearer $JWT" \
     -H "Content-Type: application/json" \
     -d '{ "is_enabled": false }'
   ```

3. **Expected**: the next pending notification in the worker batch is marked `failed:channel_disabled`. Earlier ones that already left the cache check are `sent`.
4. Inspect the database to confirm the mix.

This is the most important verification — it proves the per-row mid-flight check works in real time, not just in the test mocks.

### 7.7 Global grep

From repo root:

```bash
# These must produce only doc/changelog matches, not application-code matches.
# Use the Grep tool with the patterns listed in §5.3.6.
```

If any of `apps/`, `packages/` returns a match, the impl is incomplete.

---

## 8. Files touched

This implementation touches a lot. Group by concern:

### 8.1 Worker

- `apps/worker/src/processors/communications/dispatch-notifications.processor.ts` — refactor to delegate to API providers, add mid-flight `is_enabled` check.
- `apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts` — replace env-based mocks with `EmailConfigService` / `SmsConfigService` / `WhatsAppConfigService` / `IsEnabledCacheService` mocks. Add mid-flight disable test, channel_not_configured test.
- `apps/worker/src/processors/reports/scheduled-reports-deliver.processor.ts` — migrate from env to tenant config.
- `apps/worker/src/processors/reports/scheduled-reports-deliver.processor.spec.ts` — update fixtures.
- `apps/worker/src/worker.module.ts` — register `IsEnabledCacheService` provider, wire cache bus subscription on bootstrap (if not already done by Impl 04).
- `apps/worker/src/env.validation.ts` — delete six keys.
- `apps/worker/src/env.validation.spec.ts` — replace assertions about removed keys with assertions that the schema accepts a config without them.

### 8.2 API

- `apps/api/src/modules/communications/providers/resend-email.provider.ts` — delete env-fallback branch, delete `isConfigured()`, take `EmailConfigService` and `PerTenantClientCache` deps, return `SkipResult` shape on no-config / disabled.
- `apps/api/src/modules/communications/providers/twilio-sms.provider.ts` — same shape.
- `apps/api/src/modules/communications/providers/twilio-whatsapp.provider.ts` — same shape.
- `apps/api/src/modules/communications/providers/resend-email.provider.spec.ts` — update fixtures, add channel_not_configured + channel_disabled cases.
- `apps/api/src/modules/communications/providers/twilio-sms.provider.spec.ts` — same.
- `apps/api/src/modules/communications/providers/twilio-whatsapp.provider.spec.ts` — same.
- `apps/api/src/modules/communications/is-enabled-cache.service.ts` — NEW.
- `apps/api/src/modules/communications/is-enabled-cache.service.spec.ts` — NEW.
- `apps/api/src/modules/communications/communications.module.ts` — register `IsEnabledCacheService` as a provider and export it for the worker. **Shared file — claim under Rule 17.**
- `apps/api/src/modules/communications/webhook.controller.ts` — delete `RESEND_WEBHOOK_SECRET` env reference (Impl 06 lands the per-tenant secret resolver).
- `apps/api/src/modules/communications/webhook.controller.spec.ts` — fixture update.
- `apps/api/src/modules/health/health.service.ts` — delete env-key presence check, replace with "tenant configs exist" or remove entirely.
- `apps/api/src/modules/health/health.service.spec.ts` — fixture update.
- `apps/api/src/modules/health/health.service.branches.spec.ts` — fixture update.
- `apps/api/src/modules/config/env.validation.ts` — delete six keys.
- `apps/api/src/modules/config/env.validation.spec.ts` — if exists, update.
- `apps/api/test/setup-env.ts` — delete the env-key assignments for the removed keys.

### 8.3 Shared

- `packages/shared/src/constants/notification-failure-reasons.ts` — NEW.
- `packages/shared/src/constants/index.ts` — export the new constants. **Shared file — claim under Rule 17.**

### 8.4 Root

- `.env.example` — replace the two comms blocks with a single removal-notice block.
- `CHANGELOG.md` — append the entry recording the env removal under "Communications Overhaul / Impl 05."

### 8.5 Documentation

Architecture docs are owned by Impl 14 per Rule 14. Do **not** touch `module-blast-radius.md`, `feature-map.md`, `danger-zones.md`, `state-machines.md`, `event-job-catalog.md`. The `docs/architecture/communication-architecture.md` document already declares the Impl 05 cutover (§1.3 of that file) — no edit needed in this impl.

---

## 9. Rollback

This is a destructive change. Restoring `.env` fallback is non-trivial. If a post-merge regression demands a rollback:

### 9.1 Single-commit revert (preferred)

```bash
# In the worktree:
git revert <impl-05-commit-sha>
# Then restart API + worker locally
pnpm --filter @school/api dev
pnpm --filter @school/worker dev
```

The revert restores:

- The seven env keys in both env validation schemas
- The two comms blocks in `.env.example`
- The `else if (allowEnvFallback)` branches in each provider
- The `isConfigured()` method on each provider
- The legacy `getResendClient()` / `getTwilioClient()` lazy initialisers in the worker dispatch processor
- The `RESEND_WEBHOOK_SECRET` reference in the webhook controller

### 9.2 Restoring `.env` values after revert

If the user actually needs the env-fallback path back in service (NOT just the code), they must repopulate the local `.env` with whatever values were there before this impl ran. The user keeps the prior `.env` outside source control; they paste it back. This impl cannot do that step — `.env` is gitignored.

Production has its own `.env` that the user manages directly (per CLAUDE.md "Production Server — Hard Rules" — never touch the production `.env`). If a production rollback is ever needed, the user is responsible for restoring those values too. This is documented in the §5 completion record.

### 9.3 Multi-commit revert (if Impl 05 was committed in pieces)

If this impl committed in 3+ commits (e.g., one per concern), revert in reverse order: providers first, then env validation, then `.env.example`. Each revert restarts the API + worker locally to confirm the partial rollback is consistent.

### 9.4 Database state on rollback

This impl does not touch the database schema. Tenant config rows from Impl 03 remain. After rollback, the providers prefer tenant config (Impl 04 behaviour) and fall back to env. No data needs to be cleaned up.

### 9.5 Cache state on rollback

The `IsEnabledCacheService` is in-process. A rollback simply means the file is gone — both processes restart with no cache. No Redis cleanup needed.

---

## 10. Key invariants — the audit checklist

Before flipping the row to `completed` in §5 of `IMPLEMENTATION_LOG.md`, verify each:

- [ ] Grep for `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` returns ZERO matches under `apps/` and `packages/`. (Allowed in `docs/`, `CHANGELOG.md`.)
- [ ] Grep for `COMMS_ALLOW_ENV_FALLBACK`, `allowEnvFallback` returns ZERO matches anywhere in the repo.
- [ ] `apps/worker/src/processors/communications/dispatch-notifications.processor.ts` no longer imports `Resend` / `twilio` directly — only the API provider classes.
- [ ] `IsEnabledCacheService.getEnabled()` is called inside `dispatchAll`, ONCE per notification (not per batch).
- [ ] The TTL is exactly 30 seconds (constant `TTL_MS = 30_000`).
- [ ] `IsEnabledCacheService` subscribes to `comms:config-changed` via `CommsCacheBusService.onConfigChanged()`.
- [ ] Provider `send()` methods return `SkipResult { skipped: true, reason }` for no-config / disabled, NEVER throw.
- [ ] `markFailed()` only takes values from the `NotificationFailureReason` union — no inline strings.
- [ ] DI smoke (`pnpm` + ts-node from CLAUDE.md Rule 6) returns `DI OK` for both API and worker modules.
- [ ] `pnpm turbo run test --filter=@school/api --filter=@school/worker --filter=@school/shared` passes.
- [ ] Local dev verification §7 produced the expected results (no-config tenant: `failed:channel_disabled`; configured tenant: `sent`; mid-flight disable: mix of `sent` and `failed:channel_disabled`).
- [ ] §5 completion record written, including the rollback note from §9 and the local verification block from Rule 27a.
- [ ] Wave Status row in §4 of `IMPLEMENTATION_LOG.md` flipped from `in-progress` to `completed`, local commit SHA recorded.

---

## 11. Coordination notes for sibling impls

Wave 3 has six other impls running in parallel. The following overlaps exist:

- **Impl 04** (provider refactor + cache bus) — blocking dependency. Verify Impl 04 is `completed` before starting. Read its §5 record to confirm provider class signatures, cache bus method names, and whether it added `COMMS_ALLOW_ENV_FALLBACK`.
- **Impl 06** (webhooks + suppression list) — overlaps on `webhook.controller.ts` (§5.4) and on the `failure_reason` vocabulary (§5.5). Coordinate via Rule 17 if Impl 06 is `in-progress`. Webhooks own `suppressed:*` reasons; this impl adds the channel*\*/recipient*\* reasons.
- **Impl 07** (email deliverability) — owns `sender_domain_unverified`. The `failure_reason` vocabulary table in §5.5 is collaboratively maintained — when Impl 07 lands, append the entry there in a follow-up commit.
- **Impl 08** (WhatsApp templates + 24-hour window) — owns `outside_service_window_no_template` and `whatsapp_template_not_approved`. Same as Impl 07.
- **Impl 09** (verifyConfig + test endpoints) — uses the `IsEnabledCacheService` for the "is the tenant config really enabled before we test send" gate. No code conflict; coordinate via the shared service interface.
- **Impl 10** (operational layer) — Sentry tagging hooks need to capture the `failure_reason` field in span metadata. Collaboratively defined.

If any sibling claims a shared file you also need to edit, follow Rule 17 — wait for their commit, pull within the worktree, then apply your hunks on top.

---

## 12. Session notes (template — fill in at completion)

Append to §5 of `IMPLEMENTATION_LOG.md` when this impl completes:

```
### [IMPL 05] — Worker Parity & .env Credential Removal
- **Completed:** <ISO timestamp> (Europe/Dublin)
- **Local commit SHA:** <sha>
- **Deployment route:** worktree commit only — NO CI, NO PRODUCTION
- **Verified at:** <ISO timestamp> on local dev server
- **Local verification:**
  - §7.4 negative-path: tenant <id> announcement created, email rows ended `failed:channel_disabled` ✓
  - §7.5 positive-path: configured tenant via PUT /v1/email-config, next dispatch sent successfully (Resend dashboard confirmed) ✓
  - §7.6 mid-flight disable: 5-recipient announcement, 2 sent + 3 failed:channel_disabled after PUT is_enabled=false mid-batch ✓
  - §7.7 global grep: zero matches for removed env keys under apps/ and packages/ ✓
- **Summary:** Refactored worker dispatch processor to delegate to API
  providers (no more direct Resend/twilio imports). Added IsEnabledCacheService
  for per-row, 30-sec TTL is_enabled checks invalidated by comms:config-changed
  pub/sub. Deleted RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_WEBHOOK_SECRET,
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM, TWILIO_WHATSAPP_FROM
  from env validation, .env.example, and every callsite under apps/ and
  packages/. Added NotificationFailureReason union to packages/shared with the
  closed vocabulary. Updated all provider tests + processor tests + env
  validation tests.
- **Follow-ups:**
  - Impl 06 owns suppressed:* failure_reason values + webhook.controller.ts
    per-tenant secret resolver (this impl deleted the env-based
    RESEND_WEBHOOK_SECRET reference; Impl 06 lands the replacement).
  - Impl 07 will append `sender_domain_unverified` to the failure_reason table
    in §5.5 of this spec.
- **Rollback:** `git revert <sha>` restores all seven env keys, the env-fallback
  branches in each provider, the isConfigured() methods, the legacy worker
  lazy initialisers, and the RESEND_WEBHOOK_SECRET reference. The user must
  separately restore the local .env with the values they had before this impl.
- **Session notes:** <fill in anything weird>
```
