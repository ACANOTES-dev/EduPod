# Implementation 08 — WhatsApp Templates + Approval Sync + 24-hour Service Window

> **Wave:** 3
> **Depends on:** 01 (schema for `whatsapp_templates`, `whatsapp_service_windows`), 03 (Zod schemas + `WhatsAppConfigService.getDecryptedConfig`), 04 (provider refactor + per-tenant client cache + Redis pub/sub)
> **Restart targets:** API + worker (worker registers two new crons; API exposes new routes; provider gets a new code path)
> **Deployment route:** worktree commit only (per IMPLEMENTATION_LOG.md Rule 5) — NO CI, NO PRODUCTION. Local dev server testing only.

---

## Goal

Build the WhatsApp Business compliance layer described in `docs/architecture/communication-architecture.md` §3.9. Twilio's WhatsApp policy is hard-edged: outside a 24-hour "service window" (defined as time since the recipient last messaged the business) only **pre-approved templates with parameterised fields** can be delivered. Inside the window, free-form text is allowed. Approved templates carry a Twilio content SID (`HXxxxxxxxx`) that we must persist and replay verbatim on dispatch.

Today the dispatch path ignores both rules. The provider sends free-form text in every case; if a recipient has gone quiet for 25 hours Twilio rejects the request — bad UX, no audit trail in our notification table, and no way for an admin to recover except by re-sending after the recipient writes back. Templates are not modelled at all, which means our outbound to-parents WhatsApp use-cases (invoice reminders, attendance alerts, daily digests) are fundamentally broken once those parents stop messaging the school.

This implementation delivers the full loop:

1. **Template lifecycle** — `whatsapp_templates` table backed by `WhatsAppTemplateService`. Admins create a row with `pending` body + locale + category, submit it to Twilio's content API which returns `HXxxxxxxxx` and a status (initially `submitted`), then a 15-minute cron polls Twilio for the approval verdict and flips the row to `approved` / `rejected`. Admins can pause an approved template (no dispatches) and resume it.
2. **24-hour service window** — `whatsapp_service_windows` table tracks `last_inbound_at` per `(tenant_id, recipient_phone)`. Impl 06's WhatsApp inbound webhook handler is extended to call `recordInbound()` synchronously on every inbound message. A daily cleanup cron prunes rows whose `expires_at` is more than 7 days in the past so the table stays small.
3. **Provider enforcement** — `TwilioWhatsAppProvider.dispatch()` consults the service window first. Inside the window: free-form `body` allowed via `client.messages.create({ body, from, to })`. Outside the window: the dispatch payload MUST carry a `template_key` resolving to an approved row, and the provider sends via `client.messages.create({ from, to, contentSid, contentVariables })`. Free-form sends outside the window are skipped with `failure_reason='outside_service_window_no_template'`. Sends keyed to non-approved (paused / pending / submitted / rejected) templates are skipped with the same reason.
4. **Approval sync cron** — `comms:whatsapp-template-sync` (every 15 min). Cross-tenant. For every row with `status='submitted'`, calls `client.content.fetch(sid)`, updates `status` / `approval_message` / `approved_at` / `last_synced_at`. Sends an in-app notification to the submitting user when the status flips out of `submitted`.
5. **Service window cleanup cron** — `comms:whatsapp-service-window-cleanup` (daily 04:00 UTC). Cross-tenant. Deletes `whatsapp_service_windows` rows where `expires_at < now() - 7 days`.
6. **Controller** — `/v1/whatsapp-templates` CRUD + lifecycle actions (`/submit`, `/sync`, `/pause`, `/resume`), all gated by `configuration.communications.manage` (or `.view` for read-only routes).

The dispatch infrastructure (notification rows, fallback chain, retry, idempotency) stays unchanged. Impl 04 already routes WhatsApp through `TwilioWhatsAppProvider.dispatch()`; this impl plugs two new gates in front of `client.messages.create()` and adds a new code branch for `contentSid`-based sends.

### Key invariants (ALL must hold after this impl ships)

- **WhatsApp dispatch outside the 24h window MUST use an approved template — no exceptions.** Free-form text outside the window is rejected by `TwilioWhatsAppProvider.dispatch()` with `{ skipped: true, reason: 'outside_service_window_no_template' }` BEFORE reaching Twilio. We never let Twilio's API be the gatekeeper because (a) the rejection has no `notification_id` correlation in our system, and (b) Twilio's reject can be 4xx or 5xx depending on the day, polluting our retry counters.
- **Service window is per-tenant per-recipient.** `(tenant_id, recipient_phone)` is the unique key. Tenant A's inbound from `+1234567890` does not open Tenant B's window.
- **Inbound message updates the window IMMEDIATELY (synchronous in the webhook handler).** Subsequent outbound checks must see fresh state. We do not enqueue a job; we write inside the request lifecycle so the next dispatch's `isInsideWindow()` reads the just-updated row.
- **Template approval status drives dispatch eligibility.** Only `status='approved'` rows are returned by `getApprovedByKey()`. Paused, pending, submitted, rejected templates are never dispatched.
- **Sync cron is idempotent.** Running it twice produces no duplicate notifications and no thrash on already-resolved rows. We notify only on the `submitted → approved | rejected` transition.
- **Templates are tenant-scoped.** Tenant A's approved template cannot be used by Tenant B. The unique constraint `(tenant_id, template_key, language_code)` enforces it; the service layer's `tenant_id` filter on every read enforces it again.
- **`notification.template_variables` does NOT exist on the schema today.** Only `notification.template_key` and `notification.payload_json` exist. We carry `template_variables` inside `payload_json.template_variables` (a `Record<string, string>`) and the dispatch service extracts it before calling the provider. This is documented in §11 (Schema gap) — adding a real column is a follow-up if we ever want first-class indexed reporting on which variable values were sent. For V1 the JSONB carrier is sufficient.

---

## What to change

### 1. `apps/api/src/modules/communications/whatsapp-templates/whatsapp-template.service.ts` — NEW

Service owns the lifecycle (`pending → submitted → approved | rejected | paused`). All methods take `tenantId` as the first arg per `CLAUDE.md`. Twilio API errors become `BadRequestException`s with `code='TWILIO_*'` so the caller sees a structured error and the row stays in its current state.

