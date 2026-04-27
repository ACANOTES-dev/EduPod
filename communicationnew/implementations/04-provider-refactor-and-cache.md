# Implementation 04 — Provider refactor + per-tenant client cache + Redis pub/sub

> **Wave:** 3
> **Depends on:** 01 (schema for `tenant_email_configs`, `tenant_sms_configs`, `tenant_whatsapp_configs`), 03 (`EmailConfigService`, `SmsConfigService`, `WhatsAppConfigService` with `getDecryptedConfig`)
> **Restart:** API + worker (both consume the cache bus + the refactored providers; both subscribe to the invalidation channel)
> **Worktree only — NO CI, NO production. Local dev server testing only.**

---

## Goal

Stop hard-coding tenant credentials inside `ResendEmailProvider`, `TwilioSmsProvider`, `TwilioWhatsAppProvider`. Move tenant credentials onto the **primary** dispatch path: every provider call first asks the matching `*ConfigService` from Impl 03 for a decrypted config, and the provider client (`new Resend(...)` / `twilio(...)`) is keyed by `tenant_id` in an in-memory LRU cache. When a tenant config changes, both the API and the worker get an invalidation signal via Redis pub/sub on `comms:config-changed`.

`.env` credentials remain a **temporary fallback** in this implementation — they are read only when the tenant has no config row. Impl 05 deletes the fallback altogether. After 04 ships, every tenant that has a config row in the DB dispatches via tenant credentials; tenants without a config still ship via `.env` so we don't break local dev between Impl 04 and Impl 13's backfill.

The two non-obvious risks this implementation manages:

1. **Cache coherency across processes.** API and worker each have their own `Map<tenant_id, ProviderClient>`. A config update happens in the API; the worker keeps the stale Resend client until something invalidates it. Redis pub/sub on a single channel (`comms:config-changed`, payload `{ tenant_id, channel, ts }`) is the cross-process eviction signal.
2. **Circular module dependency.** `CommunicationsModule` already imports `ConfigurationModule` (for encryption + tenant settings). After Impl 03, `ConfigurationModule` exports the three new `*ConfigService` classes. Impl 04 needs the config services to publish on the cache bus from `upsertConfig` / `deleteConfig` — which means `ConfigurationModule` must depend on `CommunicationsModule` if `CommsCacheBusService` lives there. To break the cycle we extract `CommsCacheBusService` into its own tiny module (`CommsCacheBusModule`) that **both** sides import.

---

## What to change

### 1. New shared constant — `packages/shared/src/constants/communications.ts`

The cache bus channel name and the canonical channel literals live in `@school/shared` so the API, worker, and any future code never hardcode them.

```typescript
// packages/shared/src/constants/communications.ts

/**
 * Redis pub/sub channel for cross-process invalidation of per-tenant
 * provider client caches. Both API and worker subscribe.
 *
 * Payload (JSON):
 *   { tenant_id: string, channel: 'email' | 'sms' | 'whatsapp', ts: number }
 */
export const COMMS_CACHE_BUS_CHANNEL = 'comms:config-changed';

/**
 * The three provider-backed channels covered by per-tenant credential
 * isolation. Used as the discriminator on cache bus events and inside
 * the per-tenant client cache.
 */
export const COMMS_PROVIDER_CHANNELS = ['email', 'sms', 'whatsapp'] as const;

export type CommsProviderChannel = (typeof COMMS_PROVIDER_CHANNELS)[number];

/**
 * Cache bus event payload. Keep the shape minimal — anything richer
 * goes through the regular DB read path on cache miss.
 */
export interface CommsCacheBusEvent {
  tenant_id: string;
  channel: CommsProviderChannel;
  ts: number; // Date.now() at publish time
}
```

Re-export from `packages/shared/src/constants/index.ts` and `packages/shared/src/index.ts`. This file is **claimed** under Rule 17 — no other Wave 3 impl edits it.

---

### 2. New module — `apps/api/src/modules/communications/cache-bus.module.ts`

This is the circular-dep escape hatch. It contains exactly one provider, exports it, and imports nothing beyond the Redis module. Both `CommunicationsModule` and `ConfigurationModule` import this module — neither imports the other for the cache bus contract.

```typescript
// apps/api/src/modules/communications/cache-bus.module.ts
import { Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module';

import { CommsCacheBusService } from './comms-cache-bus.service';

/**
 * Tiny module that owns the Redis pub/sub coordinator for per-tenant
 * communications credential cache invalidation.
 *
 * Lives in its own module so both `ConfigurationModule` (which publishes
 * after credential mutations) and `CommunicationsModule` (whose providers
 * subscribe) can import it without forming a cycle. Do NOT register
 * `CommsCacheBusService` directly in either of those modules.
 */
@Module({
  imports: [RedisModule],
  providers: [CommsCacheBusService],
  exports: [CommsCacheBusService],
})
export class CommsCacheBusModule {}
```

---

### 3. New service — `apps/api/src/modules/communications/comms-cache-bus.service.ts`

Owns one publisher connection and one subscriber connection (Redis pub/sub requires the subscriber connection to NOT issue regular commands, so we open a dedicated `duplicate()` of the main client for SUBSCRIBE).

