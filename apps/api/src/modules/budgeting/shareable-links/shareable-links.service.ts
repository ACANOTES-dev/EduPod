import { randomUUID } from 'crypto';

import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { SHAREABLE_LINK_EXPIRY_DAYS, type CreateShareableLinkDto } from '@school/shared/budgeting';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import type {
  CreateLinkResponse,
  ListLinksResponse,
  PublicShareResponse,
} from './shareable-links.types';

/**
 * ShareableLinksService — issues, lists, revokes, and resolves
 * read-only board-pack share tokens (`PLAN.md §11.2`).
 *
 * Two surfaces:
 *   - Authenticated CRUD (issue / list / revoke), gated by
 *     `budgeting.view` (read) or `budgeting.share` (mutation).
 *   - Public {@link resolveByToken} — the ONLY unauthenticated endpoint
 *     in this rebuild. It refuses expired / revoked / wrong-password
 *     tokens, scrubs PII, and verifies that the token's `tenant_id`
 *     matches the snapshot's `tenant_id` as a defense-in-depth check
 *     so a data-integrity bug in another module cannot become a
 *     cross-tenant escape.
 *
 * The cleanup worker `budgeting:shareable-link-cleanup` (impl 11
 * worker side) hard-deletes rows whose `expires_at` is older than 30
 * days — keeps the table small and removes orphaned password hashes.
 */