```typescript
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma, WhatsAppTemplate } from '@prisma/client';
import twilio, { type Twilio } from 'twilio';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WhatsAppConfigService } from '../../configuration/whatsapp-config.service';

import type { SubmitWhatsAppTemplateDto } from './whatsapp-template.types';

export interface ListWhatsAppTemplatesFilters {
  status?: 'pending' | 'submitted' | 'approved' | 'rejected' | 'paused';
  language_code?: string;
  template_key?: string;
}

@Injectable()
export class WhatsAppTemplateService {
  private readonly logger = new Logger(WhatsAppTemplateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappConfig: WhatsAppConfigService,
  ) {}

  // ─── Create (status='pending') ─────────────────────────────────────────────

  async createTemplate(
    tenantId: string,
    userId: string,
    dto: SubmitWhatsAppTemplateDto,
  ): Promise<WhatsAppTemplate> {
    const existing = await this.prisma.whatsAppTemplate.findFirst({
      where: {
        tenant_id: tenantId,
        template_key: dto.template_key,
        language_code: dto.language_code,
      },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'TEMPLATE_ALREADY_EXISTS',
        message: `Template "${dto.template_key}" (${dto.language_code}) already exists for this tenant.`,
      });
    }

    // Twilio's content API uses {{1}}, {{2}}, ... numbered placeholders.
    // We do NOT support named placeholders in V1.
    this.assertVariablePlaceholdersValid(dto.body);

    return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      return tx.whatsAppTemplate.create({
        data: {
          tenant_id: tenantId,
          template_key: dto.template_key,
          template_name: dto.template_name ?? dto.template_key,
          language_code: dto.language_code,
          category: dto.category,
          body: dto.body,
          status: 'pending',
          // Audit fields. The submitting user is recorded for the in-app
          // notification on approval/rejection (sync cron uses this).
          // Note: schema has no `created_by_user_id` column on WhatsAppTemplate
          // by default. If absent, surface the user via `submitted_by_user_id`
          // on the submission step instead — coordinate with Impl 01.
        },
      });
    });
  }

  // ─── Submit to Twilio (status: pending → submitted) ────────────────────────

  async submitToTwilio(
    tenantId: string,
    templateId: string,
    _userId: string,
  ): Promise<WhatsAppTemplate> {
    const row = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `WhatsApp template "${templateId}" not found for this tenant.`,
      });
    }
    if (row.status !== 'pending') {
      throw new BadRequestException({
        code: 'TEMPLATE_INVALID_STATE_FOR_SUBMIT',
        message: `Template must be "pending" to submit (current: "${row.status}").`,
      });
    }

    const client = await this.getTwilioClient(tenantId);

    // Twilio's Content API accepts a "twilio/text" content type for simple
    // body templates, plus a separate "approval" submission per category.
    // Variables pass as a positional dictionary keyed by string indices.
    const variables = this.extractVariablePositions(row.body);
    const friendlyName = `${row.template_key}.${row.language_code}`;

    let contentSid: string;
    try {
      const created = await client.content.v1.contents.create({
        friendly_name: friendlyName,
        language: row.language_code,
        variables,
        types: { 'twilio/text': { body: row.body } },
      });
      contentSid = created.sid;

      // Submit for WhatsApp approval — separate API surface from the create.
      await client.content.v1.contents(contentSid).approvalCreate.create({
        name: friendlyName,
        category: row.category,
      });
    } catch (err) {
      const e = err as Error & { code?: number };
      this.logger.error(
        `[submitToTwilio] tenant=${tenantId} template=${row.template_key}: ${e.message}`,
      );
      throw new BadRequestException({
        code: 'TWILIO_SUBMIT_FAILED',
        message: `Twilio rejected template submission: ${e.message}`,
        details: { twilio_error_code: e.code },
      });
    }

    return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      return tx.whatsAppTemplate.update({
        where: { id: row.id },
        data: {
          status: 'submitted',
          twilio_template_sid: contentSid,
          submitted_at: new Date(),
          last_synced_at: new Date(),
        },
      });
    });
  }

  // ─── Sync (submitted → approved | rejected) ────────────────────────────────

  async syncApprovalStatus(tenantId: string, templateId: string): Promise<WhatsAppTemplate> {
    const row = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `WhatsApp template "${templateId}" not found for this tenant.`,
      });
    }
    if (row.status !== 'submitted') {
      // Idempotency: caller can hit /sync on an already-resolved row; we
      // simply return the row unchanged. The cron also relies on this
      // shortcut to skip work it already did.
      return row;
    }
    if (!row.twilio_template_sid) {
      throw new BadRequestException({
        code: 'TEMPLATE_MISSING_SID',
        message: 'Template was marked submitted without a Twilio SID — re-submit it.',
      });
    }

    const client = await this.getTwilioClient(tenantId);

    let approvalStatus: string;
    let approvalReason: string | null;
    try {
      const fetched = await client.content.v1.contents(row.twilio_template_sid).fetch();
      const approvals =
        (
          fetched as unknown as {
            approval_requests?: Array<{ status?: string; rejection_reason?: string }>;
          }
        ).approval_requests ?? [];
      const latest = approvals[approvals.length - 1];
      approvalStatus = latest?.status ?? 'pending';
      approvalReason = latest?.rejection_reason ?? null;
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: number };
      this.logger.error(
        `[syncApprovalStatus] tenant=${tenantId} template=${row.template_key}: ${e.message}`,
      );
      // Don't flip the row on transient errors — retry next cron tick.
      throw new BadRequestException({
        code: 'TWILIO_SYNC_FAILED',
        message: `Twilio sync failed: ${e.message}`,
        details: { twilio_error_code: e.code },
      });
    }

    const nextStatus = mapTwilioApprovalToLocalStatus(approvalStatus);

    return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      return tx.whatsAppTemplate.update({
        where: { id: row.id },
        data: {
          status: nextStatus,
          approval_message: approvalReason,
          approved_at: nextStatus === 'approved' ? new Date() : row.approved_at,
          last_synced_at: new Date(),
        },
      });
    });
  }

  // ─── List / get (read-only) ────────────────────────────────────────────────

  async listTemplates(
    tenantId: string,
    filters: ListWhatsAppTemplatesFilters = {},
    page = 1,
    pageSize = 20,
  ) {
    const where: Prisma.WhatsAppTemplateWhereInput = {
      tenant_id: tenantId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.language_code ? { language_code: filters.language_code } : {}),
      ...(filters.template_key ? { template_key: filters.template_key } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.whatsAppTemplate.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.whatsAppTemplate.count({ where }),
    ]);
    return { data: rows, meta: { page, pageSize, total } };
  }

  async getTemplate(tenantId: string, templateId: string): Promise<WhatsAppTemplate | null> {
    return this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, tenant_id: tenantId },
    });
  }

  // ─── Hot-path read used by TwilioWhatsAppProvider.dispatch() ───────────────

  /**
   * Returns the approved template row for `(tenant_id, template_key, language_code)`,
   * or `null` if no approved row exists. **Paused / pending / submitted /
   * rejected rows return null** — only `approved` is dispatchable.
   */
  async getApprovedByKey(
    tenantId: string,
    templateKey: string,
    languageCode: string,
  ): Promise<WhatsAppTemplate | null> {
    return this.prisma.whatsAppTemplate.findFirst({
      where: {
        tenant_id: tenantId,
        template_key: templateKey,
        language_code: languageCode,
        status: 'approved',
      },
    });
  }

  // ─── Pause / resume (lifecycle controls) ───────────────────────────────────

  async pauseTemplate(
    tenantId: string,
    templateId: string,
    _userId: string,
  ): Promise<WhatsAppTemplate> {
    const row = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `WhatsApp template "${templateId}" not found for this tenant.`,
      });
    }
    if (row.status !== 'approved') {
      throw new BadRequestException({
        code: 'TEMPLATE_INVALID_STATE_FOR_PAUSE',
        message: `Only approved templates can be paused (current: "${row.status}").`,
      });
    }
    return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction((tx) =>
      tx.whatsAppTemplate.update({
        where: { id: row.id },
        data: { status: 'paused' },
      }),
    );
  }

  async resumeTemplate(
    tenantId: string,
    templateId: string,
    _userId: string,
  ): Promise<WhatsAppTemplate> {
    const row = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `WhatsApp template "${templateId}" not found for this tenant.`,
      });
    }
    if (row.status !== 'paused') {
      throw new BadRequestException({
        code: 'TEMPLATE_INVALID_STATE_FOR_RESUME',
        message: `Only paused templates can be resumed (current: "${row.status}").`,
      });
    }
    return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction((tx) =>
      tx.whatsAppTemplate.update({
        where: { id: row.id },
        data: { status: 'approved' },
      }),
    );
  }

  // ─── Delete (also removes from Twilio) ─────────────────────────────────────

  async deleteTemplate(tenantId: string, templateId: string, _userId: string): Promise<void> {
    const row = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `WhatsApp template "${templateId}" not found for this tenant.`,
      });
    }
    if (row.twilio_template_sid) {
      try {
        const client = await this.getTwilioClient(tenantId);
        await client.content.v1.contents(row.twilio_template_sid).remove();
      } catch (err) {
        // Tolerate Twilio 404 — the row is gone there but we still need to
        // purge ours. Log other errors but proceed with the local delete.
        const e = err as Error & { statusCode?: number };
        if (e.statusCode !== 404) {
          this.logger.warn(
            `[deleteTemplate] Twilio remove failed for ${row.twilio_template_sid}: ${e.message}; continuing local delete`,
          );
        }
      }
    }
    await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction((tx) =>
      tx.whatsAppTemplate.delete({ where: { id: row.id } }),
    );
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private async getTwilioClient(tenantId: string): Promise<Twilio> {
    const config = await this.whatsappConfig.getDecryptedConfig(tenantId);
    if (!config) {
      throw new BadRequestException({
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'WhatsApp is not configured for this tenant.',
      });
    }
    return twilio(config.twilio_account_sid, config.twilio_auth_token);
  }

  /**
   * Twilio template bodies use `{{1}}`, `{{2}}`, ... positional placeholders.
   * We accept that exact form. Named placeholders (`{{name}}`) and gappy
   * sequences (`{{1}}` and `{{3}}` with no `{{2}}`) are rejected at
   * create-time so the row that gets submitted is the row Twilio will
   * accept.
   */
  private assertVariablePlaceholdersValid(body: string): void {
    const matches = [...body.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]);
    const numeric = matches.map((m) => Number.parseInt(m, 10));
    if (numeric.some((n) => !Number.isInteger(n) || n <= 0)) {
      throw new BadRequestException({
        code: 'TEMPLATE_INVALID_PLACEHOLDER',
        message:
          'WhatsApp template bodies use positional placeholders only. Use {{1}}, {{2}}, ... — named placeholders are not supported.',
      });
    }
    const sorted = [...new Set(numeric)].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) {
        throw new BadRequestException({
          code: 'TEMPLATE_PLACEHOLDER_GAP',
          message: `Placeholder positions must be sequential starting at {{1}}. Got ${sorted.join(', ')}.`,
        });
      }
    }
  }

  /**
   * Convert `{{1}}`, `{{2}}` placeholder positions into Twilio's
   * `variables` map (`{ "1": "<sample>", "2": "<sample>" }`). Twilio uses
   * the sample values as preview text during their approval review.
   */
  private extractVariablePositions(body: string): Record<string, string> {
    const matches = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]);
    const out: Record<string, string> = {};
    for (const m of new Set(matches)) {
      out[m] = `sample_${m}`;
    }
    return out;
  }
}

// ─── Pure helpers (exported for spec coverage) ────────────────────────────────

export function mapTwilioApprovalToLocalStatus(
  twilioStatus: string,
): 'submitted' | 'approved' | 'rejected' {
  const lc = twilioStatus.toLowerCase();
  if (lc === 'approved') return 'approved';
  if (lc === 'rejected' || lc === 'failed') return 'rejected';
  return 'submitted';
}
```

### 2. `apps/api/src/modules/communications/whatsapp-templates/whatsapp-template.types.ts` — NEW

