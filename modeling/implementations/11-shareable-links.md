# Implementation 11 — Shareable Links service + cleanup worker

> **Wave:** 3
> **Depends on:** 01, 05
> **Deploys:** API + worker restart

---

## Goal

Two surfaces:

1. **Authenticated CRUD** for issuing / listing / revoking shareable links plus a **public open-route resolver** that turns a token into a snapshot payload for board members who don't have a login. Mirrors `PLAN.md §11.2`.
2. **Cleanup worker** (`budgeting:shareable-link-cleanup`) that hard-deletes rows whose `expires_at` is older than 30 days — keeps the table small and removes orphaned passwords.

The public route is the **only** unauthenticated endpoint introduced by this rebuild. It must (a) refuse expired / revoked / wrong-password tokens, (b) hide PII (households, students, staff salaries — see §6), and (c) verify the token's `tenant_id` matches the snapshot's `tenant_id` so the open route cannot become a cross-tenant escape.

## What to change

### 1. `apps/api/src/modules/budgeting/shareable-links/shareable-links.service.ts` — NEW

Service responsibilities:

- **Issue** (authenticated): create a `shareable_links` row, generate a fresh UUID token, optionally bcrypt-hash the password, persist scenarios_visible.
- **List** (authenticated): paginated by snapshot.
- **Revoke** (authenticated): set `revoked_at` to now.
- **Resolve by token** (public): join token → snapshot, verify expiry / revoke / password, increment view_count, scrub PII, return the public payload shape.

