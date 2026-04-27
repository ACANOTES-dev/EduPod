# Implementation 07 — Email Deliverability (Domain Verification + DNS + Dispatch Enforcement)

> **Wave:** 3
> **Depends on:** 01 (schema — `tenant_email_domains`), 03 (`EmailConfigService` + Zod schemas), 04 (provider refactor + per-tenant client cache + Redis pub/sub)
> **Restart:** API + worker (worker registers a new cron, API exposes new routes)
> **Deployment route:** worktree commit only (per IMPLEMENTATION_LOG.md Rule 5) — NO CI, NO PRODUCTION

---

## Goal

Build the email deliverability layer described in `docs/architecture/communication-architecture.md` §3.8.

Without verified SPF / DKIM / DMARC records published in the tenant's DNS, our outbound email lands in spam. Resend's `Domains` API returns the canonical record set on registration. The tenant publishes those records in their DNS provider, we poll Resend periodically until all three records flip to `verified`, and from that point onward outbound dispatch refuses to send from any sender domain that has not been verified.

This implementation delivers the full loop:

1. **Registration** — `POST /v1/email-domains` calls Resend's `domains.create` with the tenant's per-tenant Resend API key, persists a `tenant_email_domains` row with `status='pending'` and the canonical DNS record list.
2. **Status polling** — a worker cron `comms:domain-verification-refresh` runs every 30 minutes, iterates pending domains across all tenants, calls Resend's `domains.get`, updates per-record (SPF / DKIM / DMARC) status, sets `verified_at` once all three are green, and dispatches an in-app notification to the user who registered the domain.
3. **Dispatch enforcement** — `ResendEmailProvider.dispatch()` extracts the domain from `from_email`, calls `EmailDomainService.getVerified()`, and refuses to send (`{ skipped: true, reason: 'sender_domain_unverified' }`) when no verified row matches. A `COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV` env flag bypasses the check in local development only.
4. **Manual refresh** — `POST /v1/email-domains/:id/refresh` triggers an immediate refresh for one domain (UI surface for the "Refresh now" button described in Impl 11).
5. **Listing / fetching / removal** — standard CRUD endpoints, all gated by `configuration.communications.manage`.

The dispatch infrastructure (notification rows, fallback chain, retry) stays unchanged — Impl 04 already routes all email through `ResendEmailProvider.dispatch()`; this impl plugs an enforcement gate in front of the actual `client.emails.send()` call.

---

## What to change

### 1. Service — `apps/api/src/modules/communications/deliverability/email-domain.service.ts` (NEW)

Methods (all signatures take `tenantId: string` first per `CLAUDE.md`):

- `registerDomain(tenantId, userId, domain): Promise<TenantEmailDomain>`
- `listDomains(tenantId, page=1, pageSize=20): Promise<{ data, meta }>`
- `getDomain(tenantId, domainId): Promise<TenantEmailDomain | null>`
- `refreshDomain(tenantId, domainId): Promise<TenantEmailDomain>` — manual route
- `refreshOne(tenantId, row): Promise<TenantEmailDomain>` — shared internal path used by manual refresh and the cron applier
- `deleteDomain(tenantId, domainId): Promise<void>`
- `getVerified(tenantId, domain): Promise<TenantEmailDomain | null>` — Redis-cached read used by `ResendEmailProvider.dispatch()`