```typescript
import { z } from 'zod';

import { submitWhatsAppTemplateSchema } from '@school/shared';

export { submitWhatsAppTemplateSchema };
export type SubmitWhatsAppTemplateDto = z.infer<typeof submitWhatsAppTemplateSchema>;

export const listWhatsAppTemplatesQuerySchema = z.object({
  status: z.enum(['pending', 'submitted', 'approved', 'rejected', 'paused']).optional(),
  language_code: z.string().min(2).max(16).optional(),
  template_key: z.string().min(1).max(128).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
export type ListWhatsAppTemplatesQueryDto = z.infer<typeof listWhatsAppTemplatesQuerySchema>;
```

### 3. `apps/api/src/modules/communications/whatsapp-templates/whatsapp-service-window.service.ts` — NEW

Owns the per-tenant per-recipient inbound timestamp. Three responsibilities:

- **`recordInbound(tenantId, recipientPhone)`** — upsert the row, set `last_inbound_at = now()`, `expires_at = now() + 24h`. Called synchronously from Impl 06's WhatsApp inbound webhook handler. Also invalidates the Redis cache key for this `(tenantId, recipientPhone)` pair so the next `isInsideWindow` read sees the fresh state.
- **`isInsideWindow(tenantId, recipientPhone)`** — Redis-cached read (5-min TTL keyed `whatsapp-window:{tenantId}:{recipientPhone}`) used by `TwilioWhatsAppProvider.dispatch()`. Returns `true` if `expires_at > now()`.
- **`cleanupExpired()`** — daily cron entry point. Deletes rows whose `expires_at < now() - 7 days` so the table doesn't grow forever. Returns the deleted count for logging / metrics.

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../../common/prisma/prisma.service';

const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000; // 24h
const CACHE_TTL_SECONDS = 5 * 60; // 5 min — short enough that a stale cache after a tenant manually purges won't outlast a single cron tick
const CLEANUP_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days post-expiry

@Injectable()
export class WhatsAppServiceWindowService {
  private readonly logger = new Logger(WhatsAppServiceWindowService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  /**
   * Called from Impl 06's WhatsApp inbound webhook handler. Idempotent —
   * if the row already exists we extend `expires_at`; if not we create.
   *
   * MUST run inside the webhook request lifecycle (not a background job)
   * so the next outbound dispatch's window check sees the new state.
   */
  async recordInbound(tenantId: string, recipientPhone: string): Promise<void> {
    const normalised = normalisePhone(recipientPhone);
    if (!normalised) return; // garbage phone numbers don't open windows
    const now = new Date();
    const expiresAt = new Date(now.getTime() + WINDOW_DURATION_MS);

    await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      await tx.whatsAppServiceWindow.upsert({
        where: {
          tenant_id_recipient_phone: {
            tenant_id: tenantId,
            recipient_phone: normalised,
          },
        },
        create: {
          tenant_id: tenantId,
          recipient_phone: normalised,
          last_inbound_at: now,
          expires_at: expiresAt,
        },
        update: {
          last_inbound_at: now,
          expires_at: expiresAt,
        },
      });
    });