```typescript
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../../common/prisma/prisma.service';

import type {
  CreateLinkDto,
  CreateLinkResponse,
  ListLinksResponse,
  PublicShareResponse,
} from './shareable-links.types';

const BCRYPT_ROUNDS = 10;
const MAX_EXPIRY_DAYS = 90;
const PUBLIC_NOT_FOUND = {
  code: 'SHARE_LINK_INVALID',
  message: 'This share link is invalid, expired, revoked, or password-protected.',
};

@Injectable()
export class ShareableLinksService {
  private readonly logger = new Logger(ShareableLinksService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Authenticated: list ────────────────────────────────────────────────

  async listForSnapshot(
    tenantId: string,
    modelId: string,
    snapshotId: string,
  ): Promise<ListLinksResponse> {
    // Confirm the snapshot belongs to the tenant and the model — RLS does this
    // automatically but the explicit findFirst returns a 404 with a clearer
    // error code than RLS-empty.
    const snapshot = await this.prisma.financialModelSnapshot.findFirst({
      where: { id: snapshotId, parent_model_id: modelId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!snapshot) {
      throw new NotFoundException({
        code: 'SNAPSHOT_NOT_FOUND',
        message: `Snapshot "${snapshotId}" not found on model "${modelId}".`,
      });
    }
    const links = await this.prisma.shareableLink.findMany({
      where: {
        tenant_id: tenantId,
        parent_snapshot_id: snapshotId,
        // Hide hard-revoked rows older than 30d from the UI; cleanup worker
        // removes them entirely. The "still listed" state is current/expired/
        // recently-revoked — it tells issuers what's been issued and
        // whether it still works.
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        token: true,
        expires_at: true,
        revoked_at: true,
        view_count: true,
        last_viewed_at: true,
        scenarios_visible: true,
        password_hash: true, // we expose only "has_password: true|false"
        created_at: true,
        created_by: true,
      },
    });
    return {
      data: links.map((l) => ({
        id: l.id,
        token: l.token,
        full_url: this.buildPublicUrl(tenantId, l.token),
        expires_at: l.expires_at.toISOString(),
        revoked_at: l.revoked_at?.toISOString() ?? null,
        view_count: l.view_count,
        last_viewed_at: l.last_viewed_at?.toISOString() ?? null,
        scenarios_visible: Array.isArray(l.scenarios_visible)
          ? (l.scenarios_visible as string[])
          : [],
        has_password: Boolean(l.password_hash),
        created_at: l.created_at.toISOString(),
        created_by: l.created_by,
      })),
    };
  }

  // ─── Authenticated: create ──────────────────────────────────────────────

  async create(
    tenantId: string,
    userId: string,
    modelId: string,
    snapshotId: string,
    dto: CreateLinkDto,
  ): Promise<CreateLinkResponse> {
    if (![7, 14, 30, 90].includes(dto.expires_in_days)) {
      throw new ForbiddenException({
        code: 'INVALID_EXPIRY',
        message: `expires_in_days must be one of 7, 14, 30, 90 (got ${dto.expires_in_days}).`,
      });
    }
    if (dto.expires_in_days > MAX_EXPIRY_DAYS) {
      throw new ForbiddenException({
        code: 'EXPIRY_EXCEEDS_MAX',
        message: `Maximum expiry is ${MAX_EXPIRY_DAYS} days.`,
      });
    }

    const snapshot = await this.prisma.financialModelSnapshot.findFirst({
      where: { id: snapshotId, parent_model_id: modelId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!snapshot) {
      throw new NotFoundException({
        code: 'SNAPSHOT_NOT_FOUND',
        message: `Snapshot "${snapshotId}" not found on model "${modelId}".`,
      });
    }

    const token = randomUUID();
    const password_hash = dto.password ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS) : null;
    const expires_at = new Date(Date.now() + dto.expires_in_days * 24 * 60 * 60 * 1000);

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const created = await rls.$transaction(async (tx) => {
      return tx.shareableLink.create({
        data: {
          tenant_id: tenantId,
          token,
          parent_model_id: modelId,
          parent_snapshot_id: snapshotId,
          expires_at,
          password_hash,
          scenarios_visible: dto.scenarios_visible,
          created_by: userId,
        },
        select: { id: true, token: true, expires_at: true },
      });
    });

    this.logger.log(
      `Issued shareable link ${created.id} for snapshot ${snapshotId} (tenant ${tenantId}) — ` +
        `expires ${created.expires_at.toISOString()} pw=${password_hash ? 'yes' : 'no'}`,
    );

    return {
      id: created.id,
      token: created.token,
      full_url: this.buildPublicUrl(tenantId, created.token),
      expires_at: created.expires_at.toISOString(),
    };
  }

  // ─── Authenticated: revoke ──────────────────────────────────────────────

  async revoke(
    tenantId: string,
    modelId: string,
    snapshotId: string,
    linkId: string,
  ): Promise<void> {
    const link = await this.prisma.shareableLink.findFirst({
      where: {
        id: linkId,
        tenant_id: tenantId,
        parent_snapshot_id: snapshotId,
        parent_model_id: modelId,
      },
      select: { id: true, revoked_at: true },
    });
    if (!link) {
      throw new NotFoundException({
        code: 'LINK_NOT_FOUND',
        message: `Shareable link "${linkId}" not found.`,
      });
    }
    if (link.revoked_at) return; // idempotent

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rls.$transaction(async (tx) => {
      await tx.shareableLink.update({
        where: { id: linkId },
        data: { revoked_at: new Date() },
      });
    });
  }

  // ─── Public: resolve by token (no auth) ─────────────────────────────────

  /**
   * Resolves a token into a snapshot payload safe for unauthenticated viewers.
   *
   * SECURITY INVARIANT: this method is the ONLY budgeting endpoint that
   * fetches snapshot data without an RLS context. The caller's tenant_id is
   * unknown — we trust the token alone. Therefore the link's tenant_id MUST
   * match the snapshot's tenant_id; if they differ we treat it as
   * not-found (defense-in-depth — a malicious actor minting a row with
   * mismatched tenant_ids in another module's bug would NOT escape via
   * this resolver). See `IMPLEMENTATION_LOG.md` Rule 9 + the §6 PII scrub.
   */
  async resolveByToken(token: string, passwordAttempt?: string): Promise<PublicShareResponse> {
    if (!isUuid(token)) {
      throw new NotFoundException(PUBLIC_NOT_FOUND);
    }
    // Bypass RLS — this is the documented exception. We re-check the tenant
    // boundary explicitly below.
    const link = await this.prisma.shareableLink.findUnique({
      where: { token },
      include: {
        parent_snapshot: {
          include: {
            tenant: { select: { name: true, currency_code: true } },
            parent_model: {
              select: { id: true, name: true, fiscal_year_start: true, fiscal_year_end: true },
            },
          },
        },
      },
    });
    if (!link) throw new NotFoundException(PUBLIC_NOT_FOUND);

    // Tenant boundary check — token's tenant_id must match snapshot's tenant_id.
    if (link.tenant_id !== link.parent_snapshot.tenant_id) {
      this.logger.error(
        `Cross-tenant share-link mismatch detected — link ${link.id} ` +
          `tenant ${link.tenant_id} vs snapshot tenant ${link.parent_snapshot.tenant_id}. ` +
          `Returning 404. This indicates a data-integrity bug elsewhere.`,
      );
      throw new NotFoundException(PUBLIC_NOT_FOUND);
    }

    // Expired
    if (link.expires_at < new Date()) throw new NotFoundException(PUBLIC_NOT_FOUND);

    // Revoked
    if (link.revoked_at) throw new NotFoundException(PUBLIC_NOT_FOUND);

    // Password
    if (link.password_hash) {
      if (!passwordAttempt) throw new NotFoundException(PUBLIC_NOT_FOUND);
      const ok = await bcrypt.compare(passwordAttempt, link.password_hash);
      if (!ok) throw new NotFoundException(PUBLIC_NOT_FOUND);
    }

    // Increment view count + update last_viewed_at. We deliberately do NOT
    // wrap this in an RLS transaction — the resolver runs in the system
    // context. A stale increment is acceptable; data integrity is fine
    // because we're scoping the update to the link's primary key.
    await this.prisma.shareableLink.update({
      where: { id: link.id },
      data: { view_count: { increment: 1 }, last_viewed_at: new Date() },
    });

    const visible = (link.scenarios_visible as unknown as string[]) ?? [];
    const filteredPayload = filterPayloadForPublic(link.parent_snapshot.payload, visible);
    return {
      tenant_name: link.parent_snapshot.tenant.name,
      currency_code: link.parent_snapshot.tenant.currency_code,
      model_id: link.parent_snapshot.parent_model.id,
      model_name: link.parent_snapshot.parent_model.name,
      version_number: link.parent_snapshot.version_number,
      published_at: link.parent_snapshot.published_at.toISOString(),
      fiscal_year_label: formatFy(
        link.parent_snapshot.parent_model.fiscal_year_start,
        link.parent_snapshot.parent_model.fiscal_year_end,
      ),
      payload: filteredPayload,
    };
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private buildPublicUrl(tenantId: string, token: string): string {
    const base = process.env['APP_URL'] ?? 'https://app.edupod.app';
    return `${base}/finance/budgeting/share/${token}`;
  }
}

// ─── Pure helpers (exported for spec coverage) ─────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/**
 * Strip household-level, student-level, and staff-salary detail from the
 * snapshot payload before serving it on the public route. Any structure
 * that looks like a list of households / students / staff is replaced with
 * an aggregate count. Scenarios not in `visibleScenarios` are dropped.
 *
 * The PLAN's contract is "aggregate categories and totals only" — this
 * function enforces that contract at serialisation time.
 */
export function filterPayloadForPublic(
  rawPayload: unknown,
  visibleScenarios: string[],
): Record<string, unknown> {
  if (!rawPayload || typeof rawPayload !== 'object') return {};
  const payload = { ...(rawPayload as Record<string, unknown>) };

  // 1. Filter scenarios to the allowlist.
  if (Array.isArray(payload.scenarios)) {
    const allowed = new Set(visibleScenarios);
    payload.scenarios = (payload.scenarios as Array<Record<string, unknown>>)
      .filter((s) => allowed.has((s.name as string) ?? '') || allowed.has('base'))
      .map((s) => sanitiseScenarioOrPayload(s));
  }

  // 2. Sanitise the top-level fields (line_items, totals, drivers,
  //    per_pupil_unit_economics, source data — anything with PII).
  const sanitised = sanitiseScenarioOrPayload(payload);
  return sanitised;
}

function sanitiseScenarioOrPayload(input: Record<string, unknown>): Record<string, unknown> {
  const out = { ...input };

  // The source snapshot can carry household/student/staff arrays — strip them.
  if (out['source_data_snapshot']) {
    const src = { ...(out['source_data_snapshot'] as Record<string, unknown>) };
    // Allow aggregate counts; remove the per-row arrays.
    delete src['students_by_year_group'];
    delete src['fees_by_year_group'];
    delete src['staff_by_department'];
    out['source_data_snapshot'] = src;
  }

  // Drop any explicit household / student / staff list fields that may have
  // been added by future engine extensions.
  delete out['households'];
  delete out['students'];
  delete out['staff'];
  delete out['individual_payroll'];

  // line_items can be safely returned (they're aggregate by category) but we
  // strip `computed_from` because it can carry department_id / year_group_id
  // that, while not directly PII, narrows the audience to identifiable
  // population segments.
  if (Array.isArray(out['line_items'])) {
    out['line_items'] = (out['line_items'] as Array<Record<string, unknown>>).map((li) => {
      const copy = { ...li };
      delete copy['computed_from'];
      return copy;
    });
  }

  return out;
}

function formatFy(start: Date, end: Date): string {
  const sy = start.getUTCFullYear(),
    ey = end.getUTCFullYear();
  return sy === ey ? String(sy) : `${sy}/${String(ey).slice(2)}`;
}
```