// Auth module's cost factor — keep aligned. See `auth-password-reset.service.ts`.
const BCRYPT_ROUNDS = 12;

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
    // Confirm the snapshot belongs to the tenant + model. RLS would scope
    // this transparently, but the explicit findFirst returns a structured
    // 404 instead of an empty list when the IDs don't line up.
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
        password_hash: true, // exposed only as `has_password: boolean`
        created_at: true,
        created_by: true,
      },
    });

    return {
      data: links.map((l) => ({
        id: l.id,
        token: l.token,
        full_url: this.buildPublicUrl(l.token),
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
    dto: CreateShareableLinkDto,
  ): Promise<CreateLinkResponse> {
    if (!SHAREABLE_LINK_EXPIRY_DAYS.includes(dto.expires_in_days)) {
      throw new ForbiddenException({
        code: 'INVALID_EXPIRY',
        message: `expires_in_days must be one of ${SHAREABLE_LINK_EXPIRY_DAYS.join(', ')} (got ${dto.expires_in_days}).`,
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

    const created = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
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
      full_url: this.buildPublicUrl(created.token),
      expires_at: created.expires_at.toISOString(),
    };
  }

  // ─── Authenticated: revoke ──────────────────────────────────────────────

  async revoke(
    tenantId: string,
    userId: string,
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

    await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      await tx.shareableLink.update({
        where: { id: linkId },
        data: { revoked_at: new Date() },
      });
    });
  }

  // ─── Public: resolve by token (no auth) ─────────────────────────────────

  /**
   * Resolves a token into a snapshot payload safe for unauthenticated
   * viewers.
   *
   * SECURITY INVARIANTS — this method enforces all five branches before
   * returning data:
   *   1. Token shape is a valid UUID → otherwise 404.
   *   2. The link exists.
   *   3. `link.tenant_id === link.parent_snapshot.tenant_id` (defense-in-depth
   *      against an unrelated module bug minting a row with mismatched
   *      tenant_ids).
   *   4. `expires_at > now()` AND `revoked_at IS NULL`.
   *   5. If `password_hash` is set, the supplied password matches.
   *
   * Output passes through {@link filterPayloadForPublic} which strips
   * household / student / staff arrays, source-data per-row arrays, and
   * line-item `computed_from`.
   */
  async resolveByToken(token: string, passwordAttempt?: string): Promise<PublicShareResponse> {
    if (!isUuid(token)) {
      throw new NotFoundException(PUBLIC_NOT_FOUND);
    }

    const link = await this.prisma.shareableLink.findUnique({
      where: { token },
      include: {
        parent_snapshot: {
          include: {
            tenant: { select: { name: true, currency_code: true } },
            parent_model: {
              select: {
                id: true,
                name: true,
                fiscal_year_start: true,
                fiscal_year_end: true,
              },
            },
          },
        },
      },
    });
    if (!link) throw new NotFoundException(PUBLIC_NOT_FOUND);

    // Defense-in-depth: the RLS layer should already prevent cross-tenant
    // mismatches reaching us, but verify explicitly so a bug elsewhere
    // cannot become a cross-tenant escape via this open route.
    if (link.tenant_id !== link.parent_snapshot.tenant_id) {
      this.logger.error(
        `Cross-tenant share-link mismatch detected — link ${link.id} ` +
          `tenant ${link.tenant_id} vs snapshot tenant ${link.parent_snapshot.tenant_id}. ` +
          `Returning 404. This indicates a data-integrity bug elsewhere.`,
      );
      throw new NotFoundException(PUBLIC_NOT_FOUND);
    }

    if (link.expires_at < new Date()) throw new NotFoundException(PUBLIC_NOT_FOUND);
    if (link.revoked_at) throw new NotFoundException(PUBLIC_NOT_FOUND);

    if (link.password_hash) {
      if (!passwordAttempt) throw new NotFoundException(PUBLIC_NOT_FOUND);
      const ok = await bcrypt.compare(passwordAttempt, link.password_hash);
      if (!ok) throw new NotFoundException(PUBLIC_NOT_FOUND);
    }

    // Increment view_count + update last_viewed_at. Scoped to the link's
    // primary key — a stale increment under concurrent reads is acceptable;
    // this is telemetry, not a security check.
    try {
      await this.prisma.shareableLink.update({
        where: { id: link.id },
        data: { view_count: { increment: 1 }, last_viewed_at: new Date() },
      });
    } catch (err) {
      // Telemetry only — do NOT fail the resolve on a write hiccup.
      this.logger.warn(
        `view_count increment failed for link ${link.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const visible = Array.isArray(link.scenarios_visible)
      ? (link.scenarios_visible as string[])
      : ['base'];
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

  private buildPublicUrl(token: string): string {
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
 * Strip household-level, student-level, and staff-salary detail from
 * the snapshot payload before serving it on the public route. The
 * PLAN's contract is "aggregate categories and totals only" — this
 * function enforces that contract at serialisation time.
 *
 * Scenarios not in `visibleScenarios` are dropped. The base case is
 * always included implicitly (it's the top-level `base_case` field,
 * not an entry in `scenarios`).
 */
export function filterPayloadForPublic(
  rawPayload: unknown,
  visibleScenarios: string[],
): Record<string, unknown> {
  if (!rawPayload || typeof rawPayload !== 'object') return {};
  const payload = { ...(rawPayload as Record<string, unknown>) };

  // 1. Filter `scenarios` to the allowlist (matched by name).
  if (Array.isArray(payload.scenarios)) {
    const allowed = new Set(visibleScenarios);
    payload.scenarios = (payload.scenarios as Array<Record<string, unknown>>)
      .filter((s) => allowed.has((s.name as string) ?? ''))
      .map((s) => sanitiseScenarioOrPayload(s));
  }

  // 2. Sanitise top-level fields (line_items, totals, drivers,
  //    per_pupil_unit_economics, source data — anything with PII).
  return sanitiseScenarioOrPayload(payload);
}

function sanitiseScenarioOrPayload(input: Record<string, unknown>): Record<string, unknown> {
  const out = { ...input };

  // Strip per-row arrays from the source snapshot — keep the aggregates.
  if (out['source_data_snapshot']) {
    const src = { ...(out['source_data_snapshot'] as Record<string, unknown>) };
    delete src['students_by_year_group'];
    delete src['fees_by_year_group'];
    delete src['staff_by_department'];
    out['source_data_snapshot'] = src;
  }
  if (out['source_snapshot']) {
    const src = { ...(out['source_snapshot'] as Record<string, unknown>) };
    delete src['students_by_year_group'];
    delete src['fees_by_year_group'];
    delete src['staff_by_department'];
    out['source_snapshot'] = src;
  }

  // Drop explicit household / student / staff list fields that may
  // appear in future engine extensions.
  delete out['households'];
  delete out['students'];
  delete out['staff'];
  delete out['individual_payroll'];

  // line_items are aggregate by category + safe to return, but strip
  // `computed_from` because it can carry department_id / year_group_id
  // that narrow the audience to identifiable population segments.
  if (Array.isArray(out['line_items'])) {
    out['line_items'] = (out['line_items'] as Array<Record<string, unknown>>).map((li) => {
      const copy = { ...li };
      delete copy['computed_from'];
      return copy;
    });
  }

  // Same scrub inside base_case if present (snapshot payload v1 nests
  // the base case under `base_case.line_items`).
  if (out['base_case'] && typeof out['base_case'] === 'object') {
    const baseCase = { ...(out['base_case'] as Record<string, unknown>) };
    if (Array.isArray(baseCase['line_items'])) {
      baseCase['line_items'] = (baseCase['line_items'] as Array<Record<string, unknown>>).map(
        (li) => {
          const copy = { ...li };
          delete copy['computed_from'];
          return copy;
        },
      );
    }
    out['base_case'] = baseCase;
  }

  return out;
}

function formatFy(start: Date, end: Date): string {
  const sy = start.getUTCFullYear();
  const ey = end.getUTCFullYear();
  return sy === ey ? String(sy) : `${sy}/${String(ey).slice(2)}`;
}