    // Bust the Redis cache so the very next isInsideWindow() reads fresh.
    await this.redis.del(this.cacheKey(tenantId, normalised));
    this.logger.log(
      `[recordInbound] tenant=${tenantId} phone=${normalised} window expires_at=${expiresAt.toISOString()}`,
    );
  }

  /**
   * Hot path read used by TwilioWhatsAppProvider.dispatch(). Cached for 5
   * minutes per (tenant_id, recipient_phone). On cache miss, read the
   * window row outside the RLS transaction (prefix match on the partition,
   * read is harmless if it returns another tenant's row — Prisma `where`
   * still scopes to `tenant_id`).
   */
  async isInsideWindow(tenantId: string, recipientPhone: string): Promise<boolean> {
    const normalised = normalisePhone(recipientPhone);
    if (!normalised) return false;
    const key = this.cacheKey(tenantId, normalised);
    const cached = await this.redis.get(key);
    if (cached !== null) {
      // Cached value is the unix-ms `expires_at`. A cached '0' encodes
      // "no row exists" so we don't repeatedly hit the DB for cold
      // recipients we have never heard from.
      const expiresMs = Number.parseInt(cached, 10);
      if (!Number.isFinite(expiresMs)) return false;
      return expiresMs > Date.now();
    }

    const row = await this.prisma.whatsAppServiceWindow.findUnique({
      where: {
        tenant_id_recipient_phone: {
          tenant_id: tenantId,
          recipient_phone: normalised,
        },
      },
    });
    const expiresMs = row?.expires_at ? row.expires_at.getTime() : 0;
    await this.redis.set(key, expiresMs.toString(), 'EX', CACHE_TTL_SECONDS);
    return expiresMs > Date.now();
  }

  /**
   * Daily cron entry point. Deletes service-window rows whose `expires_at`
   * is more than 7 days in the past. Hot rows (still inside the 24h
   * window OR within the 7-day grace period for diagnostics) are kept.
   *
   * Returns the deleted count for logging / metrics.
   */
  async cleanupExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - CLEANUP_RETENTION_MS);
    // Cron is cross-tenant; we deliberately bypass RLS for the deletion
    // since this runs under the worker's PRISMA_CLIENT (not the API's
    // RLS-wrapped client) and the WHERE clause is global.
    const result = await this.prisma.whatsAppServiceWindow.deleteMany({
      where: { expires_at: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log(`[cleanupExpired] deleted ${result.count} stale service-window row(s)`);
    }
    return result.count;
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private cacheKey(tenantId: string, normalised: string): string {
    return `whatsapp-window:${tenantId}:${normalised}`;
  }
}

// ─── Pure helpers (exported for spec coverage) ────────────────────────────────

/**
 * Strip `whatsapp:` prefix and collapse `+`-prefixed E.164 to a canonical
 * `+12345...` form. Returns null for inputs we cannot canonicalise — the
 * caller must treat those as "no window opened".
 */
export function normalisePhone(raw: string): string | null {
  if (!raw) return null;
  const stripped = raw.startsWith('whatsapp:') ? raw.slice('whatsapp:'.length) : raw;
  const trimmed = stripped.trim();
  if (!trimmed) return null;
  // Permit a leading '+' followed by 8–16 digits.
  if (!/^\+\d{8,16}$/.test(trimmed)) return null;
  return trimmed;
}
```

### 4. `apps/api/src/modules/communications/whatsapp-templates/whatsapp-template.controller.ts` — NEW

All routes gated by `configuration.communications.{view,manage}` per the permissions Impl 02 seeded. Static routes precede dynamic ones (`:id` last).

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

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { WhatsAppTemplateService } from './whatsapp-template.service';
import {
  listWhatsAppTemplatesQuerySchema,
  submitWhatsAppTemplateSchema,
  type ListWhatsAppTemplatesQueryDto,
  type SubmitWhatsAppTemplateDto,
} from './whatsapp-template.types';

@Controller('v1/whatsapp-templates')
@UseGuards(AuthGuard, PermissionGuard)
export class WhatsAppTemplateController {
  constructor(private readonly templates: WhatsAppTemplateService) {}

  // POST /v1/whatsapp-templates
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('configuration.communications.manage')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(submitWhatsAppTemplateSchema)) dto: SubmitWhatsAppTemplateDto,
  ) {
    return this.templates.createTemplate(tenant.tenant_id, user.sub, dto);
  }

  // GET /v1/whatsapp-templates
  @Get()
  @RequiresPermission('configuration.communications.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listWhatsAppTemplatesQuerySchema))
    query: ListWhatsAppTemplatesQueryDto,
  ) {
    return this.templates.listTemplates(
      tenant.tenant_id,
      {
        status: query.status,
        language_code: query.language_code,
        template_key: query.template_key,
      },
      query.page,
      query.pageSize,
    );
  }

  // POST /v1/whatsapp-templates/:id/submit
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('configuration.communications.manage')
  async submit(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.submitToTwilio(tenant.tenant_id, id, user.sub);
  }

  // POST /v1/whatsapp-templates/:id/sync
  @Post(':id/sync')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('configuration.communications.manage')
  async sync(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.syncApprovalStatus(tenant.tenant_id, id);
  }

  // POST /v1/whatsapp-templates/:id/pause
  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('configuration.communications.manage')
  async pause(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.pauseTemplate(tenant.tenant_id, id, user.sub);
  }

  // POST /v1/whatsapp-templates/:id/resume
  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('configuration.communications.manage')
  async resume(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templates.resumeTemplate(tenant.tenant_id, id, user.sub);
  }

  // GET /v1/whatsapp-templates/:id
  @Get(':id')
  @RequiresPermission('configuration.communications.view')
  async getOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.getTemplate(tenant.tenant_id, id);
  }

  // DELETE /v1/whatsapp-templates/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPermission('configuration.communications.manage')
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.templates.deleteTemplate(tenant.tenant_id, id, user.sub);
  }
}
```

### 5. `TwilioWhatsAppProvider.dispatch()` — UPDATE

Impl 04 refactors `TwilioWhatsAppProvider.dispatch()` to read tenant config and return `{ skipped: true, reason } | { messageSid }`. This impl plugs the service-window check and the template-required-outside-window check between the suppression check and the actual `client.messages.create()` call. The provider gains two new constructor deps (`WhatsAppTemplateService`, `WhatsAppServiceWindowService`) — coordinate via Rule 17 with any other impl that touches this provider.

```typescript
// apps/api/src/modules/communications/providers/twilio-whatsapp.provider.ts
// (post-Impl 04 + Impl 06 + Impl 08 — partial illustrative excerpt)

import { Injectable, Logger } from '@nestjs/common';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { WhatsAppConfigService } from '../../configuration/whatsapp-config.service';
import { PerTenantClientCache } from './per-tenant-client-cache';
import { SuppressionListService } from '../suppression/suppression-list.service';
import { WhatsAppServiceWindowService } from '../whatsapp-templates/whatsapp-service-window.service';
import { WhatsAppTemplateService } from '../whatsapp-templates/whatsapp-template.service';

export interface WhatsAppDispatchPayload {
  tenant_id: string;
  to: string; // E.164
  body?: string; // free-form (inside service window only)
  template_key?: string; // required outside service window
  template_variables?: Record<string, string>;
  locale: string; // 'en' | 'ar' etc — joins WhatsAppTemplate.language_code
}

export type WhatsAppDispatchResult = { messageSid: string } | { skipped: true; reason: string };

@Injectable()
export class TwilioWhatsAppProvider {
  private readonly logger = new Logger(TwilioWhatsAppProvider.name);

  constructor(
    private readonly whatsappConfig: WhatsAppConfigService,
    private readonly suppressionService: SuppressionListService,
    private readonly serviceWindow: WhatsAppServiceWindowService,
    private readonly templates: WhatsAppTemplateService,
    private readonly clientCache: PerTenantClientCache,
    private readonly circuitBreaker: CircuitBreakerRegistry,
  ) {}

  async dispatch(payload: WhatsAppDispatchPayload): Promise<WhatsAppDispatchResult> {
    const tenantId = payload.tenant_id;

    // 0. Suppression check (Impl 06 wires this — quoted for completeness)
    if (await this.suppressionService.isSuppressed(tenantId, 'whatsapp', payload.to)) {
      return { skipped: true, reason: 'suppressed' };
    }

    // 1. Tenant config
    const config = await this.whatsappConfig.getDecryptedConfig(tenantId);
    if (!config?.is_enabled) {
      return { skipped: true, reason: 'channel_not_configured' };
    }

    // 2. Service-window check (Impl 08 — THIS IMPL)
    const insideWindow = await this.serviceWindow.isInsideWindow(tenantId, payload.to);

    let messageBody: string | undefined;
    let contentSid: string | undefined;
    let contentVariables: string | undefined;

    if (insideWindow) {
      // Free-form allowed inside the window. We still allow a template
      // path because some senders prefer the consistency of templates
      // even inside the window — but a body is the simpler default.
      if (payload.body && payload.body.trim().length > 0) {
        messageBody = payload.body;
      } else if (payload.template_key) {
        const tpl = await this.templates.getApprovedByKey(
          tenantId,
          payload.template_key,
          payload.locale,
        );
        if (!tpl) {
          // Inside window but they asked for a template that isn't approved.
          // This is still a valid free-form fallback opportunity but the
          // caller did not provide a body. Refuse loudly.
          return { skipped: true, reason: 'template_not_approved_inside_window' };
        }
        contentSid = tpl.twilio_template_sid ?? undefined;
        contentVariables = JSON.stringify(payload.template_variables ?? {});
      } else {
        return { skipped: true, reason: 'whatsapp_payload_missing_body_and_template' };
      }
    } else {
      // OUTSIDE the 24h window — only approved templates are allowed.
      if (!payload.template_key) {
        return { skipped: true, reason: 'outside_service_window_no_template' };
      }
      const tpl = await this.templates.getApprovedByKey(
        tenantId,
        payload.template_key,
        payload.locale,
      );
      if (!tpl || !tpl.twilio_template_sid) {
        return { skipped: true, reason: 'outside_service_window_no_template' };
      }
      contentSid = tpl.twilio_template_sid;
      contentVariables = JSON.stringify(payload.template_variables ?? {});
    }

    // 3. Per-tenant client cache (Impl 04)
    const client = await this.clientCache.getOrCreateWhatsApp(tenantId, config);

    // 4. Send
    const to = payload.to.startsWith('whatsapp:') ? payload.to : `whatsapp:${payload.to}`;
    const from = config.twilio_whatsapp_from_number.startsWith('whatsapp:')
      ? config.twilio_whatsapp_from_number
      : `whatsapp:${config.twilio_whatsapp_from_number}`;

    try {
      const message = await this.circuitBreaker.exec(`twilio:${tenantId}`, () =>
        client.messages.create({
          from,
          to,
          ...(messageBody !== undefined ? { body: messageBody } : {}),
          ...(contentSid !== undefined ? { contentSid, contentVariables } : {}),
        }),
      );
      return { messageSid: message.sid };
    } catch (err) {
      const e = err as Error & { code?: number; status?: number };
      this.logger.error(
        `[TwilioWhatsAppProvider] tenant=${tenantId} to=${payload.to}: ${e.message}`,
      );
      throw err; // Dispatch service translates to status='failed' + retry
    }
  }
}
```

#### 5.1 Notification dispatch service — extract `template_key` + `template_variables` from `payload_json`

`apps/api/src/modules/communications/notification-dispatch.service.ts` (existing, untouched by Impl 04 in spirit) is the layer that calls `TwilioWhatsAppProvider.dispatch()`. Today it passes `{ to, body }`. Update the WhatsApp branch to also extract `template_key` and `template_variables`:

```typescript
case 'whatsapp': {
  const tplVars =
    notification.payload_json && typeof notification.payload_json === 'object'
      ? ((notification.payload_json as Record<string, unknown>).template_variables as
          | Record<string, string>
          | undefined)
      : undefined;

  return this.whatsapp.dispatch({
    tenant_id: notification.tenant_id,
    to: recipient.whatsapp_number ?? recipient.phone ?? '',
    body: rendered.body,                       // free-form (used inside window)
    template_key: notification.template_key ?? undefined,
    template_variables: tplVars,
    locale: notification.locale,
  });
}
```

**Important — schema gap (§11):** `notification.template_variables` is NOT a column. The dispatch service reads `payload_json.template_variables`. Every caller of `NotificationsService.dispatch()` that wants WhatsApp template variables MUST stuff them into `payload_json.template_variables` as `Record<string, string>`. Document this on `NotificationsService.dispatch()`'s JSDoc in the same commit. A first-class column is a follow-up if usage grows.

### 6. Impl 06 webhook handler integration — UPDATE (shared-file edit, Rule 17)

`apps/api/src/modules/communications/webhooks/twilio-webhook-handler.service.ts` was introduced by Impl 06. Its `handleWhatsApp()` method already detects inbound messages (no `MessageStatus`, has `From`/`To` flipped) and currently logs a TODO note ("service-window update deferred to Impl 08"). This impl replaces the stub with a real call to `WhatsAppServiceWindowService.recordInbound()`.

```typescript
// twilio-webhook-handler.service.ts — UPDATE only the inbound branch

import { WhatsAppServiceWindowService } from '../whatsapp-templates/whatsapp-service-window.service';

@Injectable()
export class TwilioWebhookHandlerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suppressionService: SuppressionListService,
    private readonly serviceWindow: WhatsAppServiceWindowService, // NEW (Impl 08)
  ) {}

  async handleWhatsApp(tenantId: string, params: Record<string, string>): Promise<void> {
    const isInbound = !params['MessageStatus'] && Boolean(params['From']);
    if (isInbound) {
      // Twilio inbound `From` includes the `whatsapp:` prefix — the
      // service window service strips it during normalisation.
      const fromPhone = params['From'] ?? '';
      try {
        await this.serviceWindow.recordInbound(tenantId, fromPhone);
      } catch (err) {
        // A failed window update must never crash the webhook receiver —
        // Twilio retries on 5xx and we'd rather process the rest of the
        // payload than spam failures. Log and continue.
        this.logger.error(
          `[handleWhatsApp inbound] tenant=${tenantId} from=${fromPhone}: ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        );
      }
      return;
    }

    await this.handleStatusCallback(tenantId, params, 'whatsapp');
  }
}
```

This is a **shared-file edit**. Per IMPLEMENTATION_LOG.md Rule 17, claim `twilio-webhook-handler.service.ts` in §5 of the log before editing. Coordinate with any other Wave 3 session that touches webhooks (notably Impl 06 if it lands later). If Impl 06 has already shipped to the worktree, your edit layers on top of its commit; if not, hold the claim until Impl 06's commit lands and you can rebase your hunk.

### 7. Approval-sync cron — `apps/worker/src/processors/communications/whatsapp-template-sync.processor.ts` — NEW

Cross-tenant cron, runs every 15 minutes. Iterates `whatsapp_templates` where `status='submitted'`, groups by tenant, instantiates one Twilio client per tenant, calls `client.content.fetch(sid)` per row, applies the update and enqueues an in-app notification on `submitted → approved | rejected` transitions.

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient, WhatsAppTemplate } from '@prisma/client';
import { Job, Queue } from 'bullmq';
import twilio, { type Twilio } from 'twilio';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { EncryptionService } from '../../base/encryption.service';

import { mapTwilioApprovalToLocalStatus } from '../../../api/src/modules/communications/whatsapp-templates/whatsapp-template.service';

export const WHATSAPP_TEMPLATE_SYNC_JOB = 'comms:whatsapp-template-sync';

interface SubmittedRow {
  id: string;
  tenant_id: string;
  template_key: string;
  language_code: string;
  twilio_template_sid: string | null;
  // The user who submitted the row — populated by the controller's
  // `userId` argument (Impl 03 stores it on `submitted_by_user_id` per the
  // schema. If the column is named differently, update this projection).
  submitted_by_user_id: string | null;
}

@Injectable()
export class WhatsAppTemplateSyncProcessor {
  private readonly logger = new Logger(WhatsAppTemplateSyncProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly encryption: EncryptionService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
  ) {}

  async process(job: Job): Promise<void> {
    if (job.name !== WHATSAPP_TEMPLATE_SYNC_JOB) return;

    const submitted = (await this.prisma.whatsAppTemplate.findMany({
      where: { status: 'submitted' },
      select: {
        id: true,
        tenant_id: true,
        template_key: true,
        language_code: true,
        twilio_template_sid: true,
        submitted_by_user_id: true,
      },
    })) as SubmittedRow[];

    if (submitted.length === 0) {
      this.logger.log('No submitted WhatsApp templates to sync.');
      return;
    }
    this.logger.log(`Syncing ${submitted.length} submitted template(s).`);

    const byTenant = new Map<string, SubmittedRow[]>();
    for (const row of submitted) {
      const arr = byTenant.get(row.tenant_id) ?? [];
      arr.push(row);
      byTenant.set(row.tenant_id, arr);
    }

    for (const [tenantId, rows] of byTenant.entries()) {
      const client = await this.buildTwilioClient(tenantId);
      if (!client) {
        this.logger.warn(
          `Tenant ${tenantId}: no WhatsApp config; skipping ${rows.length} submitted template(s)`,
        );
        continue;
      }
      for (const row of rows) {
        if (!row.twilio_template_sid) continue;
        try {
          const fetched = await client.content.v1.contents(row.twilio_template_sid).fetch();
          const approvals =
            (
              fetched as unknown as {
                approval_requests?: Array<{ status?: string; rejection_reason?: string }>;
              }
            ).approval_requests ?? [];
          const latest = approvals[approvals.length - 1];
          const twilioStatus = latest?.status ?? 'pending';
          const reason = latest?.rejection_reason ?? null;
          const nextStatus = mapTwilioApprovalToLocalStatus(twilioStatus);
          if (nextStatus === 'submitted') {
            // Still pending at Twilio's end — only update last_synced_at.
            await this.prisma.whatsAppTemplate.update({
              where: { id: row.id },
              data: { last_synced_at: new Date() },
            });
            continue;
          }
          await this.prisma.whatsAppTemplate.update({
            where: { id: row.id },
            data: {
              status: nextStatus,
              approval_message: reason,
              approved_at: nextStatus === 'approved' ? new Date() : null,
              last_synced_at: new Date(),
            },
          });
          if (row.submitted_by_user_id) {
            await this.enqueueStatusNotification(tenantId, row, nextStatus, reason);
          }
        } catch (err) {
          const e = err as Error;
          this.logger.error(`tenant=${tenantId} template=${row.template_key}: ${e.message}`);
          // Don't flip the row — retry next tick. Always update last_synced_at
          // so an admin can see recent attempts.
          await this.prisma.whatsAppTemplate.update({
            where: { id: row.id },
            data: { last_synced_at: new Date() },
          });
        }
      }
    }
  }

  private async buildTwilioClient(tenantId: string): Promise<Twilio | null> {
    const config = await this.prisma.tenantWhatsAppConfig.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!config) return null;
    const accountSid = await this.encryption.decrypt(
      config.twilio_account_sid_encrypted,
      config.encryption_key_ref,
    );
    const authToken = await this.encryption.decrypt(
      config.twilio_auth_token_encrypted,
      config.encryption_key_ref,
    );
    return twilio(accountSid, authToken);
  }

  private async enqueueStatusNotification(
    tenantId: string,
    row: SubmittedRow,
    status: 'approved' | 'rejected',
    reason: string | null,
  ): Promise<void> {
    const templateKey =
      status === 'approved' ? 'whatsapp_template.approved' : 'whatsapp_template.rejected';
    await this.notificationsQueue.add(
      'notifications:dispatch-direct',
      {
        tenant_id: tenantId,
        recipient_user_id: row.submitted_by_user_id,
        channel: 'in_app',
        template_key: templateKey,
        data: {
          template_key_inner: row.template_key,
          language_code: row.language_code,
          ...(reason ? { rejection_reason: reason } : {}),
        },
      },
      { removeOnComplete: 50, removeOnFail: 50 },
    );
  }
}
```