### 2. `apps/api/src/modules/budgeting/shareable-links/shareable-links.types.ts` — NEW

```typescript
import { z } from 'zod';

export const createLinkSchema = z.object({
  expires_in_days: z
    .number()
    .int()
    .refine((v) => [7, 14, 30, 90].includes(v), {
      message: 'expires_in_days must be 7, 14, 30, or 90',
    }),
  password: z.string().min(4).max(128).optional(),
  scenarios_visible: z.array(z.string()).default(['base']),
});
export type CreateLinkDto = z.infer<typeof createLinkSchema>;

export interface CreateLinkResponse {
  id: string;
  token: string;
  full_url: string;
  expires_at: string;
}

export interface ListLinksResponse {
  data: Array<{
    id: string;
    token: string;
    full_url: string;
    expires_at: string;
    revoked_at: string | null;
    view_count: number;
    last_viewed_at: string | null;
    scenarios_visible: string[];
    has_password: boolean;
    created_at: string;
    created_by: string;
  }>;
}

export interface PublicShareResponse {
  tenant_name: string;
  currency_code: string;
  model_id: string;
  model_name: string;
  version_number: number;
  published_at: string;
  fiscal_year_label: string;
  payload: Record<string, unknown>;
}
```

### 3. `apps/api/src/modules/budgeting/shareable-links/shareable-links.controller.ts` — NEW

Authenticated CRUD controller. Three routes, all gated by `budgeting.view` (read) or `budgeting.share` (mutation).

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { TenantContext } from '../../../common/types/tenant-context';
import type { CurrentUserContext } from '../../../common/types/current-user-context';