```typescript
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, TenantEmailDomain } from '@prisma/client';
import type Redis from 'ioredis';
import { Resend } from 'resend';

import { CACHE_BUS_CHANNEL } from '@school/shared/constants/communications';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EmailConfigService } from '../../configuration/email-config.service';

import { EMAIL_DOMAIN_NOTIFIER, type EmailDomainNotifier } from './email-domain-notifier.token';
import type { DnsRecord } from './dns-records.types';

const VERIFIED_CACHE_TTL_SECONDS = 5 * 60;

@Injectable()
export class EmailDomainService {
  private readonly logger = new Logger(EmailDomainService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailConfig: EmailConfigService,
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject(EMAIL_DOMAIN_NOTIFIER) private readonly notifier: EmailDomainNotifier,
  ) {}

  async registerDomain(
    tenantId: string,
    userId: string,
    domain: string,
  ): Promise<TenantEmailDomain> {
    const normalised = domain.toLowerCase().trim();
    const existing = await this.prisma.tenantEmailDomain.findFirst({
      where: { tenant_id: tenantId, domain: normalised },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'DOMAIN_ALREADY_REGISTERED',
        message: `Domain "${normalised}" is already registered for this tenant.`,
      });
    }

    const client = await this.getResendClient(tenantId);
    const resp = await client.domains.create({ name: normalised }).catch((err: Error) => {
      this.logger.error(`[registerDomain] tenant=${tenantId} domain=${normalised}: ${err.message}`);
      throw new BadRequestException({
        code: 'RESEND_DOMAIN_CREATE_FAILED',
        message: `Resend rejected domain registration: ${err.message}`,
      });
    });
    if (resp.error) {
      throw new BadRequestException({
        code: 'RESEND_DOMAIN_CREATE_FAILED',
        message: `Resend rejected domain registration: ${resp.error.message}`,
      });
    }
    const resendDomainId = resp.data?.id;
    if (!resendDomainId) {
      throw new BadRequestException({
        code: 'RESEND_DOMAIN_CREATE_INVALID_RESPONSE',
        message: 'Resend returned an empty domain id.',
      });
    }

    const records = this.normaliseRecords(resp.data?.records ?? []);

    return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      const row = await tx.tenantEmailDomain.create({
        data: {
          tenant_id: tenantId,
          domain: normalised,
          resend_domain_id: resendDomainId,
          status: 'pending',
          spf_status: 'pending',
          dkim_status: 'pending',
          dmarc_status: 'pending',
          dns_records_json: records as unknown as Prisma.InputJsonValue,
          created_by_user_id: userId,
          last_checked_at: new Date(),
        },
      });
      await this.invalidate(tenantId, normalised);
      return row;
    });
  }

  async listDomains(tenantId: string, page = 1, pageSize = 20) {
    const [rows, total] = await Promise.all([
      this.prisma.tenantEmailDomain.findMany({
        where: { tenant_id: tenantId },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tenantEmailDomain.count({ where: { tenant_id: tenantId } }),
    ]);
    return { data: rows, meta: { page, pageSize, total } };
  }

  async getDomain(tenantId: string, domainId: string) {
    return this.prisma.tenantEmailDomain.findFirst({
      where: { id: domainId, tenant_id: tenantId },
    });
  }

  async refreshDomain(tenantId: string, domainId: string) {
    const row = await this.prisma.tenantEmailDomain.findFirst({
      where: { id: domainId, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'DOMAIN_NOT_FOUND',
        message: `Email domain "${domainId}" not found for this tenant.`,
      });
    }
    if (!row.resend_domain_id) {
      throw new BadRequestException({
        code: 'DOMAIN_NOT_REGISTERED_AT_RESEND',
        message: `Domain "${row.domain}" has no Resend ID — re-register it.`,
      });
    }
    return this.refreshOne(tenantId, row);
  }

  /** Shared by manual refresh and the worker cron applier. */
  async refreshOne(tenantId: string, row: TenantEmailDomain): Promise<TenantEmailDomain> {
    const client = await this.getResendClient(tenantId);
    let records: DnsRecord[];
    try {
      const resp = await client.domains.get(row.resend_domain_id ?? '');
      if (resp.error) return this.applyFailure(tenantId, row.id, resp.error.message);
      records = this.normaliseRecords(resp.data?.records ?? []);
    } catch (err) {
      const e = err as Error;
      this.logger.error(`[refreshOne] tenant=${tenantId} domain=${row.domain}: ${e.message}`);
      return this.applyFailure(tenantId, row.id, e.message);
    }

    const spf = this.statusFor(records, 'SPF');
    const dkim = this.statusFor(records, 'DKIM');
    const dmarc = this.statusFor(records, 'DMARC');
    const allVerified = spf === 'verified' && dkim === 'verified' && dmarc === 'verified';
    const previousStatus = row.status;

    const updated = await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(
      async (tx) => {
        const next = await tx.tenantEmailDomain.update({
          where: { id: row.id },
          data: {
            spf_status: spf,
            dkim_status: dkim,
            dmarc_status: dmarc,
            status: allVerified ? 'verified' : 'pending',
            verified_at: allVerified && !row.verified_at ? new Date() : row.verified_at,
            last_checked_at: new Date(),
            dns_records_json: records as unknown as Prisma.InputJsonValue,
            failure_reason: null,
          },
        });
        await this.invalidate(tenantId, row.domain);
        return next;
      },
    );

    if (allVerified && previousStatus !== 'verified' && updated.created_by_user_id) {
      try {
        await this.notifier.notifyVerified(tenantId, updated);
      } catch (err) {
        const e = err as Error;
        this.logger.error(`[refreshOne] notifier failed tenant=${tenantId}: ${e.message}`);
      }
    }
    return updated;
  }

  async deleteDomain(tenantId: string, domainId: string): Promise<void> {
    const row = await this.prisma.tenantEmailDomain.findFirst({
      where: { id: domainId, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'DOMAIN_NOT_FOUND',
        message: `Email domain "${domainId}" not found for this tenant.`,
      });
    }
    if (row.resend_domain_id) {
      try {
        const client = await this.getResendClient(tenantId);
        await client.domains.remove(row.resend_domain_id);
      } catch (err) {
        // Tolerate Resend 404 — purge locally regardless. Log other errors but proceed.
        const e = err as Error & { statusCode?: number };
        if (e.statusCode !== 404) {
          this.logger.warn(
            `[deleteDomain] Resend remove failed: ${e.message}; continuing local delete`,
          );
        }
      }
    }
    await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      await tx.tenantEmailDomain.delete({ where: { id: row.id } });
      await this.invalidate(tenantId, row.domain);
    });
  }

  /** Hot-path read used by ResendEmailProvider.dispatch(). 5-min Redis TTL. */
  async getVerified(tenantId: string, domain: string): Promise<TenantEmailDomain | null> {
    const normalised = domain.toLowerCase().trim();
    const cacheKey = `email-domain:verified:${tenantId}:${normalised}`;
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) {
      return cached === '__null__' ? null : (JSON.parse(cached) as TenantEmailDomain);
    }
    const row = await this.prisma.tenantEmailDomain.findFirst({
      where: { tenant_id: tenantId, domain: normalised, status: 'verified' },
    });
    await this.redis.set(
      cacheKey,
      row ? JSON.stringify(row) : '__null__',
      'EX',
      VERIFIED_CACHE_TTL_SECONDS,
    );
    return row;
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private async getResendClient(tenantId: string): Promise<Resend> {
    const config = await this.emailConfig.getDecryptedConfig(tenantId);
    if (!config) {
      throw new BadRequestException({
        code: 'EMAIL_NOT_CONFIGURED',
        message: 'Email is not configured for this tenant.',
      });
    }
    return new Resend(config.resend_api_key);
  }

  private normaliseRecords(records: ReadonlyArray<unknown>): DnsRecord[] {
    return records.map((raw) => {
      const r = raw as Record<string, unknown>;
      const rt = String(r.record ?? '').toUpperCase();
      const record: DnsRecord['record'] =
        rt === 'SPF' || rt === 'DKIM' || rt === 'DMARC' ? (rt as DnsRecord['record']) : 'SPF';
      const status = this.coerceStatus(String(r.status ?? 'pending'));
      return {
        record,
        name: String(r.name ?? ''),
        type: String(r.type ?? 'TXT') as DnsRecord['type'],
        value: String(r.value ?? ''),
        status,
      };
    });
  }

  private coerceStatus(raw: string): DnsRecord['status'] {
    const lc = raw.toLowerCase();
    if (lc === 'verified') return 'verified';
    if (lc === 'failed' || lc === 'temporary_failure') return 'failed';
    return 'pending';
  }

  private statusFor(records: DnsRecord[], type: 'SPF' | 'DKIM' | 'DMARC'): DnsRecord['status'] {
    const matches = records.filter((r) => r.record === type);
    if (matches.length === 0) return 'pending';
    if (matches.every((r) => r.status === 'verified')) return 'verified';
    if (matches.some((r) => r.status === 'failed')) return 'failed';
    return 'pending';
  }

  private async applyFailure(tenantId: string, domainId: string, reason: string) {
    return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction((tx) =>
      tx.tenantEmailDomain.update({
        where: { id: domainId },
        data: { failure_reason: reason.slice(0, 500), last_checked_at: new Date() },
      }),
    );
  }

  private async invalidate(tenantId: string, domain: string): Promise<void> {
    const cacheKey = `email-domain:verified:${tenantId}:${domain.toLowerCase()}`;
    await this.redis.del(cacheKey);
    await this.redis.publish(
      CACHE_BUS_CHANNEL,
      JSON.stringify({ tenant_id: tenantId, channel: 'email_domain', domain }),
    );
  }
}
```