### 8. Service-window cleanup cron — `apps/worker/src/processors/communications/whatsapp-service-window-cleanup.processor.ts` — NEW

Tiny processor — daily, no per-tenant logic, just calls `WhatsAppServiceWindowService.cleanupExpired()`.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { WhatsAppServiceWindowService } from '../../../api/src/modules/communications/whatsapp-templates/whatsapp-service-window.service';

export const WHATSAPP_SERVICE_WINDOW_CLEANUP_JOB = 'comms:whatsapp-service-window-cleanup';

@Injectable()
export class WhatsAppServiceWindowCleanupProcessor {
  private readonly logger = new Logger(WhatsAppServiceWindowCleanupProcessor.name);

  constructor(private readonly serviceWindow: WhatsAppServiceWindowService) {}

  async process(job: Job): Promise<void> {
    if (job.name !== WHATSAPP_SERVICE_WINDOW_CLEANUP_JOB) return;
    const deleted = await this.serviceWindow.cleanupExpired();
    this.logger.log(`Service-window cleanup deleted ${deleted} stale row(s).`);
  }
}
```

### 9. Cron registration — `apps/worker/src/base/cron-scheduler.service.ts` — UPDATE (shared file, Rule 17)

Add both crons to `registerNotificationsCronJobs` (or wherever Impl 07 added the domain-verification cron — Impl 07's PR is the structural reference). This file is **claimed** by every Wave 3 impl that adds a cron (07, 08, plus the suppression-cleanup cron in Impl 06). Layer your additions on top of the prior commits.

```typescript
import { WHATSAPP_TEMPLATE_SYNC_JOB } from '../processors/communications/whatsapp-template-sync.processor';
import { WHATSAPP_SERVICE_WINDOW_CLEANUP_JOB } from '../processors/communications/whatsapp-service-window-cleanup.processor';

// Inside registerNotificationsCronJobs():

await this.notificationsQueue.add(
  WHATSAPP_TEMPLATE_SYNC_JOB,
  {},
  {
    repeat: { pattern: '*/15 * * * *' },
    jobId: `cron:${WHATSAPP_TEMPLATE_SYNC_JOB}`,
    removeOnComplete: 10,
    removeOnFail: 50,
  },
);
this.logger.log(`Registered repeatable cron: ${WHATSAPP_TEMPLATE_SYNC_JOB} (every 15 min)`);

await this.notificationsQueue.add(
  WHATSAPP_SERVICE_WINDOW_CLEANUP_JOB,
  {},
  {
    repeat: { pattern: '0 4 * * *' },
    jobId: `cron:${WHATSAPP_SERVICE_WINDOW_CLEANUP_JOB}`,
    removeOnComplete: 10,
    removeOnFail: 50,
  },
);
this.logger.log(
  `Registered repeatable cron: ${WHATSAPP_SERVICE_WINDOW_CLEANUP_JOB} (daily 04:00 UTC)`,
);
```

#### 9.1 Worker queue routing

`apps/worker/src/processors/communications/notifications-queue.processor.ts` (or whichever file dispatches notifications jobs by name) gains two cases:

```typescript
case WHATSAPP_TEMPLATE_SYNC_JOB:
  return this.templateSyncProcessor.process(job);
case WHATSAPP_SERVICE_WINDOW_CLEANUP_JOB:
  return this.serviceWindowCleanupProcessor.process(job);
```

### 10. Module wiring

`apps/api/src/modules/communications/communications.module.ts` (shared file, Rule 17):

```typescript
imports: [
  // existing
  ConfigurationModule, // already imported — provides WhatsAppConfigService
],
controllers: [
  // existing
  WhatsAppTemplateController,
],
providers: [
  // existing
  WhatsAppTemplateService,
  WhatsAppServiceWindowService,
],
exports: [
  WhatsAppTemplateService,        // exported so TwilioWhatsAppProvider injects it
  WhatsAppServiceWindowService,   // exported so TwilioWhatsAppProvider + worker import it
],
```

`apps/worker/src/worker.module.ts` (shared file, Rule 17):

```typescript
providers: [
  // existing
  WhatsAppTemplateSyncProcessor,
  WhatsAppServiceWindowCleanupProcessor,
],
```

### 11. Schema gap — `notification.template_variables`

The `notifications` table has `template_key` but **no** `template_variables` column. WhatsApp template dispatch needs the parameter values for `{{1}}`, `{{2}}`, ... to feed `client.messages.create({ contentVariables: JSON.stringify(...) })`. We carry them inside `payload_json.template_variables` as a `Record<string, string>` (Twilio requires string values — numbers / booleans must be stringified by the caller).

The dispatch service reads `payload_json.template_variables` (§5.1). Every caller that dispatches WhatsApp with a template MUST stuff variables into `payload_json.template_variables`. Document this on `NotificationsService.dispatch()`'s JSDoc.

If we ever want first-class indexed reporting on which variable values were sent (e.g. "list every WhatsApp send where `{{2}} = '123.45'`"), promote to a real column. For V1 the JSONB carrier is sufficient. **Track as a follow-up** under `docs/operations/PRE-LAUNCH-CHECKLIST.md` Part 5 if the user wants to formalise it.

### 12. Zod schemas — `packages/shared/src/schemas/communication-config.schema.ts` — UPDATE (shared file, Rule 17)

Impl 03 introduces this file. Confirm or add (the Impl 03 spec already lists `submitWhatsAppTemplateSchema` — verify and re-export):

```typescript
import { z } from 'zod';