```typescript
// apps/api/src/modules/communications/comms-cache-bus.service.ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';

import {
  COMMS_CACHE_BUS_CHANNEL,
  COMMS_PROVIDER_CHANNELS,
  type CommsCacheBusEvent,
  type CommsProviderChannel,
} from '@school/shared';

import { RedisService } from '../redis/redis.service';

type Handler = (event: CommsCacheBusEvent) => void;

@Injectable()
export class CommsCacheBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommsCacheBusService.name);
  private subscriberClient: Redis | null = null;
  private readonly handlers = new Set<Handler>();

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    // Dedicated subscriber connection — ioredis does not allow regular
    // commands on a connection that has issued SUBSCRIBE.
    this.subscriberClient = this.redis.getClient().duplicate();

    this.subscriberClient.on('error', (err: Error) => {
      this.logger.error(`Cache bus subscriber error: ${err.message}`, err.stack);
    });

    this.subscriberClient.on('end', () => {
      this.logger.warn(
        'Cache bus subscriber disconnected. Cache will be eventually consistent ' +
          'on reconnect — fetched configs will repopulate from DB on next dispatch.',
      );
    });

    await this.subscriberClient.subscribe(COMMS_CACHE_BUS_CHANNEL);

    this.subscriberClient.on('message', (channel: string, raw: string) => {
      if (channel !== COMMS_CACHE_BUS_CHANNEL) return;
      const event = this.parseEvent(raw);
      if (!event) return;
      for (const handler of this.handlers) {
        try {
          handler(event);
        } catch (err) {
          // A bad handler must NOT take out the whole subscription.
          this.logger.error(
            `Cache bus handler threw for tenant=${event.tenant_id} channel=${event.channel}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    });

    this.logger.log(`Subscribed to ${COMMS_CACHE_BUS_CHANNEL}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriberClient) {
      await this.subscriberClient.unsubscribe(COMMS_CACHE_BUS_CHANNEL);
      await this.subscriberClient.quit();
      this.subscriberClient = null;
    }
    this.handlers.clear();
  }

  /**
   * Publish a config-changed event. Called by `EmailConfigService.upsertConfig`,
   * `SmsConfigService.upsertConfig`, `WhatsAppConfigService.upsertConfig`,
   * and the corresponding `deleteConfig` paths — AFTER the DB write has
   * committed (Rule 12 + race-condition note: never publish before commit).
   */
  async publishConfigChanged(tenantId: string, channel: CommsProviderChannel): Promise<void> {
    const event: CommsCacheBusEvent = {
      tenant_id: tenantId,
      channel,
      ts: Date.now(),
    };
    try {
      await this.redis.getClient().publish(COMMS_CACHE_BUS_CHANNEL, JSON.stringify(event));
    } catch (err) {
      // Eventually consistent: if the publish fails, the cached client on
      // OTHER processes will be stale until idle TTL or manual restart.
      // Logging is the right level here — we never want to block a user-
      // facing config save because Redis blipped.
      this.logger.error(
        `Failed to publish ${COMMS_CACHE_BUS_CHANNEL} event for tenant=${tenantId} channel=${channel}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Register a handler for cache-bus events. Called from each provider's
   * `onModuleInit` to wire `cache.invalidate(tenant_id)` on the matching
   * channel.
   */
  subscribe(handler: Handler): void {
    this.handlers.add(handler);
  }

  /**
   * Test seam — tests use this to assert handler removal on teardown.
   */
  unsubscribe(handler: Handler): void {
    this.handlers.delete(handler);
  }

  private parseEvent(raw: string): CommsCacheBusEvent | null {
    try {
      const parsed = JSON.parse(raw) as Partial<CommsCacheBusEvent>;
      if (
        typeof parsed.tenant_id !== 'string' ||
        typeof parsed.channel !== 'string' ||
        !COMMS_PROVIDER_CHANNELS.includes(parsed.channel as CommsProviderChannel) ||
        typeof parsed.ts !== 'number'
      ) {
        this.logger.warn(`Discarding malformed cache bus payload: ${raw}`);
        return null;
      }
      return parsed as CommsCacheBusEvent;
    } catch (err) {
      this.logger.warn(
        `Cache bus JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
```

**Disconnect-handling decision (recorded for clarity):** the simpler "log only" path is what we ship. We do NOT queue missed events for replay. Reasoning: providers will reload on next dispatch via cache miss / TTL, and Impl 05's mid-flight `is_enabled` re-check is the safety net for credentials revoked while the bus was disconnected. A queued-replay implementation adds state without buying us anything we don't already get from TTL eviction.

---

### 4. New cache class — `apps/api/src/modules/communications/providers/per-tenant-client-cache.ts`

Generic LRU + idle-TTL cache keyed by `tenant_id`. Lives next to the providers because it has no consumers outside them. Each provider owns its own instance.

```typescript
// apps/api/src/modules/communications/providers/per-tenant-client-cache.ts

interface Entry<T> {
  value: T;
  lastAccessedAt: number; // ms epoch
  /**
   * Optional dispose hook — invoked when the entry is evicted via LRU,
   * TTL, or explicit invalidate. Lets a provider close SDK-internal
   * resources (e.g., underlying HTTP agents) if it ever needs to.
   */
  dispose?: (value: T) => void;
}

export interface PerTenantClientCacheOptions {
  /** Max distinct tenants in the cache. Default 1000. */
  maxSize?: number;
  /** Idle TTL in ms — entry evicted if not accessed within window. Default 30 min. */
  ttlMs?: number;
  /** Wall clock — overridable for tests. Default `Date.now`. */
  now?: () => number;
}

/**
 * Generic per-tenant client cache with LRU + idle-TTL eviction.
 *
 * Each provider (Resend, Twilio SMS, Twilio WhatsApp) owns one of these
 * keyed by the same `tenant_id` Strings used for RLS.
 */
export class PerTenantClientCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: PerTenantClientCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 1000;
    this.ttlMs = options.ttlMs ?? 30 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  /**
   * Returns the cached client for `tenantId`, creating it via `factory`
   * if absent or expired. Promotes the entry to most-recently-used.
   *
   * `factory` may set a `dispose` hook by attaching it to the returned
   * value — providers do not currently need this, but the seam is here.
   */
  getOrCreate(tenantId: string, factory: () => T, dispose?: (value: T) => void): T {
    const existing = this.entries.get(tenantId);
    const now = this.now();

    if (existing && now - existing.lastAccessedAt < this.ttlMs) {
      // Hit — promote to MRU by re-inserting
      this.entries.delete(tenantId);
      existing.lastAccessedAt = now;
      this.entries.set(tenantId, existing);
      return existing.value;
    }

    if (existing) {
      // Expired — dispose
      this.disposeEntry(existing);
      this.entries.delete(tenantId);
    }

    const value = factory();
    const entry: Entry<T> = { value, lastAccessedAt: now, dispose };
    this.entries.set(tenantId, entry);

    // Evict LRU if over capacity. Map preserves insertion order, so the
    // oldest entry is the first key.
    while (this.entries.size > this.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.entries.get(oldestKey);
      if (oldest) this.disposeEntry(oldest);
      this.entries.delete(oldestKey);
    }

    return value;
  }

  invalidate(tenantId: string): void {
    const entry = this.entries.get(tenantId);
    if (entry) {
      this.disposeEntry(entry);
      this.entries.delete(tenantId);
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      this.disposeEntry(entry);
    }
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }

  private disposeEntry(entry: Entry<T>): void {
    if (!entry.dispose) return;
    try {
      entry.dispose(entry.value);
    } catch {
      // Dispose is fire-and-forget — never let it break eviction.
    }
  }
}
```

**Why a hand-rolled cache and not `lru-cache`:** the dependency surface is one file, ~80 lines, and this is the only consumer. Pulling `lru-cache` adds a transitive dep across both API and worker for a tiny utility. If we ever need TTI tracking, weighted entries, or async dispose, we revisit.

---

### 5. Refactor `apps/api/src/modules/communications/providers/resend-email.provider.ts`

Three structural changes:

1. **Constructor adds `EmailConfigService`** (from Impl 03) and `CommsCacheBusService`.
2. **`isConfigured()` becomes per-tenant** (was global) — `isConfiguredForTenant(tenantId)`. The legacy `isConfigured()` survives temporarily but its only remaining caller is internal and reads the `.env` fallback. Impl 05 deletes both.
3. **`send()` takes a new first arg `tenantId`** and resolves the tenant config first; falls back to `.env` only if no config row exists.

```typescript
// apps/api/src/modules/communications/providers/resend-email.provider.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

import type { CommsCacheBusEvent } from '@school/shared';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { CommsCacheBusService } from '../comms-cache-bus.service';
import { EmailConfigService } from '../../configuration/email-config.service';

import { PerTenantClientCache } from './per-tenant-client-cache';

@Injectable()
export class ResendEmailProvider implements OnModuleInit {
  private readonly logger = new Logger(ResendEmailProvider.name);

  /**
   * Per-tenant Resend clients. Keyed by `tenant_id`. Populated lazily on
   * first dispatch for that tenant; invalidated by:
   *   1. cache bus events on `comms:config-changed` (cross-process)
   *   2. LRU pressure (>1000 distinct tenants in window)
   *   3. idle TTL (30 min)
   */
  private readonly tenantClientCache = new PerTenantClientCache<Resend>({
    maxSize: 1000,
    ttlMs: 30 * 60 * 1000,
  });

  /**
   * Shared platform client used as the temporary `.env` fallback. Built
   * lazily once. **Removed by Impl 05.**
   */
  private platformFallbackClient: Resend | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerRegistry,
    private readonly emailConfigService: EmailConfigService,
    private readonly cacheBus: CommsCacheBusService,
  ) {}

  onModuleInit(): void {
    // Wire cache invalidation: drop the per-tenant Resend client whenever
    // any process publishes a config-changed event for our channel.
    this.cacheBus.subscribe((event: CommsCacheBusEvent) => {
      if (event.channel !== 'email') return;
      this.tenantClientCache.invalidate(event.tenant_id);
      this.logger.log(`Invalidated email client cache for tenant=${event.tenant_id}`);
    });
  }

  /**
   * @deprecated Use `isConfiguredForTenant`. Kept temporarily so the
   * dispatch service's startup self-check still runs while Impl 05 is in
   * flight. Removed in Impl 05.
   */
  isConfigured(): boolean {
    return !!this.configService.get<string>('RESEND_API_KEY');
  }

  /**
   * True if EITHER the tenant has a `tenant_email_configs` row with
   * `is_enabled = true`, OR the platform `.env` fallback is set.
   * Impl 05 collapses this to "tenant config only".
   */
  async isConfiguredForTenant(tenantId: string): Promise<boolean> {
    const config = await this.emailConfigService.getDecryptedConfig(tenantId);
    if (config?.is_enabled) return true;
    return !!this.configService.get<string>('RESEND_API_KEY');
  }

  /**
   * Send an email via Resend. Resolves tenant credentials FIRST; falls
   * back to platform `.env` only if no tenant config row exists.
   *
   * @param tenantId - the tenant whose credentials should send this mail
   * @param params   - the message itself
   */
  async send(
    tenantId: string,
    params: {
      to: string;
      subject: string;
      html: string;
      from?: string;
      replyTo?: string;
      tags?: { name: string; value: string }[];
      idempotencyKey?: string;
    },
  ): Promise<{ messageId: string }> {
    const tenantConfig = await this.emailConfigService.getDecryptedConfig(tenantId);

    let client: Resend;
    let from: string;
    let replyTo: string | undefined;

    if (tenantConfig?.is_enabled) {
      // Primary path: tenant credentials.
      client = this.tenantClientCache.getOrCreate(
        tenantId,
        () => new Resend(tenantConfig.resend_api_key),
      );
      from =
        params.from ??
        (tenantConfig.from_name
          ? `${tenantConfig.from_name} <${tenantConfig.from_email}>`
          : tenantConfig.from_email);
      replyTo = params.replyTo ?? tenantConfig.reply_to_email ?? undefined;
    } else {
      // Temporary fallback path. Removed by Impl 05.
      client = this.ensurePlatformFallbackClient();
      from =
        params.from ?? this.configService.get<string>('RESEND_FROM_EMAIL') ?? 'noreply@edupod.app';
      replyTo = params.replyTo;
      this.logger.warn(
        `tenant=${tenantId} has no email config; falling back to platform .env credentials. ` +
          'This path is removed by Impl 05 — backfill via Impl 13.',
      );
    }

    this.logger.log(`Sending email tenant=${tenantId} to=${params.to} subject="${params.subject}"`);

    const { data, error } = await this.circuitBreaker.exec('resend', () =>
      client.emails.send({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(params.tags && params.tags.length > 0 ? { tags: params.tags } : {}),
        ...(params.idempotencyKey ? { headers: { 'X-Entity-Ref-ID': params.idempotencyKey } } : {}),
      }),
    );

    if (error) {
      this.logger.error(`Resend email failed tenant=${tenantId}: ${error.message}`, error.name);
      throw new Error(`Resend email failed: ${error.message}`);
    }

    const messageId = data?.id ?? '';
    this.logger.log(`Email sent tenant=${tenantId} messageId=${messageId}`);
    return { messageId };
  }

  private ensurePlatformFallbackClient(): Resend {
    if (this.platformFallbackClient) return this.platformFallbackClient;
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error(
        'Resend is not configured. Tenant has no email config and platform .env fallback is empty.',
      );
    }
    this.platformFallbackClient = new Resend(apiKey);
    return this.platformFallbackClient;
  }
}
```

---

### 6. Refactor `apps/api/src/modules/communications/providers/twilio-sms.provider.ts`

Same shape as the email provider. The cached value is the `Twilio` client; tenant credentials supply `account_sid`, `auth_token`, `twilio_from_number`. Preserve the existing 1600-char truncation.

```typescript
// apps/api/src/modules/communications/providers/twilio-sms.provider.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import type { Twilio } from 'twilio';

import type { CommsCacheBusEvent } from '@school/shared';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { CommsCacheBusService } from '../comms-cache-bus.service';
import { SmsConfigService } from '../../configuration/sms-config.service';

import { PerTenantClientCache } from './per-tenant-client-cache';

const SMS_MAX_LENGTH = 1600;

interface TenantSmsClient {
  client: Twilio;
  fromNumber: string;
}

@Injectable()
export class TwilioSmsProvider implements OnModuleInit {
  private readonly logger = new Logger(TwilioSmsProvider.name);

  private readonly tenantClientCache = new PerTenantClientCache<TenantSmsClient>({
    maxSize: 1000,
    ttlMs: 30 * 60 * 1000,
  });

  private platformFallbackClient: TenantSmsClient | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerRegistry,
    private readonly smsConfigService: SmsConfigService,
    private readonly cacheBus: CommsCacheBusService,
  ) {}

  onModuleInit(): void {
    this.cacheBus.subscribe((event: CommsCacheBusEvent) => {
      if (event.channel !== 'sms') return;
      this.tenantClientCache.invalidate(event.tenant_id);
      this.logger.log(`Invalidated SMS client cache for tenant=${event.tenant_id}`);
    });
  }

  /** @deprecated removed by Impl 05; preserved for the dispatch service's startup probe. */
  isConfigured(): boolean {
    return !!(
      this.configService.get<string>('TWILIO_ACCOUNT_SID') &&
      this.configService.get<string>('TWILIO_AUTH_TOKEN') &&
      this.configService.get<string>('TWILIO_SMS_FROM')
    );
  }

  async isConfiguredForTenant(tenantId: string): Promise<boolean> {
    const config = await this.smsConfigService.getDecryptedConfig(tenantId);
    if (config?.is_enabled) return true;
    return this.isConfigured();
  }

  async send(
    tenantId: string,
    params: { to: string; body: string },
  ): Promise<{ messageSid: string }> {
    const resolved = await this.resolveClient(tenantId);

    let body = params.body;
    if (body.length > SMS_MAX_LENGTH) {
      this.logger.warn(
        `SMS body exceeds ${SMS_MAX_LENGTH} chars (${body.length}), truncating tenant=${tenantId}`,
      );
      body = body.slice(0, SMS_MAX_LENGTH - 3) + '...';
    }

    this.logger.log(`Sending SMS tenant=${tenantId} to=${params.to}`);

    const message = await this.circuitBreaker.exec('twilio', () =>
      resolved.client.messages.create({
        body,
        from: resolved.fromNumber,
        to: params.to,
      }),
    );

    this.logger.log(`SMS sent tenant=${tenantId} sid=${message.sid}`);
    return { messageSid: message.sid };
  }

  private async resolveClient(tenantId: string): Promise<TenantSmsClient> {
    const tenantConfig = await this.smsConfigService.getDecryptedConfig(tenantId);
    if (tenantConfig?.is_enabled) {
      return this.tenantClientCache.getOrCreate(tenantId, () => ({
        client: twilio(tenantConfig.twilio_account_sid, tenantConfig.twilio_auth_token),
        fromNumber: tenantConfig.twilio_from_number,
      }));
    }

    this.logger.warn(
      `tenant=${tenantId} has no SMS config; falling back to platform .env credentials. Removed by Impl 05.`,
    );
    return this.ensurePlatformFallbackClient();
  }

  private ensurePlatformFallbackClient(): TenantSmsClient {
    if (this.platformFallbackClient) return this.platformFallbackClient;
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const smsFrom = this.configService.get<string>('TWILIO_SMS_FROM');
    if (!accountSid || !authToken || !smsFrom) {
      throw new Error(
        'Twilio SMS is not configured. Tenant has no SMS config and .env fallback is empty.',
      );
    }
    this.platformFallbackClient = {
      client: twilio(accountSid, authToken),
      fromNumber: smsFrom,
    };
    return this.platformFallbackClient;
  }
}
```

---

### 7. Refactor `apps/api/src/modules/communications/providers/twilio-whatsapp.provider.ts`

Same shape as SMS. Two WhatsApp-specific points:

- Preserve the existing `whatsapp:` prefix logic on both the recipient (`to`) and the sender (`from`). The tenant config stores the bare E.164 number (`+...`) — the prefixing is provider-side hygiene.
- The 24-hour service window enforcement and template-only-outside-window logic are **Impl 08**, not here. This impl just wires the credential resolution + cache.

```typescript
// apps/api/src/modules/communications/providers/twilio-whatsapp.provider.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import type { Twilio } from 'twilio';

import type { CommsCacheBusEvent } from '@school/shared';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { CommsCacheBusService } from '../comms-cache-bus.service';
import { WhatsAppConfigService } from '../../configuration/whatsapp-config.service';

import { PerTenantClientCache } from './per-tenant-client-cache';

interface TenantWhatsAppClient {
  client: Twilio;
  fromNumber: string; // bare E.164; prefixed inline
}

@Injectable()
export class TwilioWhatsAppProvider implements OnModuleInit {
  private readonly logger = new Logger(TwilioWhatsAppProvider.name);

  private readonly tenantClientCache = new PerTenantClientCache<TenantWhatsAppClient>({
    maxSize: 1000,
    ttlMs: 30 * 60 * 1000,
  });

  private platformFallbackClient: TenantWhatsAppClient | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerRegistry,
    private readonly whatsappConfigService: WhatsAppConfigService,
    private readonly cacheBus: CommsCacheBusService,
  ) {}

  onModuleInit(): void {
    this.cacheBus.subscribe((event: CommsCacheBusEvent) => {
      if (event.channel !== 'whatsapp') return;
      this.tenantClientCache.invalidate(event.tenant_id);
      this.logger.log(`Invalidated WhatsApp client cache for tenant=${event.tenant_id}`);
    });
  }

  /** @deprecated removed by Impl 05. */
  isConfigured(): boolean {
    return !!(
      this.configService.get<string>('TWILIO_ACCOUNT_SID') &&
      this.configService.get<string>('TWILIO_AUTH_TOKEN') &&
      this.configService.get<string>('TWILIO_WHATSAPP_FROM')
    );
  }

  async isConfiguredForTenant(tenantId: string): Promise<boolean> {
    const config = await this.whatsappConfigService.getDecryptedConfig(tenantId);
    if (config?.is_enabled) return true;
    return this.isConfigured();
  }

  async send(
    tenantId: string,
    params: { to: string; body: string },
  ): Promise<{ messageSid: string }> {
    const resolved = await this.resolveClient(tenantId);

    const to = params.to.startsWith('whatsapp:') ? params.to : `whatsapp:${params.to}`;
    const from = resolved.fromNumber.startsWith('whatsapp:')
      ? resolved.fromNumber
      : `whatsapp:${resolved.fromNumber}`;

    this.logger.log(`Sending WhatsApp tenant=${tenantId} to=${to}`);

    const message = await this.circuitBreaker.exec('twilio', () =>
      resolved.client.messages.create({ body: params.body, from, to }),
    );

    this.logger.log(`WhatsApp sent tenant=${tenantId} sid=${message.sid}`);
    return { messageSid: message.sid };
  }

  private async resolveClient(tenantId: string): Promise<TenantWhatsAppClient> {
    const tenantConfig = await this.whatsappConfigService.getDecryptedConfig(tenantId);
    if (tenantConfig?.is_enabled) {
      return this.tenantClientCache.getOrCreate(tenantId, () => ({
        client: twilio(tenantConfig.twilio_account_sid, tenantConfig.twilio_auth_token),
        fromNumber: tenantConfig.twilio_whatsapp_from_number,
      }));
    }
    this.logger.warn(
      `tenant=${tenantId} has no WhatsApp config; falling back to .env. Removed by Impl 05.`,
    );
    return this.ensurePlatformFallbackClient();
  }

  private ensurePlatformFallbackClient(): TenantWhatsAppClient {
    if (this.platformFallbackClient) return this.platformFallbackClient;
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const waFrom = this.configService.get<string>('TWILIO_WHATSAPP_FROM');
    if (!accountSid || !authToken || !waFrom) {
      throw new Error(
        'Twilio WhatsApp is not configured. Tenant has no WhatsApp config and .env fallback is empty.',
      );
    }
    this.platformFallbackClient = {
      client: twilio(accountSid, authToken),
      fromNumber: waFrom,
    };
    return this.platformFallbackClient;
  }
}
```

> **Caller-update note for Wave 3 / Wave 4 impls.** Every existing call site that used `provider.send({ to, body })` now needs `provider.send(tenantId, { to, body })`. The known callers are `notification-dispatch.service.ts` and the worker's `dispatch-notifications.processor.ts`. These already carry `tenant_id` on every job payload (Rule 9), so the change is mechanical: pass `notification.tenant_id` as the new first arg. Impl 05 owns the worker side; Impl 04 owns the API side. Failing to update any caller surfaces as a TypeScript error — there is no silent failure mode here.

---

### 8. Replace the cache-bus stubs in Impl 03's config services

Impl 03 left `CommsCacheBusService` injected as a stub in `EmailConfigService`, `SmsConfigService`, `WhatsAppConfigService`. Impl 04 wires it for real. The pattern is identical for all three — emails shown, SMS and WhatsApp follow the same edit:

```typescript
// apps/api/src/modules/configuration/email-config.service.ts (excerpt)

async upsertConfig(tenantId: string, userId: string, dto: UpsertEmailConfigDto) {
  // ... encrypt + persist as Impl 03 ...
  const config = await this.prisma.tenantEmailConfig.upsert({ ... });

  // Impl 04 wires this — was a no-op stub in Impl 03. Publish AFTER the
  // DB write commits (Rule 12 + race-condition note in plan §5).
  await this.cacheBus.publishConfigChanged(tenantId, 'email');

  return this.toMaskedConfig(config);
}

async deleteConfig(tenantId: string, userId: string): Promise<void> {
  await this.prisma.tenantEmailConfig.delete({ where: { tenant_id: tenantId } });
  await this.cacheBus.publishConfigChanged(tenantId, 'email');
}
```

The `publishConfigChanged` call is intentionally awaited but must NOT throw a user-facing error if Redis is down — `CommsCacheBusService.publishConfigChanged` already swallows-and-logs publish failures. The `await` is there so unit tests can assert call ordering.

---

### 9. Module wiring

#### 9.1 `apps/api/src/modules/communications/communications.module.ts`

- Import `CommsCacheBusModule` (NOT `CommsCacheBusService` directly — the service comes via the new module's exports).
- Drop the direct `CommsCacheBusService` provider line if you mistakenly added one.
- Providers list stays the same; the three refactored providers now have additional deps which Nest resolves via the existing `ConfigurationModule` import (which exports `EmailConfigService`, `SmsConfigService`, `WhatsAppConfigService` after Impl 03) and the new `CommsCacheBusModule` import.

```typescript
// apps/api/src/modules/communications/communications.module.ts (relevant edits only)
import { CommsCacheBusModule } from './cache-bus.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    ApprovalsModule,
    AuthModule,
    ClassesModule,
    ConfigurationModule, // already imported — exports EmailConfigService etc.
    GdprModule,
    HouseholdsModule,
    ParentsModule,
    StudentsModule,
    CommsCacheBusModule, // NEW — exports CommsCacheBusService
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  // controllers / providers / exports unchanged
})
export class CommunicationsModule {}
```

#### 9.2 `apps/api/src/modules/configuration/configuration.module.ts`

Add `CommsCacheBusModule` to imports so the three config services can DI `CommsCacheBusService`. This is the second consumer of the cache-bus module — both `ConfigurationModule` and `CommunicationsModule` depend on it; neither depends on the other for the cache-bus contract. Cycle broken.

```typescript
// apps/api/src/modules/configuration/configuration.module.ts (relevant edit)
import { CommsCacheBusModule } from '../communications/cache-bus.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    CommsCacheBusModule, // NEW
    // ...existing imports...
  ],
  // ...providers, controllers, exports unchanged...
})
export class ConfigurationModule {}
```

#### 9.3 Worker — `apps/worker/src/worker.module.ts`

The worker dispatches notifications (`dispatch-notifications.processor.ts` calls `ResendEmailProvider.send`, etc.), so the providers, the cache, and the cache-bus subscription all need to live in the worker process too. The worker imports the same `CommsCacheBusModule`. It does NOT import `ConfigurationModule`'s controllers; it imports the config services as providers via the existing configuration-services arrangement (the worker already has `EncryptionService` available — Impl 03 made the three new config services `provide`-friendly for worker use).

```typescript
// apps/worker/src/worker.module.ts (additions)
import { CommsCacheBusModule } from '../../api/src/modules/communications/cache-bus.module';
// (or, more cleanly, factor cache-bus into a shared package — but for V1
// we use the api-relative import that the worker already uses for shared
// services. See "shared file claim" below.)

@Module({
  imports: [
    // ...existing imports...
    CommsCacheBusModule,
  ],
  providers: [
    // ...existing processors + services...
    EmailConfigService,
    SmsConfigService,
    WhatsAppConfigService,
    ResendEmailProvider,
    TwilioSmsProvider,
    TwilioWhatsAppProvider,
  ],
})
export class WorkerModule {}
```

The worker also needs `EmailConfigService.getDecryptedConfig`, `SmsConfigService.getDecryptedConfig`, `WhatsAppConfigService.getDecryptedConfig` available. Impl 03's services use `PrismaService`, which the worker already injects (the worker uses `@Inject('PRISMA_CLIENT')` per the convention; Impl 03 must have made the service work with both).

**Shared-file claim under Rule 17:** Impl 04 owns these files for this wave:

- `apps/api/src/modules/communications/communications.module.ts`
- `apps/api/src/modules/configuration/configuration.module.ts`
- `apps/worker/src/worker.module.ts`
- `apps/api/src/modules/communications/providers/resend-email.provider.ts`
- `apps/api/src/modules/communications/providers/twilio-sms.provider.ts`
- `apps/api/src/modules/communications/providers/twilio-whatsapp.provider.ts`
- `packages/shared/src/constants/communications.ts` (new file, no contention but claim it for tidiness)

Other Wave 3 impls (05–10) that touch any of these wait, pull, then layer their hunks. Impl 05 in particular is the next to touch the providers (it deletes the `.env` fallback methods).

---

## Tests

### 10.1 `apps/api/src/modules/communications/comms-cache-bus.service.spec.ts`

Mock `RedisService` with two ioredis-shaped mocks (`getClient()` returns the publisher; `getClient().duplicate()` returns the subscriber). Use `jest.fn()` for `subscribe`, `publish`, `unsubscribe`, `quit`, `on`, and a captured `message` handler.

Cases:

- `publishConfigChanged(tenantId, 'email')` writes JSON to `comms:config-changed` containing `{ tenant_id, channel: 'email', ts: <number> }`.
- `subscribe(handler)` registers a handler; firing the captured `message` callback with valid JSON invokes it.
- Malformed JSON payload — handler not called, warning logged (spy on `Logger.prototype.warn`).
- Wrong channel literal in payload (`channel: 'push'`) — discarded.
- Handler that throws does not prevent other handlers from firing.
- `publishConfigChanged` failure (publish throws) — error logged, no rethrow (verify the resolved promise).
- `onModuleDestroy` calls `unsubscribe` then `quit` and clears the handler set.

### 10.2 `apps/api/src/modules/communications/providers/per-tenant-client-cache.spec.ts`

Pure unit. No DI. Inject `now` for fake-time control.

Cases:

- `getOrCreate(t1, factory)` twice — factory called once.
- `getOrCreate(t1, ...)` then `invalidate(t1)` then `getOrCreate(t1, ...)` — factory called twice.
- LRU: fill to `maxSize + 1`, the first inserted key is evicted.
- LRU promotes on access: insert t1, t2, t3 with `maxSize=3`; access t1; insert t4 — t2 should be evicted, t1 retained.
- TTL: insert t1 at `now=0`; advance `now` to `ttlMs + 1`; `getOrCreate(t1, factory)` — factory called again (entry expired).
- TTL boundary: at exactly `now = ttlMs`, the entry is treated as expired (strict `<` comparison, documented).
- `clear()` empties + `size()` returns 0.
- `dispose` hook fires on LRU eviction, on TTL eviction, and on explicit `invalidate`. Errors thrown by `dispose` are swallowed.

### 10.3 Provider unit tests — `resend-email.provider.spec.ts` (analogous for SMS and WhatsApp)

Update the existing spec. Mocks:

- `EmailConfigService.getDecryptedConfig` → `jest.fn()`
- `CommsCacheBusService.subscribe` → `jest.fn()` capturing the registered handler
- `Resend` SDK constructor → `jest.fn()` returning `{ emails: { send: jest.fn().mockResolvedValue({ data: { id: 'msg_1' }, error: null }) } }`
- `ConfigService.get` for `RESEND_API_KEY` / `RESEND_FROM_EMAIL`

Cases:

- **Tenant config exists, `is_enabled = true`** — `Resend` constructor called with `tenant.resend_api_key`; the `.env` `RESEND_API_KEY` is NOT read.
- **Tenant config exists, `is_enabled = false`** — falls through to `.env` fallback.
- **No tenant config row** — falls through to `.env` fallback (warning logged).
- **No tenant config AND no `.env`** — throws "Resend is not configured" with the new wording.
- **`from_name` set** — `from` header rendered as `"From Name <from@email>"`.
- **`reply_to_email` set, no override** — `reply_to` header carries the tenant value.
- **Caller override** — `params.from` and `params.replyTo` win over tenant config.
- **Cache hit** — two consecutive sends for the same tenant → `Resend` constructor called once.
- **Cache invalidation via bus event** — capture the handler registered in `onModuleInit`, fire `{ tenant_id: 't1', channel: 'email', ts: 1 }`, then `send('t1', ...)` again → `Resend` constructor called twice.
- **Cache bus event for a different channel** (`channel: 'sms'`) — ignored, `Resend` constructor not re-invoked.
- **Resend API returns `error`** — provider throws; circuit-breaker `exec` is invoked.

Mirror the same cases for `twilio-sms.provider.spec.ts` and `twilio-whatsapp.provider.spec.ts`. WhatsApp adds two extra:

- Bare E.164 input — output prefixes `whatsapp:` on both `to` and `from`.
- Already-prefixed input — no double-prefix.

### 10.4 Cross-process invalidation integration test

`apps/api/src/modules/communications/comms-cache-bus.integration.spec.ts` — uses `ioredis-mock` if it's already a dependency, otherwise documents itself as integration-only and `describe.skip` by default with a comment showing how to flip it on against a real Redis.

```typescript
// pseudocode
describe('CommsCacheBusService — cross-process invalidation', () => {
  let publisherInstance: CommsCacheBusService;
  let subscriberInstance: CommsCacheBusService;

  beforeAll(async () => {
    // Start both instances against the same Redis (mock or real localhost:6379)
    // — they get distinct subscriber connections via .duplicate()
  });

  it('subscriber on instance B receives event published from instance A', async () => {
    const received: CommsCacheBusEvent[] = [];
    subscriberInstance.subscribe((e) => received.push(e));

    await publisherInstance.publishConfigChanged('tenant-A', 'email');

    await waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toMatchObject({ tenant_id: 'tenant-A', channel: 'email' });
  });
});
```

If `ioredis-mock` is unavailable in the lockfile, ship the file with `describe.skip` and a one-line note; flip on locally during dev verification.

### 10.5 Config service test updates (Impl 03 → 04 wiring)

Add a single assertion to each of `email-config.service.spec.ts`, `sms-config.service.spec.ts`, `whatsapp-config.service.spec.ts`:

- `upsertConfig` calls `cacheBus.publishConfigChanged(tenantId, '<channel>')` AFTER `prisma.<table>.upsert` resolves (assert call ordering with a single mock-call-order check).
- `deleteConfig` calls `publishConfigChanged` after `delete` resolves.

### 10.6 AppModule DI smoke (per `IMPLEMENTATION_LOG.md` Rule 6)

```bash
cd apps/api && DATABASE_URL=postgresql://x:x@localhost:5432/x \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=fakefakefakefakefakefakefakefake \
JWT_REFRESH_SECRET=fakefakefakefakefakefakefakefake \
ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
MFA_ISSUER=test PLATFORM_DOMAIN=test.local APP_URL=http://localhost:3000 \
npx ts-node -e "
import { Test } from '@nestjs/testing';
import { AppModule } from './src/app.module';
Test.createTestingModule({ imports: [AppModule] }).compile()
  .then(() => { console.log('DI OK'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
"
```

If this fails with `Nest can't resolve dependencies of ...`, the cause is almost always a missing `imports` line on either `CommunicationsModule` or `ConfigurationModule`. Re-read §9 above.

---

## Verification (local dev server)

This is the core deliverable per Rule 27a — the implementation is not complete until all of these have been observed locally.

1. **Spin up dev API + worker.** Two terminals:

   ```bash
   pnpm --filter @school/api dev
   pnpm --filter @school/worker dev
   ```

   Wait for both to log `Nest application successfully started` / `Worker started`.

2. **Subscribe to the cache bus channel from a third terminal.** This is the cross-process visibility check.

   ```bash
   redis-cli SUBSCRIBE comms:config-changed
   ```

   You should see `Reading messages... (press Ctrl-C to quit)`.

3. **Authenticate as `owner@nhqs.test`** against `http://localhost:5551` (or hit the API directly with the dev token from `docs/operations/local-dev-credentials.md`). Get an access token.

4. **PUT a tenant email config.**

   ```bash
   curl -sS -X PUT http://localhost:3001/api/v1/email-config \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "resend_api_key": "re_local_dev_key_aaaaaaaaaaaaaaaa",
       "from_email": "noreply@nhqs.test",
       "from_name": "NHQS",
       "reply_to_email": "office@nhqs.test",
       "webhook_secret": "whsec_local_aaaaaaaa"
     }'
   ```

   Expected:
   - Response body returns the masked config (per Impl 03).
   - `redis-cli SUBSCRIBE` terminal prints a message on `comms:config-changed` of the form `{"tenant_id":"<nhqs-uuid>","channel":"email","ts":<number>}`.
   - API log line: `Invalidated email client cache for tenant=<nhqs-uuid>` (the API process subscribes too).
   - Worker log line: `Invalidated email client cache for tenant=<nhqs-uuid>` (the worker process subscribes too).

5. **Trigger an email dispatch via an existing flow.** Easiest options:
   - As `principal@nhqs.test`, navigate to `Engagement → Announcements`, publish a small announcement to the parent audience (Impl 11's UI doesn't exist yet; use the existing announcement form on the legacy route, or POST directly to `/api/v1/announcements`).
   - Watch the worker log: `Sending email tenant=<nhqs-uuid> to=<parent-email> subject="..."`.
   - The send should use the tenant credentials (the `re_local_dev_key_...` you posted), NOT the platform `.env` fallback. Confirm by setting an obviously wrong tenant `resend_api_key` (e.g., `re_INVALID_AAAAAAAAAAAAAAAAAA`) and verify the worker logs a `Resend email failed` for the tenant — proves the fallback path was bypassed.

6. **Cache hit behaviour.** Trigger two sends in succession. The worker log should show only one `new Resend(...)` allocation (drop a `console.log` in the factory during local dev if needed; remove before commit). Confirm via the LRU cache `size()` if you wired a temporary debug endpoint, or trust the spec.

7. **Cache invalidation via a config update.** PUT a different `from_email` value and confirm the next send picks up the new sender. Without invalidation, the cached client would still send from the old sender.

8. **`.env` fallback.** Use a tenant with NO config row (e.g., delete the NHQS row temporarily, or use a stress tenant before Impl 13's backfill). Trigger a send. Worker log should show:
   - The "falling back to platform .env credentials" warning.
   - The send still succeeds (or fails with a real Resend error if local `.env` keys are dummy — that's fine; the path was exercised).

9. **DI smoke.** Run the snippet from §10.6. Expect `DI OK`.

10. **Type-check + lint + test.**

    ```bash
    pnpm turbo run type-check --filter=@school/api --filter=@school/worker --filter=@school/shared
    pnpm turbo run lint --filter=@school/api --filter=@school/worker --filter=@school/shared
    pnpm turbo run test --filter=@school/api --filter=@school/worker
    ```

11. **Clean up redis-cli SUBSCRIBE** (`Ctrl-C`) and update `IMPLEMENTATION_LOG.md` §5 with the completion record before committing.

---

## Files touched

**New files (this impl owns):**

- `packages/shared/src/constants/communications.ts`
- `apps/api/src/modules/communications/cache-bus.module.ts`
- `apps/api/src/modules/communications/comms-cache-bus.service.ts`
- `apps/api/src/modules/communications/comms-cache-bus.service.spec.ts`
- `apps/api/src/modules/communications/comms-cache-bus.integration.spec.ts` (skipped by default unless `ioredis-mock` available)
- `apps/api/src/modules/communications/providers/per-tenant-client-cache.ts`
- `apps/api/src/modules/communications/providers/per-tenant-client-cache.spec.ts`

**Modified files:**

- `packages/shared/src/constants/index.ts` (re-export)
- `packages/shared/src/index.ts` (re-export)
- `apps/api/src/modules/communications/providers/resend-email.provider.ts`
- `apps/api/src/modules/communications/providers/resend-email.provider.spec.ts`
- `apps/api/src/modules/communications/providers/twilio-sms.provider.ts`
- `apps/api/src/modules/communications/providers/twilio-sms.provider.spec.ts`
- `apps/api/src/modules/communications/providers/twilio-whatsapp.provider.ts`
- `apps/api/src/modules/communications/providers/twilio-whatsapp.provider.spec.ts`
- `apps/api/src/modules/communications/communications.module.ts`
- `apps/api/src/modules/configuration/configuration.module.ts`
- `apps/api/src/modules/configuration/email-config.service.ts` (replace cache-bus stub from Impl 03)
- `apps/api/src/modules/configuration/email-config.service.spec.ts` (assert publish-after-commit)
- `apps/api/src/modules/configuration/sms-config.service.ts`
- `apps/api/src/modules/configuration/sms-config.service.spec.ts`
- `apps/api/src/modules/configuration/whatsapp-config.service.ts`
- `apps/api/src/modules/configuration/whatsapp-config.service.spec.ts`
- `apps/worker/src/worker.module.ts`
- Any caller of `provider.send({ ... })` in `apps/api/src/modules/communications/notification-dispatch.service.ts` (insert `tenantId` as first arg). Worker callers belong to Impl 05.

---

## Rollback

```bash
git revert <commit-sha-of-this-impl>
```

After revert:

1. **Restart API and worker** (`pm2 restart api worker` if using PM2 locally, or `Ctrl-C` + re-run the `pnpm --filter ... dev` commands). Both processes lose their `CommsCacheBusModule` subscription on revert; restarting drops any in-memory `tenantClientCache` so no stale clients survive.
2. **No DB changes** — this impl adds no migrations, so revert is purely code.
3. **`.env` is unchanged** — Impl 04 does NOT delete env vars. Local dev keeps working.
4. **Manual flush of stale cached clients (paranoia step):** if you suspect a long-running worker process held cached clients constructed from tenant credentials and now you want to force a clean slate, simply restart the worker. The `PerTenantClientCache` is in-memory only — restart wipes it. There is no Redis-side cache to flush.
5. **Cache-bus messages in flight at the moment of revert** are harmless. After revert the channel name still exists in Redis but nothing publishes to it; subscribers (now removed from both processes) are gone.

If revert is partial (e.g., the config-service edits land but the provider edits fail), the system stays in a working state because the publish call is fire-and-forget — `EmailConfigService.upsertConfig` will just publish to a channel nobody listens on, and providers fall through to `.env` exactly as they did pre-Impl-04. No user-visible breakage.

---

## Key invariants (re-stated)

- `getDecryptedConfig` is the **only** path through which plaintext provider credentials enter a provider class. Providers never read `tenant.resend_api_key` from a request body, never call `EncryptionService.decrypt` directly, never accept credentials as a method parameter from outside the configuration module.
- The cache-bus channel name lives in `@school/shared/constants/communications.ts`. Hardcoding `'comms:config-changed'` anywhere else is a lint/review failure.
- Cache invalidation publish happens **after** the DB write commits. Impl 03's services are structured so the `await prisma.tenantEmailConfig.upsert(...)` resolves before `await this.cacheBus.publishConfigChanged(...)` runs. Reversing the order would race: a subscriber could fetch the OLD config off DB while the new transaction is still pending.
- Per-tenant cache is **per-process**. The pub/sub is the only cross-process coordination. Two API replicas + N worker replicas all subscribe; all evict on receipt.
- `.env` fallback is preserved by Impl 04 and **deleted by Impl 05**. Do not extend the fallback. Do not log it as the primary path. Every fallback emission carries the warning `falling back to platform .env credentials. Removed by Impl 05`.
- LRU + idle-TTL eviction caps memory at `~maxSize × sizeof(Resend client)` per process. With 1000 tenants and ~10 KB per client, that's ~10 MB worst-case in steady state — acceptable.
- The `CommsCacheBusModule` is the cycle-breaker. `CommunicationsModule` and `ConfigurationModule` both import it; **neither imports the other for the cache-bus contract**. If a future impl adds a cross-import between those two modules for an unrelated reason (e.g., a shared schema), document it in `danger-zones.md` and verify the DI smoke still passes.