#### 1.1 Circular-import workaround — `EMAIL_DOMAIN_NOTIFIER` token

Naively importing `NotificationsService` from `EmailDomainService` and importing `EmailDomainService` from `ResendEmailProvider` produces a cycle through the communications module barrel. Resolve via an interface token:

```typescript
// apps/api/src/modules/communications/deliverability/email-domain-notifier.token.ts
import type { TenantEmailDomain } from '@prisma/client';

export const EMAIL_DOMAIN_NOTIFIER = Symbol('EMAIL_DOMAIN_NOTIFIER');

export interface EmailDomainNotifier {
  notifyVerified(tenantId: string, row: TenantEmailDomain): Promise<void>;
}
```

The adapter (in the same folder) holds `NotificationsService` and dispatches an in-app notification using the new template key `email_domain.verified`:

```typescript
// apps/api/src/modules/communications/deliverability/email-domain-notifier.adapter.ts
import { Injectable } from '@nestjs/common';
import type { TenantEmailDomain } from '@prisma/client';

import { NotificationsService } from '../notifications.service';

import type { EmailDomainNotifier } from './email-domain-notifier.token';

@Injectable()
export class EmailDomainNotifierAdapter implements EmailDomainNotifier {
  constructor(private readonly notifications: NotificationsService) {}

  async notifyVerified(tenantId: string, row: TenantEmailDomain): Promise<void> {
    if (!row.created_by_user_id) return;
    await this.notifications.dispatch(tenantId, {
      recipient_user_id: row.created_by_user_id,
      channel: 'in_app',
      template_key: 'email_domain.verified',
      data: { domain: row.domain, verified_at: row.verified_at?.toISOString() ?? '' },
    });
  }
}
```

The communications module wires `{ provide: EMAIL_DOMAIN_NOTIFIER, useClass: EmailDomainNotifierAdapter }` once.

### 2. DNS records type — `apps/api/src/modules/communications/deliverability/dns-records.types.ts` (NEW)

```typescript
/**
 * Stored shape of `tenant_email_domains.dns_records_json`.
 *
 * Resend's `domains.create` and `domains.get` return one record per DNS entry
 * the tenant must publish. `name`, `type`, and `value` are copied verbatim
 * into the DNS provider; `status` reflects Resend's most recent check.
 *
 * `record` differentiates SPF (sender authorisation), DKIM (signing key), and
 * DMARC (policy / reporting). Multiple DKIM records may appear during key
 * rotation — all records of a given purpose must be `verified` for the
 * purpose-level status to count as verified.
 */
export interface DnsRecord {
  record: 'SPF' | 'DKIM' | 'DMARC';
  name: string; // hostname (e.g. 'school.example.org' or '_dmarc.school.example.org')
  type: 'TXT' | 'MX' | 'CNAME';
  value: string; // record value to copy into the DNS provider
  status: 'pending' | 'verified' | 'failed';
}

export type DnsRecordList = DnsRecord[];
```

### 3. Controller — `apps/api/src/modules/communications/deliverability/email-domain.controller.ts` (NEW)

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { registerEmailDomainSchema } from '@school/shared';
import type { JwtPayload, RegisterEmailDomainDto, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { EmailDomainService } from './email-domain.service';

@Controller('v1/email-domains')
@UseGuards(AuthGuard, PermissionGuard)
export class EmailDomainController {
  constructor(private readonly emailDomain: EmailDomainService) {}

  // POST /v1/email-domains
  @Post()
  @RequiresPermission('configuration.communications.manage')
  async register(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(registerEmailDomainSchema)) dto: RegisterEmailDomainDto,
  ) {
    return this.emailDomain.registerDomain(tenant.tenant_id, user.sub, dto.domain);
  }

  // GET /v1/email-domains
  @Get()
  @RequiresPermission('configuration.communications.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.emailDomain.listDomains(
      tenant.tenant_id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  // GET /v1/email-domains/:id
  @Get(':id')
  @RequiresPermission('configuration.communications.view')
  async getOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.emailDomain.getDomain(tenant.tenant_id, id);
  }

  // POST /v1/email-domains/:id/refresh
  @Post(':id/refresh')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('configuration.communications.manage')
  async refresh(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.emailDomain.refreshDomain(tenant.tenant_id, id);
  }

  // DELETE /v1/email-domains/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPermission('configuration.communications.manage')
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.emailDomain.deleteDomain(tenant.tenant_id, id);
  }
}
```

### 4. Provider enforcement — `ResendEmailProvider.dispatch()` (UPDATE)

Impl 04 refactors `ResendEmailProvider.dispatch()` to read tenant config and return `{ skipped: true, reason } | { messageId }`. This impl plugs the verified-domain check between the config read and the actual `client.emails.send()`:

```typescript
// inside dispatch(), after `const config = await this.emailConfig.getDecryptedConfig(tenantId)`:

const fromEmail = config.from_email; // e.g. "noreply@school.example.org"
const atIndex = fromEmail.lastIndexOf('@');
if (atIndex < 0) {
  return { skipped: true, reason: 'invalid_from_email' };
}
const senderDomain = fromEmail.slice(atIndex + 1).toLowerCase();

const bypass =
  this.configService.get<string>('COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV') === 'true';

if (!bypass) {
  const verified = await this.emailDomain.getVerified(params.tenantId, senderDomain);
  if (!verified) {
    this.logger.warn(
      `[ResendEmailProvider] tenant=${params.tenantId} from=${fromEmail} blocked — sender_domain_unverified`,
    );
    return { skipped: true, reason: 'sender_domain_unverified' };
  }
}
```

`emailDomain` is `EmailDomainService` injected via constructor (added to the `ResendEmailProvider` constructor in Impl 04 as part of the refactor — coordinate via Rule 17). The dispatch service interprets `{ skipped: true, reason }` by writing `notification.status='failed'`, `notification.failure_reason=<reason>`, and triggering the fallback chain — all already wired by Impl 04. This impl is a one-method addition to the provider, not a refactor of dispatch logic.

### 4.1 Worker provider parity

The worker dispatch path (`apps/worker/src/processors/communications/dispatch-notifications.processor.ts`) gets the same gate. Because the worker doesn't have access to the API's `EmailDomainService`, add a thin `EmailDomainLookupService` (Redis read first, fall back to a direct `prisma.tenantEmailDomain.findFirst`) that mirrors `getVerified()`:

```typescript
// apps/worker/src/processors/communications/email-domain-lookup.service.ts (NEW)
import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient, TenantEmailDomain } from '@prisma/client';
import type Redis from 'ioredis';

@Injectable()
export class EmailDomainLookupService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async getVerified(tenantId: string, domain: string): Promise<TenantEmailDomain | null> {
    const normalised = domain.toLowerCase().trim();
    const key = `email-domain:verified:${tenantId}:${normalised}`;
    const cached = await this.redis.get(key);
    if (cached !== null)
      return cached === '__null__' ? null : (JSON.parse(cached) as TenantEmailDomain);
    const row = await this.prisma.tenantEmailDomain.findFirst({
      where: { tenant_id: tenantId, domain: normalised, status: 'verified' },
    });
    await this.redis.set(key, row ? JSON.stringify(row) : '__null__', 'EX', 300);
    return row;
  }
}
```

The worker dispatch processor wraps its email send with the same `bypass || getVerified()` check before calling Resend. API and worker share the same Redis cache key shape so they hit the same cache.

### 4.2 Local-dev bypass flag

`.env.example` gains:

```
# Communications — domain verification bypass (LOCAL DEV ONLY)
# When 'true', ResendEmailProvider does NOT enforce that the sender domain is
# a verified `tenant_email_domains` row before dispatch. Production, staging,
# and CI MUST leave this unset (or set to 'false'). Default 'false'.
COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV=false
```

`apps/api/src/config/env-schema.ts` adds:

```typescript
COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV: z.enum(['true', 'false']).optional().default('false'),
```

The flag is read fresh on every dispatch (no caching) so flipping it during local dev takes effect immediately.

### 5. Cron — `apps/worker/src/processors/communications/domain-verification-refresh.processor.ts` (NEW)

Cross-tenant cron, runs every 30 min. Iterates `tenant_email_domains` where `status='pending'`, groups by tenant, instantiates one Resend client per tenant, calls `domains.get` per row, applies the update via a worker-side applier (`DomainRefreshApplierService`), enqueues an in-app notification on `pending → verified` transitions.

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';
import { Resend } from 'resend';

import { QUEUE_NAMES } from '../../base/queue.constants';

import { DomainRefreshApplierService } from './domain-refresh-applier.service';
import { EncryptionService } from '../../base/encryption.service';

export const DOMAIN_VERIFICATION_REFRESH_JOB = 'comms:domain-verification-refresh';

@Injectable()
export class DomainVerificationRefreshProcessor {
  private readonly logger = new Logger(DomainVerificationRefreshProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly encryption: EncryptionService,
    private readonly applier: DomainRefreshApplierService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
  ) {}

  async process(job: Job): Promise<void> {
    if (job.name !== DOMAIN_VERIFICATION_REFRESH_JOB) return;

    const pending = await this.prisma.tenantEmailDomain.findMany({
      where: { status: 'pending' },
      select: {
        id: true,
        tenant_id: true,
        domain: true,
        resend_domain_id: true,
        created_by_user_id: true,
        verified_at: true,
        status: true,
      },
    });
    if (pending.length === 0) {
      this.logger.log('No pending domains to refresh.');
      return;
    }
    this.logger.log(`Refreshing ${pending.length} pending domain(s).`);

    const byTenant = new Map<string, typeof pending>();
    for (const row of pending) {
      const arr = byTenant.get(row.tenant_id) ?? [];
      arr.push(row);
      byTenant.set(row.tenant_id, arr);
    }

    for (const [tenantId, rows] of byTenant.entries()) {
      const apiKey = await this.fetchTenantResendKey(tenantId);
      if (!apiKey) {
        this.logger.warn(`Tenant ${tenantId}: no email config; skipping ${rows.length} domain(s)`);
        continue;
      }
      const client = new Resend(apiKey);
      for (const row of rows) {
        if (!row.resend_domain_id) continue;
        try {
          const resp = await client.domains.get(row.resend_domain_id);
          if (resp.error) {
            this.logger.warn(`tenant=${tenantId} domain=${row.domain}: ${resp.error.message}`);
            await this.applier.applyFailure(tenantId, row.id, resp.error.message);
            continue;
          }
          const result = await this.applier.applyRecords(tenantId, row, resp.data?.records ?? []);
          if (result.transitionedToVerified && row.created_by_user_id) {
            await this.applier.enqueueDomainVerifiedNotification(
              tenantId,
              row.created_by_user_id,
              row.domain,
              result.verifiedAt,
            );
          }
        } catch (err) {
          const e = err as Error;
          this.logger.error(`tenant=${tenantId} domain=${row.domain}: ${e.message}`);
          await this.applier.applyFailure(tenantId, row.id, e.message);
        }
      }
    }
  }

  private async fetchTenantResendKey(tenantId: string): Promise<string | null> {
    const config = await this.prisma.tenantEmailConfig.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!config) return null;
    return this.encryption.decrypt(config.resend_api_key_encrypted, config.encryption_key_ref);
  }
}
```