export const submitWhatsAppTemplateSchema = z.object({
  template_key: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9._-]+$/, 'template_key must be lowercase alphanumeric with . _ - separators'),
  template_name: z.string().max(128).optional(),
  language_code: z.string().min(2).max(16),
  category: z.enum(['utility', 'marketing', 'authentication']),
  body: z.string().min(1).max(1024),
});
export type SubmitWhatsAppTemplateDto = z.infer<typeof submitWhatsAppTemplateSchema>;

/**
 * Variables sent on a WhatsApp dispatch. WhatsApp requires string values
 * — callers stringify numbers and booleans before passing.
 */
export const templateVariablesSchema = z.record(z.string(), z.string());
export type TemplateVariables = z.infer<typeof templateVariablesSchema>;
```

Re-export from `packages/shared/src/schemas/index.ts` and `packages/shared/src/index.ts`. Coordinate via Rule 17.

### 13. Notification template constants — `packages/shared/src/constants/notification-types.ts` — UPDATE (shared file, Rule 17)

Append:

```typescript
'whatsapp_template.approved',
'whatsapp_template.rejected',
```

Plus the platform-level seed templates in `packages/prisma/seed/notification-templates.ts`:

```typescript
{ tenant_id: null, channel: 'in_app', template_key: 'whatsapp_template.approved', locale: 'en',
  body: 'Your WhatsApp template "{{template_key_inner}}" ({{language_code}}) was approved by Twilio. It can now be used for outbound dispatch.',
  active: true },
{ tenant_id: null, channel: 'in_app', template_key: 'whatsapp_template.approved', locale: 'ar',
  body: 'تمت الموافقة على قالب واتساب "{{template_key_inner}}" ({{language_code}}) من قبل تويليو. يمكن استخدامه الآن للإرسال الصادر.',
  active: true },
{ tenant_id: null, channel: 'in_app', template_key: 'whatsapp_template.rejected', locale: 'en',
  body: 'Your WhatsApp template "{{template_key_inner}}" ({{language_code}}) was rejected by Twilio. Reason: {{rejection_reason}}.',
  active: true },
{ tenant_id: null, channel: 'in_app', template_key: 'whatsapp_template.rejected', locale: 'ar',
  body: 'تم رفض قالب واتساب "{{template_key_inner}}" ({{language_code}}) من قبل تويليو. السبب: {{rejection_reason}}.',
  active: true },
```

Replay the seed locally during verification.

### 14. Audit logging

The existing `AuditLogInterceptor` records `entity_type=whatsapp_template` for the controller routes. Audit fields we expect:

- `create` — `meta={ template_key, language_code, category }`
- `submit` — `action='update'`, `meta={ template_key, twilio_template_sid }`
- `sync` — `action='update'`, `meta={ template_key, status, approval_message }`
- `pause` / `resume` — `action='update'`, `meta={ template_key, prev_status, next_status }`
- `delete` — `action='delete'`, `meta={ template_key }`

Plaintext Twilio auth tokens MUST NEVER appear in audit `meta` — they don't pass through this controller, but verify nothing in the service layer leaks them via error messages.

---

## Tests

All co-located. Coverage target ≥ 80% per file (matches the existing communications module floor).

### Service tests — `whatsapp-template.service.spec.ts`

Cases:

1. **Create happy path** — `findFirst` returns null, `create` writes `pending` row with placeholders validated. Assert returned row.
2. **Create rejects duplicate** — `findFirst` returns existing row → `BadRequestException` `TEMPLATE_ALREADY_EXISTS`. No DB write.
3. **Create rejects bad placeholders** — body uses `{{name}}` → `TEMPLATE_INVALID_PLACEHOLDER`. Body uses `{{1}}, {{3}}` (no `{{2}}`) → `TEMPLATE_PLACEHOLDER_GAP`.
4. **Submit happy path** — pending row exists, mock Twilio `contents.create` + `approvalCreate.create` succeed. Assert row updated to `submitted` with `twilio_template_sid` populated and `submitted_at` / `last_synced_at` set.
5. **Submit rejects from non-pending state** — row in `submitted` → `TEMPLATE_INVALID_STATE_FOR_SUBMIT`. Same for `approved`, `rejected`, `paused`.
6. **Submit Twilio failure** — mock `contents.create` throws. Assert `BadRequestException` `TWILIO_SUBMIT_FAILED` with the Twilio error message in the response. Assert row NOT updated (still `pending`).
7. **Sync happy path approved** — submitted row, mock `client.content.fetch` returning `approval_requests: [{ status: 'approved' }]`. Assert row updated to `approved` with `approved_at` set, `last_synced_at` set.
8. **Sync happy path rejected** — submitted row, mock fetch returning `[{ status: 'rejected', rejection_reason: 'Misleading content' }]`. Assert `status='rejected'`, `approval_message='Misleading content'`, `approved_at` unchanged.
9. **Sync no-op when status='approved'** — already-approved row → service returns the row unchanged (idempotency shortcut). Twilio NOT called.
10. **Sync no-op when status='pending'** — non-submitted rows skip the Twilio fetch. Same shortcut path.
11. **Sync still-pending Twilio approval** — fetched row's latest approval is `pending` → row's `last_synced_at` updates but `status` stays `submitted`.
12. **Sync Twilio failure** — fetch throws → `BadRequestException` `TWILIO_SYNC_FAILED`. Row unchanged.
13. **GetApprovedByKey returns approved** — DB findFirst returns row with `status='approved'`. Assert returned.
14. **GetApprovedByKey returns null for paused / pending / submitted / rejected** — query filter `status='approved'` excludes them. Verify by feeding each status as findFirst result.
15. **Pause happy path** — approved row → row updated to `paused`.
16. **Pause rejects from non-approved state** — `pending` / `submitted` / `rejected` / `paused` → `TEMPLATE_INVALID_STATE_FOR_PAUSE`.
17. **Resume happy path** — paused row → `approved`.
18. **Resume rejects from non-paused state** — `TEMPLATE_INVALID_STATE_FOR_RESUME`.
19. **Delete happy path** — calls Twilio `contents(sid).remove()`, then deletes local row.
20. **Delete tolerates Twilio 404** — Twilio remove throws with `statusCode: 404`. Assert local row still deleted, no exception thrown.
21. **WHATSAPP_NOT_CONFIGURED** — `getDecryptedConfig` returns null → `BadRequestException` from `submitToTwilio` / `syncApprovalStatus` / `deleteTemplate`.
22. **RLS leakage — cross-tenant getTemplate returns null** — `findFirst` simulated with `tenant_id` filter; Tenant B request for Tenant A's template id returns null.

Mock setup uses `jest.mock('twilio')` with stable handles; `createRlsClient` is mocked to return the prisma stub directly (standard pattern — see `notifications.service.spec.ts`).

### Service window tests — `whatsapp-service-window.service.spec.ts`

1. **recordInbound creates a fresh row** — no existing row → upsert creates with `last_inbound_at = now()`, `expires_at = now() + 24h`.
2. **recordInbound extends an existing row** — existing row with `expires_at` 1 hour in the future → upsert update path bumps `expires_at` to `now() + 24h`.
3. **recordInbound busts the cache** — Redis `del` called with the right key after the DB write.
4. **recordInbound rejects garbage phone** — `recordInbound(tenantId, '+abc')` returns silently, no DB call.
5. **recordInbound strips `whatsapp:` prefix** — `+12345...` and `whatsapp:+12345...` produce the same row (idempotency over the prefix).
6. **isInsideWindow inside window** — DB row with `expires_at` 1 hour in the future → returns `true`.
7. **isInsideWindow outside window** — DB row with `expires_at` 1 hour in the past → returns `false`.
8. **isInsideWindow no row** — DB returns null → returns `false`. Cache is set to `'0'`.
9. **isInsideWindow cache hit (recent expiry)** — Redis returns unix-ms in the future → returns `true` without touching DB.
10. **isInsideWindow cache hit (zero sentinel)** — Redis returns `'0'` → returns `false` without touching DB.
11. **isInsideWindow cache miss → DB hit → cache set** — Redis returns null → DB queried → Redis `set` called with serialised expires_at + 300s TTL.
12. **cleanupExpired deletes old rows** — mock `deleteMany` returning `{ count: 5 }`. Assert WHERE clause uses `expires_at: { lt: cutoff }`. Returns 5.
13. **cleanupExpired no-op when nothing to delete** — `deleteMany` returns `{ count: 0 }`. Returns 0, no log noise.
14. **RLS leakage — recordInbound for Tenant A does not affect Tenant B's window** — sanity check: querying Tenant B for the same recipient returns null because the unique key includes tenant_id.
15. **normalisePhone helper** — `it.each` for: bare E.164, `whatsapp:` prefix, missing `+`, alphabetic, empty string, only `whatsapp:`.

### Controller tests — `whatsapp-template.controller.spec.ts`

Mirror the `email-domain.controller.spec.ts` shape from Impl 07.

1. **POST /v1/whatsapp-templates** — happy path delegates to service with normalised tenant + user ids.
2. **GET /v1/whatsapp-templates** — query parsing for `status`, `language_code`, `template_key`, `page`, `pageSize`.
3. **POST /v1/whatsapp-templates/:id/submit** — service called with id, returns 200.
4. **POST /v1/whatsapp-templates/:id/sync** — service called, returns 200 with row.
5. **POST /v1/whatsapp-templates/:id/pause** + **/resume** — service called.
6. **GET /v1/whatsapp-templates/:id** — service called, response returned.
7. **DELETE /v1/whatsapp-templates/:id** — service called, returns 204.
8. **Permission denial — non-admin can't create templates** — guard returns false for `configuration.communications.manage` → `ForbiddenException`. Assert service never called.
9. **Permission denial — non-viewer can't list** — guard returns false for `configuration.communications.view` → `ForbiddenException`. Service never called.

### Provider tests — `twilio-whatsapp.provider.spec.ts` — UPDATE

Add a `service window + template enforcement` describe block:

1. **Inside window with body** — `isInsideWindow` returns true, payload has `body` → `messages.create` called with `{ from, to, body }`. No `contentSid`.
2. **Inside window with template** — `isInsideWindow` true, payload has `template_key` (no body), template approved → `messages.create` called with `{ from, to, contentSid, contentVariables }`.
3. **Inside window with paused template (no body fallback)** — `getApprovedByKey` returns null (paused) and no body → `{ skipped: true, reason: 'template_not_approved_inside_window' }`.
4. **Inside window missing both body and template_key** — `{ skipped: true, reason: 'whatsapp_payload_missing_body_and_template' }`.
5. **Outside window with approved template** — `isInsideWindow` false, `getApprovedByKey` returns approved row → `messages.create` called with `{ from, to, contentSid, contentVariables }`.
6. **Outside window without template_key** — `{ skipped: true, reason: 'outside_service_window_no_template' }`.
7. **Outside window with non-existent template_key** — `getApprovedByKey` returns null → same skip reason.
8. **Outside window with paused template** — `getApprovedByKey` returns null (paused row excluded by status filter) → same skip reason.
9. **Suppression check still wins** — `isSuppressed` returns true → `{ skipped: true, reason: 'suppressed' }` regardless of window state.
10. **`channel_not_configured` when WhatsApp config missing** — `getDecryptedConfig` returns null → skip.

### Cron tests — `whatsapp-template-sync.processor.spec.ts`

1. **Multiple tenants, mixed outcomes** — seed 3 submitted rows: tenant A has 2 (one approved, one still submitted at Twilio), tenant B has 1 (rejected). Mock Twilio per row. Assert 2 status flips + 2 in-app notifications enqueued (one approved, one rejected); 1 row left submitted with `last_synced_at` updated.
2. **Skips tenant without WhatsApp config** — submitted rows for a tenant whose `tenantWhatsAppConfig.findUnique` returns null. Assert no Twilio call; warning logged; other tenants still processed.
3. **Tolerates Twilio network error per-row** — first call throws, subsequent succeed. Assert row's `last_synced_at` updated even on failure; row's `status` unchanged on failure.
4. **Idempotent** — run process() twice with the same Twilio mocks. Assert second run produces no new notifications and no thrash on already-resolved rows (because `findMany` filters to `status='submitted'`, the just-resolved rows are no longer in the result set).
5. **Wrong job name skips** — `process({ name: 'something:else' })` → no DB calls.
6. **Notification payload shape** — assert the enqueued `notifications:dispatch-direct` job has `tenant_id`, `recipient_user_id` matching `submitted_by_user_id`, `channel='in_app'`, the right `template_key`, and `data.template_key_inner` / `data.language_code` populated.

### Cleanup cron tests — `whatsapp-service-window-cleanup.processor.spec.ts`

1. **Calls cleanupExpired** — mock service window service, assert `cleanupExpired` called once.
2. **Wrong job name skips** — no service call.
3. **Logs the deleted count** — service returns 5 → log line includes "5".

### Webhook handler integration test — `twilio-webhook-handler.service.spec.ts` — UPDATE

Add: WhatsApp inbound payload (`MessageStatus` absent, `From` present) → `serviceWindow.recordInbound` called with `tenantId` and the `From` value. Verify the exception path: `recordInbound` throws → handler logs but does not throw to the controller (returns silently).

### AppModule DI smoke

Run the snippet from IMPLEMENTATION_LOG.md Rule 6. The new constructor deps on `TwilioWhatsAppProvider` (`WhatsAppTemplateService`, `WhatsAppServiceWindowService`) are the most likely DI failure point — if it fails, double-check that `CommunicationsModule.exports` includes both.

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

- Wave 1 + 2 + Impl 03 + Impl 04 + Impl 06 already merged into the worktree (schema, permissions, `WhatsAppConfigService`, provider refactor, webhook handler done).
- `tenant_whatsapp_configs` row exists for at least one tenant in the dev DB. You may temporarily seed one with a Twilio sandbox account SID + auth token (the `+14155238886` sandbox WhatsApp number is fine for local testing).
- Local Postgres + Redis running (`docker compose up -d`).

### 1. Spin up

```bash
pnpm install
pnpm --filter @school/prisma migrate
pnpm --filter @school/prisma seed
pnpm dev
```

Confirm worker logs include both new cron registrations:

```
Registered repeatable cron: comms:whatsapp-template-sync (every 15 min)
Registered repeatable cron: comms:whatsapp-service-window-cleanup (daily 04:00 UTC)
```

### 2. Create a template via API

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"owner@nhqs.test","password":"Password123!"}' | jq -r .access_token)

curl -X POST http://localhost:3001/api/v1/whatsapp-templates \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "template_key":"invoice.reminder",
    "template_name":"Invoice reminder",
    "language_code":"en",
    "category":"utility",
    "body":"Hi {{1}}, your invoice {{2}} is due on {{3}}. Please reply STOP to unsubscribe."
  }' | jq
```