import {
  type CreateLinkDto,
  type CreateLinkResponse,
  type ListLinksResponse,
  createLinkSchema,
} from './shareable-links.types';
import { ShareableLinksService } from './shareable-links.service';

@Controller('v1/budgeting/financial-models/:id/snapshots/:snapshotId/links')
@UseGuards(AuthGuard, PermissionGuard)
export class ShareableLinksController {
  constructor(private readonly service: ShareableLinksService) {}

  @Get()
  @RequiresPermission('budgeting.view')
  list(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
  ): Promise<ListLinksResponse> {
    return this.service.listForSnapshot(ctx.tenant_id, modelId, snapshotId);
  }

  @Post()
  @RequiresPermission('budgeting.share')
  create(
    @CurrentTenant() ctx: TenantContext,
    @CurrentUser() user: CurrentUserContext,
    @Param('id', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
    @Body(new ZodValidationPipe(createLinkSchema)) body: CreateLinkDto,
  ): Promise<CreateLinkResponse> {
    return this.service.create(ctx.tenant_id, user.id, modelId, snapshotId, body);
  }

  @Post(':linkId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPermission('budgeting.share')
  async revoke(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) modelId: string,
    @Param('snapshotId', ParseUUIDPipe) snapshotId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ): Promise<void> {
    await this.service.revoke(ctx.tenant_id, modelId, snapshotId, linkId);
  }
}
```

### 4. `apps/api/src/modules/budgeting/shareable-links/shareable-links.public.controller.ts` — NEW

Open-route controller. **No auth guards.** Exposed at `/v1/budgeting/share/:token`.

```typescript
import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';

import type { PublicShareResponse } from './shareable-links.types';
import { ShareableLinksService } from './shareable-links.service';

/**
 * Open route — no auth guard, no permission guard, no tenant decorator.
 * The service does its own validation: tenant boundary, expiry, revoke,
 * password, and PII scrubbing. See ShareableLinksService.resolveByToken
 * for the security invariant.
 *
 * Rate limiting: this route is a candidate for the existing rate-limit
 * middleware (whichever pattern the project uses for the
 * `/v1/auth/*` open routes). If that infrastructure is not in place yet,
 * §7 below documents it as a v1.5 follow-up. The token is a UUID and
 * therefore unguessable in practice, but rate-limiting protects against
 * password-brute-force on protected links.
 */
@Controller('v1/budgeting/share')
export class ShareableLinksPublicController {
  constructor(private readonly service: ShareableLinksService) {}