#### 5.1 `DomainRefreshApplierService` (NEW)

Co-located with the processor. Mirrors `EmailDomainService.refreshOne()` from the API side: takes records → computes per-record statuses (SPF/DKIM/DMARC) → updates the row inside `createRlsClient(...).$transaction()` → returns `{ transitionedToVerified, verifiedAt }`. Also exposes `applyFailure()` and `enqueueDomainVerifiedNotification()`. Reuses the `statusFor` and `coerceStatus` helpers — extract them into `dns-status-helpers.ts` if you want to share them with the API service; otherwise duplicate (15 lines each).

`enqueueDomainVerifiedNotification` enqueues a BullMQ notifications job with payload `{ tenant_id, recipient_user_id, channel: 'in_app', template_key: 'email_domain.verified', data: { domain, verified_at } }`. The existing `dispatch-queued.processor` picks it up and the existing `notifications.service` fan-out handles delivery.

### 5.2 Cron registration — `apps/worker/src/cron/cron-scheduler.service.ts` (UPDATE)

Add to `registerNotificationsCronJobs`:

```typescript
import { DOMAIN_VERIFICATION_REFRESH_JOB } from '../processors/communications/domain-verification-refresh.processor';

await this.notificationsQueue.add(
  DOMAIN_VERIFICATION_REFRESH_JOB,
  {},
  {
    repeat: { pattern: '*/30 * * * *' },
    jobId: `cron:${DOMAIN_VERIFICATION_REFRESH_JOB}`,
    removeOnComplete: 10,
    removeOnFail: 50,
  },
);
this.logger.log(`Registered repeatable cron: ${DOMAIN_VERIFICATION_REFRESH_JOB} (every 30 min)`);
```

The job is idempotent: re-running mid-cycle (manual `:id/refresh` while the cron is firing, or two worker instances racing) cannot corrupt state. Each row's update is a self-contained transaction; the in-app notification fires only on `pending → verified` (guarded by `previousStatus !== 'verified'`).

### 5.3 Worker queue routing

`apps/worker/src/processors/communications/notifications-queue.processor.ts` (or whichever file dispatches notifications jobs by name) gains a case routing `DOMAIN_VERIFICATION_REFRESH_JOB` to `DomainVerificationRefreshProcessor.process(job)`.

### 6. Zod schema — `packages/shared/src/schemas/communication-config.schema.ts` (UPDATE)

Impl 03 introduces this file. Confirm or add:

```typescript
import { z } from 'zod';

export const registerEmailDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i, {
      message: 'Domain must be a valid hostname (e.g. school.example.org)',
    })
    .transform((s) => s.toLowerCase().trim()),
});

export type RegisterEmailDomainDto = z.infer<typeof registerEmailDomainSchema>;
```

Re-export from `packages/shared/src/schemas/index.ts` and `packages/shared/src/index.ts`. Coordinate via Rule 17.

### 7. Module wiring

`apps/api/src/modules/communications/communications.module.ts`:

```typescript
imports: [
  // existing
  ConfigurationModule, // already imported by Impl 03 — provides EmailConfigService
],
controllers: [
  // existing
  EmailDomainController,
],
providers: [
  // existing
  EmailDomainService,
  EmailDomainNotifierAdapter,
  { provide: EMAIL_DOMAIN_NOTIFIER, useClass: EmailDomainNotifierAdapter },
],
exports: [
  EmailDomainService, // exported so ResendEmailProvider can inject it
],
```

`apps/worker/src/worker.module.ts`:

```typescript
providers: [
  // existing
  DomainVerificationRefreshProcessor,
  DomainRefreshApplierService,
  EmailDomainLookupService,
],
```

### 8. Notification templates + constants

Add to `packages/shared/src/constants/notification-types.ts`:

```typescript
'email_domain.verified',
```

Coordinate via Rule 17 — claim the file before editing.

Add platform-level templates in `packages/prisma/seed/notification-templates.ts` (or wherever platform templates live):

```typescript
{ tenant_id: null, channel: 'in_app', template_key: 'email_domain.verified', locale: 'en',
  body: 'Your email sender domain {{domain}} is now verified. Outbound emails will be sent from this domain.',
  active: true },
{ tenant_id: null, channel: 'in_app', template_key: 'email_domain.verified', locale: 'ar',
  body: 'تم التحقق من نطاق البريد الإلكتروني الخاص بك {{domain}}. سيتم إرسال رسائل البريد الإلكتروني الصادرة من هذا النطاق.',
  active: true },
```

Replay the seed locally during verification. Production cutover happens when the user merges (out of scope for this rebuild).

### 9. Audit logging

The existing `AuditLogInterceptor` records `entity_type=tenant_email_domain` for the controller routes. Confirm the interceptor's allowlist (or open-by-default behaviour) covers this entity type. Audit fields we expect:

- `register` — `action='create'`, `meta={ domain, resend_domain_id }`
- `refresh` — `action='update'`, `meta={ domain, status, spf_status, dkim_status, dmarc_status }`
- `delete` — `action='delete'`, `meta={ domain }`