Expected: `{ id, template_key: 'invoice.reminder', status: 'pending', body: '...', ... }`.

### 3. Submit to Twilio

```bash
TPL_ID=<the id from step 2>
curl -X POST http://localhost:3001/api/v1/whatsapp-templates/$TPL_ID/submit \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected: row returned with `status: 'submitted'` and `twilio_template_sid: 'HXxxx...'`. Visit Twilio console → Messaging → Content Templates, confirm the new entry appears.

### 4. Inspect the row

```sql
SELECT id, template_key, language_code, status, twilio_template_sid, submitted_at, last_synced_at
  FROM whatsapp_templates WHERE tenant_id = '<NHQS_TENANT_ID>';
```

### 5. Manual sync

```bash
curl -X POST http://localhost:3001/api/v1/whatsapp-templates/$TPL_ID/sync \
  -H "Authorization: Bearer $TOKEN" | jq
```

Twilio's sandbox typically auto-approves utility templates in seconds; for production review it can take hours. If `status='approved'` flips back: `last_synced_at` updates and `approved_at` populates. If still `submitted`, retry the cron tick (or set the wall clock past 15 min) and re-check the row.

### 6. Simulate a WhatsApp inbound webhook

The signature path is owned by Impl 06; for local verification use the test helper that bypasses signature verification or hand-craft a valid `X-Twilio-Signature` header. The simplest path is to call the handler service directly via the e2e harness, but a curl with valid HMAC also works:

```bash
# Compute the X-Twilio-Signature for a constructed payload (see Impl 06's
# verification §6 for the helper script). This step opens the service window
# for "+12025550100" → expires 24h from now.
curl -X POST "http://localhost:3001/api/v1/webhooks/communications/whatsapp/<NHQS_TENANT_ID>?ts=$(date +%s)" \
  -H "X-Twilio-Signature: <computed>" \
  -d "From=whatsapp:%2B12025550100&To=whatsapp:%2B14155238886&Body=Hi"
```

Then:

```sql
SELECT recipient_phone, last_inbound_at, expires_at FROM whatsapp_service_windows
 WHERE tenant_id = '<NHQS_TENANT_ID>';
```

Expected: one row, `expires_at ≈ now() + 24h`.

### 7. Outbound dispatch — inside the window (free-form)

Trigger any module that fires WhatsApp (e.g. payment reminder against a household whose phone is `+12025550100`):

```bash
curl -X POST http://localhost:3001/api/v1/finance/invoices/<id>/send-reminder \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"channels":["whatsapp"]}'
```

Expected: notification status flips through `queued → sent → delivered` (Twilio sandbox echoes); `failure_reason` is null. Visit Twilio's debug log to confirm the message body went through.

### 8. Outbound dispatch — outside the window (no template)

Either wait 24+ hours, or directly update the row:

```sql
UPDATE whatsapp_service_windows
   SET expires_at = now() - interval '1 hour'
 WHERE tenant_id = '<NHQS_TENANT_ID>' AND recipient_phone = '+12025550100';