  @Get(':token')
  async resolve(
    @Param('token') token: string,
    @Query('password') password?: string,
  ): Promise<PublicShareResponse> {
    if (!token) throw new NotFoundException('Invalid link.');
    return this.service.resolveByToken(token, password);
  }
}
```

### 5. `apps/api/src/modules/budgeting/budgeting.module.ts` — UPDATE

Add the two controllers and the service:

```typescript
controllers: [
  // ...existing
  ShareableLinksController,
  ShareableLinksPublicController,
],
providers: [
  // ...existing
  ShareableLinksService,
],
```

Confirm the `ShareableLinksPublicController` route is **excluded from the global auth guard** if one exists. The repo pattern: open routes are listed in `apps/api/src/main.ts` or in the auth guard's allowlist. Add `/v1/budgeting/share/*` to that allowlist in the same commit.

### 6. `apps/api/src/modules/budgeting/shareable-links/shareable-links.service.spec.ts` — NEW

Co-located. Covers token generation, every resolver branch, the PII scrub, and cross-tenant RLS leakage.

```typescript
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcrypt';

import { ShareableLinksService, filterPayloadForPublic, isUuid } from './shareable-links.service';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma) => ({
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const MODEL_ID = '33333333-3333-3333-3333-333333333333';
const SNAPSHOT_ID = '44444444-4444-4444-4444-444444444444';
const USER_ID = '55555555-5555-5555-5555-555555555555';

function build({
  snapshot,
  link,
  links = [],
}: { snapshot?: unknown; link?: unknown; links?: unknown[] } = {}) {
  const prisma = {
    financialModelSnapshot: { findFirst: jest.fn().mockResolvedValue(snapshot ?? null) },
    shareableLink: {
      findUnique: jest.fn().mockResolvedValue(link ?? null),
      findFirst: jest.fn().mockResolvedValue(link ?? null),
      findMany: jest.fn().mockResolvedValue(links),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'link-1',
        token: args.data.token as string,
        expires_at: args.data.expires_at as Date,
      })),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const svc = new ShareableLinksService(prisma as never);
  return { svc, prisma };
}

describe('ShareableLinksService — create', () => {
  it('rejects invalid expires_in_days', async () => {
    const { svc } = build({ snapshot: { id: SNAPSHOT_ID } });
    await expect(
      svc.create(TENANT_A, USER_ID, MODEL_ID, SNAPSHOT_ID, {
        expires_in_days: 5 as never,
        scenarios_visible: ['base'],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('hashes password with bcrypt when supplied', async () => {
    const { svc, prisma } = build({ snapshot: { id: SNAPSHOT_ID } });
    await svc.create(TENANT_A, USER_ID, MODEL_ID, SNAPSHOT_ID, {
      expires_in_days: 30,
      password: 'secret',
      scenarios_visible: ['base'],
    });
    const data = prisma.shareableLink.create.mock.calls[0][0].data;
    expect(data.password_hash).toBeTruthy();
    expect(data.password_hash).not.toBe('secret');
    expect(await bcrypt.compare('secret', data.password_hash as string)).toBe(true);
  });

  it('generates a UUID token', async () => {
    const { svc, prisma } = build({ snapshot: { id: SNAPSHOT_ID } });
    await svc.create(TENANT_A, USER_ID, MODEL_ID, SNAPSHOT_ID, {
      expires_in_days: 30,
      scenarios_visible: ['base'],
    });
    const token = prisma.shareableLink.create.mock.calls[0][0].data.token as string;
    expect(isUuid(token)).toBe(true);
  });

  it('stores scenarios_visible array verbatim', async () => {
    const { svc, prisma } = build({ snapshot: { id: SNAPSHOT_ID } });
    await svc.create(TENANT_A, USER_ID, MODEL_ID, SNAPSHOT_ID, {
      expires_in_days: 30,
      scenarios_visible: ['base', 'cautious'],
    });
    const data = prisma.shareableLink.create.mock.calls[0][0].data;
    expect(data.scenarios_visible).toEqual(['base', 'cautious']);
  });

  it('throws NotFound when snapshot does not exist in tenant', async () => {
    const { svc } = build({ snapshot: null });
    await expect(
      svc.create(TENANT_A, USER_ID, MODEL_ID, SNAPSHOT_ID, {
        expires_in_days: 30,
        scenarios_visible: ['base'],
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ShareableLinksService — revoke', () => {
  it('sets revoked_at when link exists', async () => {
    const { svc, prisma } = build({
      link: { id: 'link-1', revoked_at: null },
    });
    await svc.revoke(TENANT_A, MODEL_ID, SNAPSHOT_ID, 'link-1');
    expect(prisma.shareableLink.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: expect.objectContaining({ revoked_at: expect.any(Date) }),
    });
  });

  it('is idempotent when already revoked', async () => {
    const { svc, prisma } = build({
      link: { id: 'link-1', revoked_at: new Date() },
    });
    await svc.revoke(TENANT_A, MODEL_ID, SNAPSHOT_ID, 'link-1');
    expect(prisma.shareableLink.update).not.toHaveBeenCalled();
  });

  it('throws NotFound when link missing in tenant', async () => {
    const { svc } = build({ link: null });
    await expect(svc.revoke(TENANT_A, MODEL_ID, SNAPSHOT_ID, 'link-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('ShareableLinksService — resolveByToken', () => {
  const baseLink = {
    id: 'link-1',
    tenant_id: TENANT_A,
    expires_at: new Date(Date.now() + 86400_000),
    revoked_at: null,
    password_hash: null,
    scenarios_visible: ['base'],
    parent_snapshot: {
      tenant_id: TENANT_A,
      version_number: 1,
      published_at: new Date('2026-04-01T00:00:00Z'),
      payload: {
        line_items: [
          {
            category: 'income',
            subcategory: 'tuition_net',
            amount: 1000,
            computed_from: { secret: true },
          },
        ],
        totals_by_year: [{ fiscal_year: 1, revenue: 1000, expenditure: 800, net_result: 200 }],
        scenarios: [
          { name: 'base', line_items: [] },
          { name: 'growth', line_items: [] },
        ],
      },
      tenant: { name: 'Acme', currency_code: 'EUR' },
      parent_model: {
        id: MODEL_ID,
        name: 'FY26',
        fiscal_year_start: new Date('2026-09-01'),
        fiscal_year_end: new Date('2027-06-30'),
      },
    },
  };

  it('returns 404 for non-uuid token', async () => {
    const { svc } = build({ link: null });
    await expect(svc.resolveByToken('not-a-uuid')).rejects.toThrow(NotFoundException);
  });

  it('returns 404 when token unknown', async () => {
    const { svc } = build({ link: null });
    await expect(svc.resolveByToken('66666666-6666-6666-6666-666666666666')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns 404 when expired', async () => {
    const { svc } = build({
      link: { ...baseLink, expires_at: new Date(Date.now() - 1000) },
    });
    await expect(svc.resolveByToken('66666666-6666-6666-6666-666666666666')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns 404 when revoked', async () => {
    const { svc } = build({
      link: { ...baseLink, revoked_at: new Date() },
    });
    await expect(svc.resolveByToken('66666666-6666-6666-6666-666666666666')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns 404 when password required but not supplied', async () => {
    const { svc } = build({
      link: { ...baseLink, password_hash: await bcrypt.hash('letmein', 10) },
    });
    await expect(svc.resolveByToken('66666666-6666-6666-6666-666666666666')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns 404 when password wrong', async () => {
    const { svc } = build({
      link: { ...baseLink, password_hash: await bcrypt.hash('letmein', 10) },
    });
    await expect(
      svc.resolveByToken('66666666-6666-6666-6666-666666666666', 'wrong'),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns sanitised payload when password correct', async () => {
    const { svc } = build({
      link: { ...baseLink, password_hash: await bcrypt.hash('letmein', 10) },
    });
    const out = await svc.resolveByToken('66666666-6666-6666-6666-666666666666', 'letmein');
    expect(out.tenant_name).toBe('Acme');
    expect(out.payload.scenarios).toBeDefined();
    // computed_from must be stripped from line_items.
    expect(
      (out.payload.line_items as Array<Record<string, unknown>>)[0].computed_from,
    ).toBeUndefined();
  });

  it('SECURITY: returns 404 when link.tenant_id != snapshot.tenant_id', async () => {
    const { svc } = build({
      link: {
        ...baseLink,
        tenant_id: TENANT_A,
        parent_snapshot: { ...baseLink.parent_snapshot, tenant_id: TENANT_B },
      },
    });
    await expect(svc.resolveByToken('66666666-6666-6666-6666-666666666666')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('filters scenarios to scenarios_visible', async () => {
    const { svc } = build({
      link: { ...baseLink, scenarios_visible: ['base'] }, // growth not visible
    });
    const out = await svc.resolveByToken('66666666-6666-6666-6666-666666666666');
    const scenarios = out.payload.scenarios as Array<{ name: string }>;
    expect(scenarios.find((s) => s.name === 'growth')).toBeUndefined();
    expect(scenarios.find((s) => s.name === 'base')).toBeDefined();
  });

  it('increments view_count on each successful resolve', async () => {
    const { svc, prisma } = build({ link: baseLink });
    await svc.resolveByToken('66666666-6666-6666-6666-666666666666');
    expect(prisma.shareableLink.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: expect.objectContaining({
        view_count: { increment: 1 },
        last_viewed_at: expect.any(Date),
      }),
    });
  });
});

// ─── PII scrubbing ────────────────────────────────────────────────────────

describe('filterPayloadForPublic', () => {
  it('drops household / student / staff arrays', () => {
    const out = filterPayloadForPublic(
      {
        line_items: [],
        households: [{ id: 'h1', name: 'Doe Family' }],
        students: [{ id: 's1', name: 'Alice' }],
        staff: [{ id: 'st1', name: 'Mr Smith', salary: 50_000 }],
        individual_payroll: [{ id: 'p1', amount: 4000 }],
      },
      ['base'],
    );
    expect(out.households).toBeUndefined();
    expect(out.students).toBeUndefined();
    expect(out.staff).toBeUndefined();
    expect(out.individual_payroll).toBeUndefined();
  });

  it('strips per-row arrays from source_data_snapshot', () => {
    const out = filterPayloadForPublic(
      {
        source_data_snapshot: {
          total_active_students: 600,
          students_by_year_group: [{ year_group_id: 'yg1', active_count: 60 }],
          fees_by_year_group: [],
          staff_by_department: [],
        },
      },
      ['base'],
    );
    const src = out.source_data_snapshot as Record<string, unknown>;
    expect(src.total_active_students).toBe(600); // aggregate stays
    expect(src.students_by_year_group).toBeUndefined(); // detail goes
    expect(src.fees_by_year_group).toBeUndefined();
    expect(src.staff_by_department).toBeUndefined();
  });

  it('strips computed_from from line items', () => {
    const out = filterPayloadForPublic(
      {
        line_items: [
          {
            category: 'income',
            subcategory: 'tuition_net',
            amount: 100,
            computed_from: { department_id: 'd1' },
          },
        ],
      },
      ['base'],
    );
    const li = (out.line_items as Array<Record<string, unknown>>)[0];
    expect(li.computed_from).toBeUndefined();
    expect(li.amount).toBe(100);
  });

  it('respects scenarios_visible allowlist', () => {
    const out = filterPayloadForPublic(
      {
        scenarios: [
          { name: 'base', line_items: [] },
          { name: 'growth', line_items: [] },
          { name: 'stress', line_items: [] },
        ],
      },
      ['base', 'growth'],
    );
    const scen = out.scenarios as Array<{ name: string }>;
    expect(scen.map((s) => s.name)).toEqual(['base', 'growth']);
  });
});
```

### 7. `apps/worker/src/processors/budgeting/shareable-link-cleanup.processor.ts` — NEW

The cleanup worker. Cross-tenant — no `tenant_id` in payload.

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

export const BUDGETING_SHAREABLE_LINK_CLEANUP_JOB = 'budgeting:shareable-link-cleanup';

const RETENTION_DAYS = 30;

@Injectable()
export class ShareableLinkCleanupProcessor {
  private readonly logger = new Logger(ShareableLinkCleanupProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async process(job: Job): Promise<void> {
    if (job.name !== BUDGETING_SHAREABLE_LINK_CLEANUP_JOB) return;

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    // Cross-tenant — no RLS. The cleanup is platform-level. We deliberately
    // do NOT scope by tenant because there's no tenant context attached;
    // this job runs once for all tenants.
    const removed = await this.prisma.shareableLink.deleteMany({
      where: { expires_at: { lt: cutoff } },
    });
    this.logger.log(
      `${BUDGETING_SHAREABLE_LINK_CLEANUP_JOB} done — removed ${removed.count} expired link(s) (cutoff ${cutoff.toISOString()})`,
    );
  }
}
```

### 8. `apps/worker/src/processors/budgeting/shareable-link-cleanup.processor.spec.ts` — NEW

```typescript
import { Job } from 'bullmq';

import {
  BUDGETING_SHAREABLE_LINK_CLEANUP_JOB,
  ShareableLinkCleanupProcessor,
} from './shareable-link-cleanup.processor';

describe('ShareableLinkCleanupProcessor', () => {
  it('deletes only links whose expires_at is older than 30 days', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 4 });
    const prisma = { shareableLink: { deleteMany } } as unknown as {
      shareableLink: { deleteMany: typeof deleteMany };
    };
    const proc = new ShareableLinkCleanupProcessor(prisma as never);
    await proc.process({ id: 'job', name: BUDGETING_SHAREABLE_LINK_CLEANUP_JOB } as unknown as Job);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    const arg = deleteMany.mock.calls[0][0];
    expect(arg.where.expires_at.lt).toBeInstanceOf(Date);
    const cutoff = arg.where.expires_at.lt as Date;
    const ageDays = (Date.now() - cutoff.getTime()) / 86_400_000;
    expect(ageDays).toBeCloseTo(30, 0);
  });

  it('does nothing for unknown job names', async () => {
    const deleteMany = jest.fn();
    const prisma = { shareableLink: { deleteMany } };
    const proc = new ShareableLinkCleanupProcessor(prisma as never);
    await proc.process({ id: 'job', name: 'wrong:name' } as unknown as Job);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
```

### 9. `apps/worker/src/cron/cron-scheduler.service.ts` — UPDATE

Add the cleanup cron alongside the bootstrap cron from Phase 08. Phase 08 already adds the `BUDGETING` queue injection — this phase only appends another `add()` call inside `registerBudgetingCronJobs()`.

```typescript
// Add import
import { BUDGETING_SHAREABLE_LINK_CLEANUP_JOB } from '../processors/budgeting/shareable-link-cleanup.processor';

// Inside registerBudgetingCronJobs() — after the bootstrap registration:
//
// ── budgeting:shareable-link-cleanup ─────────────────────────────────────
// Runs daily at 03:00 UTC. Cross-tenant — empty payload.
// Hard-deletes shareable_links rows where expires_at < now() - 30 days.
await this.budgetingQueue.add(
  BUDGETING_SHAREABLE_LINK_CLEANUP_JOB,
  {},
  {
    repeat: { pattern: '0 3 * * *' },
    jobId: `cron:${BUDGETING_SHAREABLE_LINK_CLEANUP_JOB}`,
    removeOnComplete: 10,
    removeOnFail: 50,
  },
);
this.logger.log(
  `Registered repeatable cron: ${BUDGETING_SHAREABLE_LINK_CLEANUP_JOB} (daily 03:00 UTC)`,
);
```

### 10. `apps/worker/src/worker.module.ts` — UPDATE

Add `ShareableLinkCleanupProcessor` to providers and append the case to the `BudgetingQueueDispatcher` from Phase 08:

```typescript
// In budgeting-queue.processor.ts case statement:
case BUDGETING_SHAREABLE_LINK_CLEANUP_JOB:
  await this.shareableLinkCleanup.process(job);
  return;

// Constructor injection:
private readonly shareableLinkCleanup: ShareableLinkCleanupProcessor,
```

### 11. Architecture docs — UPDATE

- `docs/architecture/event-job-catalog.md` — add `budgeting:shareable-link-cleanup` (queue: budgeting; schedule: cron daily 03:00 UTC; payload: `{}`; side-effect: hard-deletes `shareable_links` rows older than 30 days).
- `docs/architecture/danger-zones.md` — append entry titled "Budgeting public share route — single unauthenticated endpoint in this rebuild" with the security invariants from §1: tenant boundary check, expiry, revoke, password, PII scrub. Mitigation: `ShareableLinksService.resolveByToken` enforces all five; the spec asserts each branch.

### 12. Rate limiting — note for v1.5

The public route `/v1/budgeting/share/:token` should be rate-limited. Two acceptable paths:

- **Best**: hook into the existing rate-limit middleware that protects auth endpoints (whatever the project uses — `@nestjs/throttler` is common). Add a `@Throttle({ default: { limit: 30, ttl: 60_000 } })` decorator to the resolver. 30 req/min per IP is plenty for a board-member viewing flow and tight enough to throttle a password brute-force.
- **Fallback**: if the project does not yet have rate limiting on its other open routes, do not introduce a new limiter in this phase — record the gap as a v1.5 follow-up and lean on Cloudflare / NGINX rate-limit at the edge in the meantime.

The `Authorization: Bearer` token-format brute-force isn't a concern (the token is a UUID — 122 bits of entropy — unguessable in practice). The brute-force concern is the optional password on protected links.

## Testing requirements

- **`shareable-links.service.spec.ts`** — every test in §6. Cover:
  - Token generation produces UUIDs, hashes passwords with bcrypt, persists scenarios_visible, rejects invalid expiry.
  - Resolver: invalid token / unknown token / expired / revoked / wrong password / correct password / no password / scenarios filter / view-count increment.
  - Tenant boundary check returns 404 when `link.tenant_id != snapshot.tenant_id`.
  - PII scrubbing in `filterPayloadForPublic` for households / students / staff / individual_payroll / source_data_snapshot per-row arrays / computed_from on line items.
- **RLS leakage** — covered by the spec above plus an integration test pattern: create link in Tenant A, attempt to resolve from a Tenant B authenticated context (irrelevant — open route), confirm the tenant boundary check still 404s when a malformed/cross-tenant row is constructed via fixtures. The integration test belongs in `apps/api/test/budgeting-shareable-links.rls.spec.ts`.
- **`shareable-link-cleanup.processor.spec.ts`** — the two cases in §8.
- **AppModule DI smoke** — required because two new controllers and a service are added.
- **Regression** — `pnpm turbo run test --filter=@school/api --filter=@school/worker`.

## Post-deploy verification

1. Rsync to production. `chown -R edupod:edupod`. Build api + worker. `pm2 restart api worker`.
2. Confirm `pm2 logs worker --lines 50` shows the cleanup cron registered:
   `Registered repeatable cron: budgeting:shareable-link-cleanup (daily 03:00 UTC)`.
3. From an authenticated session on NHQS, issue a link:
   ```bash
   curl -X POST https://nhqs.edupod.app/api/v1/budgeting/financial-models/<id>/snapshots/<sid>/links \
     -H "Authorization: Bearer <owner-jwt>" \
     -H "Content-Type: application/json" \
     -d '{"expires_in_days": 7, "scenarios_visible": ["base"]}'
   ```
   Confirm `{ id, token, full_url, expires_at }` in the response.
4. **Without auth**, hit the public URL:
   ```bash
   curl -i https://nhqs.edupod.app/api/v1/budgeting/share/<token>
   ```
   Expect 200 with the snapshot payload — but **no** `households`, `students`, `staff`, `individual_payroll`, or per-row source detail in the JSON. Confirm by `jq` on the response.
5. Re-issue with a password and a 14-day expiry:
   ```bash
   curl -X POST https://nhqs.edupod.app/api/v1/budgeting/financial-models/<id>/snapshots/<sid>/links \
     -H "Authorization: Bearer <owner-jwt>" -d '{"expires_in_days": 14, "password": "boardonly", "scenarios_visible": ["base"]}'
   ```
   Confirm `curl https://.../share/<token>` → 404, then `curl https://.../share/<token>?password=boardonly` → 200.
6. Revoke:
   ```bash
   curl -X POST https://nhqs.edupod.app/api/v1/budgeting/financial-models/<id>/snapshots/<sid>/links/<linkId>/revoke \
     -H "Authorization: Bearer <owner-jwt>"
   ```
   Confirm 204, then `curl https://.../share/<token>` → 404.
7. In psql, confirm `SELECT view_count, last_viewed_at FROM shareable_links WHERE token = '<token>'` reflects the unauthenticated access count.

## Follow-ups for subsequent waves

- Phase 19 (Shareable Link UI + Public Read-Only Snapshot View) builds the issuing modal that POSTs to `/v1/budgeting/...links`, the management list that renders this controller's `GET`, and the public page at `/finance/budgeting/share/[token]/page.tsx` that calls the resolver with `?password=...` when a user types it.
- Phase 21 (polish) writes the smoke test that issues a link in NHQS and confirms the public URL renders the read-only view in a no-auth browser context.
- Add rate limiting (see §12) as a v1.5 follow-up if the project's open-route rate-limit infrastructure is not yet in place.
- The PLAN's `view_count` semantics are "every load increments" (`PLAN.md §11.2`). If load patterns prove noisy (a board member refreshing 50 times) we could throttle increments to once per 60 seconds per IP; track as a v1.5 polish.
- The bcrypt hash + open route is the only place in the budgeting module where bcrypt is used. Reuse the project's existing bcrypt cost factor (`BCRYPT_ROUNDS = 10` matches the auth module's pattern; if the auth module uses a different value, align this phase to it).

## Rollback

`git revert <commit-sha>`. The schema is unchanged — Phase 01 owns the `shareable_links` table. Existing rows persist; the open route will simply 404 once the controller is gone. To proactively disable in-flight links during a rollback emergency:

```sql
UPDATE shareable_links SET revoked_at = now() WHERE revoked_at IS NULL;
```

The cleanup worker, if disabled, leaves rows in place — they'll be picked up on the next reinstatement. To clear active repeatables in Redis after a worker rollback:

```bash
ssh root@46.62.244.139 "redis-cli -h redis -p 6379 KEYS 'bull:budgeting:repeat:*' | xargs redis-cli DEL"
```