Plaintext API keys MUST NEVER appear in audit `meta` — they don't pass through this controller, but verify nothing in the service layer leaks them via error messages.

---

## Tests

All co-located. Coverage target ≥ 80% per file (matching the existing communications module).

### Service tests — `email-domain.service.spec.ts`

Cases:

1. **Register happy path** — mock Resend `domains.create` returning success; assert `tenantEmailDomain.create` called with `status='pending'`, all per-record statuses `'pending'`, `dns_records_json` matching the normalised record list. Assert Redis `del` called for the verified-cache key.
2. **Register Resend error path** — Resend returns `{ error: { message: 'Domain already registered' } }`. Assert `BadRequestException` with code `RESEND_DOMAIN_CREATE_FAILED`. Assert no row created. Assert no Redis writes.
3. **Register Resend SDK throw** — Resend SDK throws a network error. Same outcome as case 2 but with the thrown error's message in the exception.
4. **Register duplicate** — `findFirst` returns an existing row. Assert `BadRequestException` with code `DOMAIN_ALREADY_REGISTERED`. Assert no Resend call made.
5. **Refresh — all green** — Resend returns 3 verified records. Assert row updated to `status='verified'`, `verified_at` set, notifier called once with the row.
6. **Refresh — already verified, still verified** — row had `status='verified'` already; Resend returns verified. Assert row updated but notifier NOT called (no transition).
7. **Refresh — partial green** — Resend returns 2 verified, 1 pending. Assert `status='pending'`, individual record statuses set, notifier NOT called.
8. **Refresh — Resend error** — `applyFailure` path. Assert `failure_reason` set on row, status unchanged.
9. **Delete — happy path** — Resend `remove` called, row deleted, cache invalidated.
10. **Delete — Resend 404 tolerated** — Resend throws with `statusCode: 404`. Assert local row still deleted, cache still invalidated, no exception thrown.
11. **getVerified — cache miss → DB hit verified** — Redis returns null, DB returns row with `status='verified'`. Assert row returned, Redis `set` called with serialised row + 300s TTL.
12. **getVerified — cache miss → DB null (status pending)** — DB returns null because the WHERE clause filters to `status='verified'`. Assert null returned, Redis stores `'__null__'` sentinel.
13. **getVerified — cache hit** — Redis returns serialised row. Assert DB never queried, parsed row returned.
14. **getVerified — cache hit null sentinel** — Redis returns `'__null__'`. Assert null returned, DB never queried.
15. **RLS leakage — cross-tenant getDomain returns null** — `findFirst` simulated with tenant_id filter; Tenant B request for Tenant A's domain id returns null.
16. **EMAIL_NOT_CONFIGURED** — `getDecryptedConfig` returns null. Assert `BadRequestException` thrown from `registerDomain` / `refreshDomain` with code `EMAIL_NOT_CONFIGURED`.

Mock setup uses `jest.mock('resend')` with stable handles; `createRlsClient` is mocked to return the prisma stub directly (already standard in the codebase — see `notifications.service.spec.ts`).

### Controller tests — `email-domain.controller.spec.ts`

Cases (mirror `stripe-config.controller.spec.ts`):

1. **POST /v1/email-domains** — happy path delegates to service with normalised tenant + user ids.
2. **GET /v1/email-domains** — query param parsing for `page` / `pageSize`.
3. **GET /v1/email-domains/:id** — service called, response returned.
4. **POST /v1/email-domains/:id/refresh** — service called, returns 200 with row.
5. **DELETE /v1/email-domains/:id** — service called, returns 204.
6. **Permission denial** — guard returns false for `configuration.communications.manage` → `ForbiddenException`. Assert service never called.

### Provider enforcement tests — `resend-email.provider.spec.ts` (UPDATE)

Add a `domain verification gate` describe block:

1. **Blocks dispatch when sender domain is unverified** — `getVerified` returns null → `{ skipped: true, reason: 'sender_domain_unverified' }`. Resend `emails.send` never called.
2. **Proceeds when sender domain is verified** — `getVerified` returns a verified row → Resend called → `{ messageId }` returned.
3. **Bypasses the gate when COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV=true** — `getVerified` never called, dispatch proceeds even with no verified row.
4. **Returns invalid_from_email when from has no @** — config has malformed `from_email` → `{ skipped: true, reason: 'invalid_from_email' }`.

### Cron tests — `domain-verification-refresh.processor.spec.ts`

1. **Multiple tenants, mixed outcomes** — seed 3 pending rows: tenant A has 2 (one verifies, one stays pending), tenant B has 1 (verifies). Mock Resend per row. Assert applier called 3 times. Assert 2 verified-notifications enqueued, 1 not.
2. **Skips tenant without email config** — pending row exists, but `tenantEmailConfig.findUnique` returns null. Assert applier not called for that tenant; warning logged; other tenants still processed.
3. **Tolerates Resend network error per-row** — first call throws, subsequent succeed. Assert `applyFailure` called for the failing row; remaining rows still processed.
4. **Idempotent** — run process() twice with the same Resend mocks. Assert second run produces no new notifications and no thrash on already-verified rows.
5. **Wrong job name skips** — `process({ name: 'something:else' })` → no DB calls.

### Worker dispatch enforcement test — `dispatch-notifications.processor.spec.ts` (UPDATE)

Add: email-channel job with unverified sender domain → status=failed, failure_reason=`sender_domain_unverified`. Same with bypass flag → succeeds.

### AppModule DI smoke

Run the snippet from IMPLEMENTATION_LOG.md Rule 6. The `EMAIL_DOMAIN_NOTIFIER` indirection (§1.1) exists specifically to keep this graph acyclic — if DI fails, that's the first place to look.

### Regression run

```bash
pnpm turbo run test --filter=@school/api --filter=@school/worker --filter=@school/shared
pnpm turbo run type-check
pnpm turbo run lint
```

Coverage must stay ≥ baseline.