```

Repeat the dispatch in step 7. Expected:

```sql
SELECT id, status, failure_reason FROM notifications ORDER BY created_at DESC LIMIT 1;
-- expected: failed | outside_service_window_no_template
```

### 9. Outbound dispatch — outside the window (with approved template)

Re-issue the dispatch but include `template_key` and `template_variables` on the calling code path. The simplest end-to-end is to enqueue a notification directly via the API:

```bash
curl -X POST http://localhost:3001/api/v1/notifications/dispatch \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "recipient_user_id":"<USER_ID>",
    "channel":"whatsapp",
    "template_key":"invoice.reminder",
    "locale":"en",
    "payload_json": {
      "template_variables": { "1":"Mrs Doe", "2":"INV-001", "3":"15 Aug" }
    }
  }' | jq
```

Expected: notification flips to `sent` and Twilio's debug log shows a content-SID send with the variables substituted.

### 10. Outbound dispatch — outside the window with a paused template

```sql
UPDATE whatsapp_templates SET status = 'paused'
 WHERE tenant_id = '<NHQS_TENANT_ID>' AND template_key = 'invoice.reminder';
```

Repeat the dispatch from step 9. Expected: `failure_reason='outside_service_window_no_template'` (paused templates are excluded from `getApprovedByKey`).

### 11. Sync cron processes submitted

Create another template, submit it, then:

```bash
# Force an immediate cron run via BullMQ-admin or by manipulating the
# repeat key. Simplest: bounce the worker so the cron re-registers and
# fires immediately.
pm2 restart worker || pnpm --filter @school/worker dev
```

Tail worker logs:

```bash
pnpm --filter @school/worker dev 2>&1 | grep -E "(whatsapp-template-sync|Syncing.*submitted)"
```

Expected log: `Syncing N submitted template(s).` followed by row update logs. Inspect:

```sql
SELECT template_key, status, last_synced_at FROM whatsapp_templates ORDER BY last_synced_at DESC LIMIT 5;
```

### 12. In-app notifications on transition

For each template that flipped from `submitted → approved` (or `→ rejected`), confirm an in-app notification landed in the submitting user's inbox:

```sql
SELECT id, template_key, payload_json FROM notifications
 WHERE recipient_user_id = '<SUBMITTING_USER_ID>'
   AND template_key IN ('whatsapp_template.approved', 'whatsapp_template.rejected')
 ORDER BY created_at DESC LIMIT 5;
```

### 13. Cleanup cron

The daily cron fires at 04:00 UTC. To verify locally without waiting:

```bash
# Seed a row that will be deleted:
psql ... -c "INSERT INTO whatsapp_service_windows
  (tenant_id, recipient_phone, last_inbound_at, expires_at, created_at, updated_at)
  VALUES ('<NHQS_TENANT_ID>', '+19999999999', now() - interval '10 days',
          now() - interval '10 days' + interval '1 day', now(), now());"

# Force-fire the cron via worker logs or a manual queue add.
# After it runs:
psql ... -c "SELECT count(*) FROM whatsapp_service_windows WHERE recipient_phone = '+19999999999';"
# expected: 0
```

### 14. Console error scan

`pnpm dev` console + browser `browser_console_messages(level: 'error')` — assert no errors emitted by `WhatsAppTemplateService`, `WhatsAppServiceWindowService`, the two new processors, or the webhook handler integration.

---

## Files touched

### NEW

- `apps/api/src/modules/communications/whatsapp-templates/whatsapp-template.service.ts`
- `apps/api/src/modules/communications/whatsapp-templates/whatsapp-template.service.spec.ts`
- `apps/api/src/modules/communications/whatsapp-templates/whatsapp-template.controller.ts`
- `apps/api/src/modules/communications/whatsapp-templates/whatsapp-template.controller.spec.ts`
- `apps/api/src/modules/communications/whatsapp-templates/whatsapp-template.types.ts`
- `apps/api/src/modules/communications/whatsapp-templates/whatsapp-service-window.service.ts`
- `apps/api/src/modules/communications/whatsapp-templates/whatsapp-service-window.service.spec.ts`
- `apps/worker/src/processors/communications/whatsapp-template-sync.processor.ts`
- `apps/worker/src/processors/communications/whatsapp-template-sync.processor.spec.ts`
- `apps/worker/src/processors/communications/whatsapp-service-window-cleanup.processor.ts`
- `apps/worker/src/processors/communications/whatsapp-service-window-cleanup.processor.spec.ts`

### UPDATED — owned by this impl

- `apps/api/src/modules/communications/providers/twilio-whatsapp.provider.ts` — adds the service-window + template-required-outside-window enforcement gates, plus the `contentSid` / `contentVariables` send branch (Impl 04 owns the rest of this file's structure; this is a pure additive update).
- `apps/api/src/modules/communications/notification-dispatch.service.ts` — extracts `template_variables` from `payload_json` for the WhatsApp branch (small, ~10 lines).

### UPDATED — shared edits requiring Rule 17 coordination

- `apps/api/src/modules/communications/webhooks/twilio-webhook-handler.service.ts` — replaces Impl 06's deferred-Impl-08 stub with a real `serviceWindow.recordInbound()` call. **Claim before editing**; coordinate with any other Wave 3 session that touches webhook handlers.
- `apps/api/src/modules/communications/communications.module.ts` — register the new controller, services, and add to exports. Shared file.
- `apps/worker/src/worker.module.ts` — register the two new processors. Shared file.
- `apps/worker/src/base/cron-scheduler.service.ts` — register the two new crons. Shared file.
- `packages/shared/src/schemas/communication-config.schema.ts` — confirm or add `submitWhatsAppTemplateSchema` and `templateVariablesSchema`. Shared file.
- `packages/shared/src/schemas/index.ts` — re-export. Shared file.
- `packages/shared/src/index.ts` — re-export. Shared file.
- `packages/shared/src/constants/notification-types.ts` — append `whatsapp_template.approved` and `whatsapp_template.rejected`. Shared file.
- `packages/prisma/seed/notification-templates.ts` — add the four new platform-level seed rows (EN + AR for each).

Append a Rule 17 shared-file claim to IMPLEMENTATION_LOG.md §5 before editing the shared list above.

---

## Rollback

```bash
git revert <impl-08-commit-sha>
```

The schema is unchanged (Impl 01 owns `whatsapp_templates`, `whatsapp_service_windows`); reverting this impl leaves the tables in place but unused. After revert:

- The two new crons stop being registered (next worker restart is enough).
- The provider's service-window + template gates disappear; outbound dispatch reverts to Impl 04's plain free-form path. **Outside-window sends will start hitting Twilio rejections** until Impl 08 is reapplied. Document this loudly in the completion record's rollback section so an operator does not perform the revert without the user understanding the consequence.
- Impl 06's webhook handler reverts to logging the inbound message and dropping it on the floor — the service window never opens, so EVERY outbound to a recipient that has gone quiet for 24h will hit the `outside_service_window_no_template` skip path... **EXCEPT** the gate itself is also reverted, so Twilio sees the request and rejects it with no per-notification correlation in our DB. This is precisely why the gate exists.

If you only need to disable the gate (e.g. emergency deployment), set the schema-level rows manually:

```sql
-- Force every recipient into an "always inside window" state for one tenant:
INSERT INTO whatsapp_service_windows (tenant_id, recipient_phone, last_inbound_at, expires_at, created_at, updated_at)
SELECT '<TENANT_ID>', recipient_phone, now(), now() + interval '24h', now(), now()
  FROM (SELECT DISTINCT recipient_phone FROM whatsapp_service_windows WHERE tenant_id = '<TENANT_ID>') s
ON CONFLICT (tenant_id, recipient_phone) DO UPDATE SET expires_at = excluded.expires_at;
```

This is an operational escape valve, not a rollback strategy.

The `notification.payload_json.template_variables` JSONB carrier added by §11 is purely additive — reverting Impl 08 leaves it unread but the field continues to exist on whichever rows were dispatched while Impl 08 was live. No follow-up clean-up is required.

---

## Follow-ups for subsequent waves

- **Impl 11 (frontend Settings UI):** the WhatsApp settings page consumes this impl's endpoints. The template list view needs `GET /v1/whatsapp-templates`; the submission form posts to `POST /v1/whatsapp-templates` then `POST /v1/whatsapp-templates/:id/submit`. Approval status badges read from `status` + `approval_message`.
- **Impl 13 (tenant backfill):** seed an approved sentinel template (`comms.verify`) for each test tenant so Impl 09's `verifyConfig` (test-send) works outside the service window. Without it, the WhatsApp test send hits the same `outside_service_window_no_template` skip path as a regular dispatch.
- **Impl 14 (architecture docs):** update `docs/architecture/event-job-catalog.md` with the two new crons; `docs/architecture/state-machines.md` with the `whatsapp_template.status` machine; `docs/architecture/danger-zones.md` with the per-tenant per-recipient service-window invariant + the schema-gap note for `notification.template_variables`.
- **Schema follow-up (post-rebuild):** if usage warrants, promote `payload_json.template_variables` to a real `notifications.template_variables JSONB` column with an index. Track in `docs/operations/PRE-LAUNCH-CHECKLIST.md` Part 5.
- **V2 — engagement events:** Twilio's WhatsApp inbound webhook also carries read receipts; a future impl can extend the inbound branch to record those as `notification_engagement_event` rows. Out of scope for V1 per `PLAN.md §2`.