---

## Verification (local dev server)

Mandatory per Rule 27a. Capture timestamps + console errors in the §5 completion record.

### 0. Prerequisites

- Wave 1 + 2 + Impl 04 already merged into the worktree (schema, permissions, `EmailConfigService`, provider refactor done).
- `tenant_email_configs` row exists for at least one tenant in the dev DB. You may temporarily seed one with a Resend free-tier sandbox API key.
- Local Postgres + Redis running (`docker compose up -d`).

### 1. Spin up

```bash
pnpm install
pnpm --filter @school/prisma migrate
pnpm --filter @school/prisma seed
pnpm dev
```

Confirm worker logs include `Registered repeatable cron: comms:domain-verification-refresh (every 30 min)`.

### 2. Register a domain via curl

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"owner@nhqs.test","password":"Password123!"}' | jq -r .access_token)

curl -X POST http://localhost:3001/api/v1/email-domains \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"domain":"school.example.org"}' | jq
```

Expected: `{ id, domain: 'school.example.org', status: 'pending', dns_records_json: [3 records], spf/dkim/dmarc_status: 'pending', ... }`. Visit Resend dashboard → Domains, confirm the domain appears as pending.

### 3. Inspect the row

```sql
SELECT id, domain, status, spf_status, dkim_status, dmarc_status,
       jsonb_pretty(dns_records_json)
  FROM tenant_email_domains WHERE tenant_id = '<NHQS_TENANT_ID>';
```

Confirm 3 records (SPF/DKIM/DMARC) with `status='pending'`.

### 4. Manual refresh

```bash
curl -X POST http://localhost:3001/api/v1/email-domains/<id>/refresh \
  -H "Authorization: Bearer $TOKEN" | jq
```

Status will most likely stay `pending` for a real domain (DNS hasn't been published yet); if you used Resend's `onboarding@resend.dev` sandbox the status flips to `verified` and `verified_at` populates.

Tail worker logs to see the cron fire on the next 30-min boundary:

```bash
pnpm --filter @school/worker dev 2>&1 | grep -E "(domain-verification-refresh|Refreshing.*pending domain)"
```

### 5. Dispatch enforcement — unverified blocks

With no verified domain, trigger any module that fires email (e.g., issue an invoice):

```bash
curl -X POST http://localhost:3001/api/v1/finance/invoices/<id>/issue \
  -H "Authorization: Bearer $TOKEN"
```

Then:

```sql
SELECT id, status, failure_reason FROM notification ORDER BY created_at DESC LIMIT 1;
-- expected: failed | sender_domain_unverified
```

### 6. Dev bypass

```bash
COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV=true pnpm --filter @school/api dev
```

Re-run the dispatch trigger. The notification should now reach `status='sent'` (assuming the test Resend key works in sandbox mode). Restore `COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV=false` once verified.

### 7. Delete

```bash
curl -X DELETE http://localhost:3001/api/v1/email-domains/<id> \
  -H "Authorization: Bearer $TOKEN" -i
# expected: HTTP/1.1 204 No Content
```

Confirm row gone (`SELECT FROM tenant_email_domains` empty for that tenant) and Redis cache cleared (`redis-cli GET email-domain:verified:<tenant>:school.example.org` → `(nil)`).

### 8. Audit log spot-check

```sql
SELECT entity_type, action, meta FROM security_audit_log
 WHERE entity_type = 'tenant_email_domain'
 ORDER BY created_at DESC LIMIT 10;
```

Confirm `create`, `update`, `delete` rows with no plaintext API keys in `meta`.

---

## Files touched

### NEW

```
apps/api/src/modules/communications/deliverability/email-domain.service.ts
apps/api/src/modules/communications/deliverability/email-domain.service.spec.ts
apps/api/src/modules/communications/deliverability/email-domain.controller.ts
apps/api/src/modules/communications/deliverability/email-domain.controller.spec.ts
apps/api/src/modules/communications/deliverability/email-domain-notifier.token.ts
apps/api/src/modules/communications/deliverability/email-domain-notifier.adapter.ts
apps/api/src/modules/communications/deliverability/dns-records.types.ts

apps/worker/src/processors/communications/domain-verification-refresh.processor.ts
apps/worker/src/processors/communications/domain-verification-refresh.processor.spec.ts
apps/worker/src/processors/communications/domain-refresh-applier.service.ts
apps/worker/src/processors/communications/domain-refresh-applier.service.spec.ts
apps/worker/src/processors/communications/email-domain-lookup.service.ts
apps/worker/src/processors/communications/email-domain-lookup.service.spec.ts
```

### UPDATE

```
apps/api/src/modules/communications/communications.module.ts          # +EmailDomainController, +EmailDomainService, notifier binding
apps/api/src/modules/communications/providers/resend-email.provider.ts # +domain verification gate
apps/api/src/modules/communications/providers/resend-email.provider.spec.ts
apps/api/src/config/env-schema.ts                                      # +COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV
.env.example                                                           # +flag doc

apps/worker/src/worker.module.ts                                       # +cron processor, applier, lookup
apps/worker/src/cron/cron-scheduler.service.ts                         # +cron registration
apps/worker/src/processors/communications/dispatch-notifications.processor.ts # +verified-domain check + bypass

packages/shared/src/schemas/communication-config.schema.ts             # confirm registerEmailDomainSchema
packages/shared/src/constants/notification-types.ts                    # +'email_domain.verified'
packages/shared/src/index.ts                                           # re-export RegisterEmailDomainDto

packages/prisma/seed/notification-templates.ts                         # +platform email_domain.verified template (en+ar)
```

### Shared-file claims (Rule 17)

Before editing, claim in §5 of `IMPLEMENTATION_LOG.md`:

- `apps/api/src/modules/communications/communications.module.ts`
- `apps/api/src/modules/communications/providers/resend-email.provider.ts` (Impl 04 owns the original refactor; this impl layers on top — coordinate)
- `apps/worker/src/worker.module.ts`
- `apps/worker/src/cron/cron-scheduler.service.ts`
- `apps/worker/src/processors/communications/dispatch-notifications.processor.ts` (Impl 05 owns; this impl layers)
- `packages/shared/src/constants/notification-types.ts`
- `packages/shared/src/index.ts`
- `.env.example`

---

## Rollback

`git revert <commit-sha-range>` from this impl's commits. The `tenant_email_domains` table itself was created by Impl 01 — leave it in place; a revert simply leaves it empty. Redis cache keys (`email-domain:verified:*`) self-expire in 5 minutes; no manual cleanup needed.

If only the dispatch enforcement (§4 hunk) needs to be backed out without losing the registration UX, edit `ResendEmailProvider.dispatch()` to comment out the gate and ship a fix-forward commit; this leaves the `tenant_email_domains` rows intact and the cron continues to run, but every send is allowed regardless of verification. Use only as an emergency mitigation if a misconfiguration starts blocking legitimate dispatches; record the regression in the §5 log entry.

If the cron starts thrashing (e.g., Resend rate-limiting from too many `domains.get` calls), reduce the schedule to every 60 min by editing `cron-scheduler.service.ts`. Idempotency is preserved either way.

---

## Key invariants (re-stated for the executing session)

1. **Tenant-scoped Resend client** — domain registration uses the tenant's per-tenant Resend API key (read via `EmailConfigService.getDecryptedConfig`), never a platform-level key. Each tenant's Resend account owns their domain.
2. **Dispatch refuses unverified senders** — production-mode email dispatch returns `{ skipped: true, reason: 'sender_domain_unverified' }` whenever the sender's domain is not a `status='verified'` row. The fallback chain still tries SMS / WhatsApp / in-app.
3. **Dev bypass is dev-only** — env flag documented in `.env.example` with explicit warning. Zod default in `env-schema.ts` is `'false'`. CI never sets it. Production never sets it.
4. **Cron is idempotent** — re-running mid-cycle (manual `:id/refresh` while the cron fires, or two worker instances racing) cannot corrupt the row. Each refresh is a self-contained transaction; the in-app notification fires only on the `pending → verified` transition.
5. **Audit log captures domain mutations** — `register`, `refresh`, `delete` all flow through `AuditLogInterceptor` with `entity_type='tenant_email_domain'`. No plaintext API keys land in `meta`.
6. **Resend SDK errors surface, never swallow** — every `try/catch` around a Resend call either re-throws as `BadRequestException` (registration), records `failure_reason` on the row (refresh), or logs and continues with local cleanup (delete). Empty `catch {}` blocks are prohibited.
7. **Cache invalidation publishes on the shared bus** — every mutating path calls `invalidate()`, which both deletes the local Redis key and publishes to `comms:config-changed` so subscribers (Impl 04's cache bus) can drop their per-tenant Resend client cache.
8. **No `.env.RESEND_API_KEY` reference** — Impl 05 removed the platform-level key. Any code in this impl that needs a Resend client gets it from `EmailConfigService` exclusively.

---

## Follow-ups for subsequent waves

- **Impl 11 (Frontend Settings UI)** — consumes `GET /v1/email-domains` and `POST /v1/email-domains/:id/refresh` for the Domain Verification Card; calls `DELETE /v1/email-domains/:id`. The DNS records table reads `dns_records_json` — render `name` and `value` with `JetBrains Mono` to make copy-paste into a DNS provider easier.
- **Impl 13 (Tenant backfill)** — seeds a real Resend-verified domain per test tenant (NHQS + stress-a/b/c/d). Uses Resend's free tier; the seed script calls `domains.create`, prints DNS records, waits for human action before flipping to `verified`. A `--use-resend-sandbox` flag populates `onboarding@resend.dev` for quick local testing without DNS work.
- **Impl 14 (Architecture docs)** — adds `tenant_email_domains` to the feature map's Communications row, the cron `comms:domain-verification-refresh` to `event-job-catalog.md`, the `tenant_email_domain.status` state machine (pending → verified | failed) to `state-machines.md`, and a danger-zone entry: "tenant Resend API key rotation requires re-registering the domain — Resend ties domains to API key tokens".
- **V2 — auto-replay queued sends** — when a domain flips to `verified`, replay any `notification` rows skipped with `failure_reason='sender_domain_unverified'` in the previous 24h. Out of scope for V1.
- **V2 — DMARC policy escalation** — once a tenant has been verified for 30 days, surface a recommendation to upgrade their DMARC policy from `p=none` to `p=quarantine` then `p=reject`. UI-only, no backend enforcement. Out of scope for V1.

---

## Session notes

- Resend SDK's `Domains` class exposes `create`, `list`, `get`, `update`, `remove`, `verify`. We use `create`, `get`, `remove`. `verify` is a one-shot poll that Resend acknowledges; we use `get` instead because it returns per-record statuses inline. Avoid `list` — expensive at scale and we always know the specific `resend_domain_id` we want.
- Resend's `DomainStatus` enum includes `temporary_failure` and `not_started` — both map to local `pending`. Only `verified` flips local status to `verified`; only `failed` (permanent) flips a record to `failed`.
- The `DnsRecord` shape used here is intentionally narrower than Resend's full schema — we strip transport / region / TTL fields because the tenant-facing UI doesn't need them.
- 5-min cache TTL is a deliberate trade-off: a tenant who registers and verifies a new domain will still see up to 5 min of "unverified, blocked" sends after the cron flips the row. The explicit `del` on the cache key during the cron's update transaction (already in `invalidate`) collapses the window to single-digit seconds in practice.
- If Resend changes the `record` enum, `normaliseRecords`'s defensive `recordType === 'SPF' || ...` block degrades unknown record types into SPF (fail-open at the per-record layer; the all-three-green check is the load-bearing gate). Avoids hard crashes on schema drift; log a warning if seen.
