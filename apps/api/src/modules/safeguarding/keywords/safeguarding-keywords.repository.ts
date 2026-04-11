import { Injectable } from '@nestjs/common';

import type {
  CreateSafeguardingKeywordDto,
  MessageFlagSeverity,
  UpdateSafeguardingKeywordDto,
} from '@school/shared/inbox';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Row shape used by the scanner and service. Kept intentionally narrow so the
 * Prisma `SafeguardingKeyword` model is not leaked across module boundaries.
 *
 * `category` is typed as `string` (not the `SafeguardingCategory` union) to
 * mirror the underlying `VARCHAR(64)` column — the enum is a UI convention
 * enforced at the Zod input layer, not a DB invariant.
 */
export interface SafeguardingKeywordRow {
  id: string;
  tenant_id: string;
  keyword: string;
  severity: MessageFlagSeverity;
  category: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Typed, RLS-aware wrapper over `safeguarding_keywords`.
 *
 * All writes flow through `createRlsClient(prisma, { tenant_id }).$transaction`
 * so every mutation sets `app.current_tenant_id` before touching the table.
 * Reads follow the same rule so RLS is exercised consistently.
 *
 * A 5-minute per-tenant in-memory cache of the active keyword set amortises
 * the per-message scanner round trip. It is invalidated on every mutation
 * that could change the active set (create / update / setActive / delete /
 * bulkImport).
 */
@Injectable()
export class SafeguardingKeywordsRepository {
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  private readonly activeCache = new Map<
    string,
    { rows: SafeguardingKeywordRow[]; expiresAt: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  /** Return all keywords for a tenant, active and inactive, ordered by keyword. */
  async listAll(tenantId: string): Promise<SafeguardingKeywordRow[]> {
    return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.safeguardingKeyword.findMany({
        where: { tenant_id: tenantId },
        orderBy: [{ category: 'asc' }, { keyword: 'asc' }],
      });
    });
  }

  /** Return the active keyword set for a tenant, using the 5-minute cache. */
  async findActiveByTenant(tenantId: string): Promise<SafeguardingKeywordRow[]> {
    const now = Date.now();
    const cached = this.activeCache.get(tenantId);
    if (cached && cached.expiresAt > now) {
      return cached.rows;
    }

    const rows = await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;
        return db.safeguardingKeyword.findMany({
          where: { tenant_id: tenantId, active: true },
          orderBy: { keyword: 'asc' },
        });
      },
    );

    this.activeCache.set(tenantId, {
      rows,
      expiresAt: now + SafeguardingKeywordsRepository.CACHE_TTL_MS,
    });
    return rows;
  }

  async findById(tenantId: string, id: string): Promise<SafeguardingKeywordRow | null> {
    return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.safeguardingKeyword.findFirst({ where: { id, tenant_id: tenantId } });
    });
  }

  async create(
    tenantId: string,
    dto: CreateSafeguardingKeywordDto,
  ): Promise<SafeguardingKeywordRow> {
    const row = await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;
        return db.safeguardingKeyword.create({
          data: {
            tenant_id: tenantId,
            keyword: dto.keyword,
            severity: dto.severity,
            category: dto.category,
            active: dto.active ?? true,
          },
        });
      },
    );

    this.invalidate(tenantId);
    return row;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateSafeguardingKeywordDto,
  ): Promise<SafeguardingKeywordRow> {
    const row = await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;
        return db.safeguardingKeyword.update({
          where: { id },
          data: {
            ...(dto.keyword !== undefined && { keyword: dto.keyword }),
            ...(dto.severity !== undefined && { severity: dto.severity }),
            ...(dto.category !== undefined && { category: dto.category }),
            ...(dto.active !== undefined && { active: dto.active }),
          },
        });
      },
    );

    this.invalidate(tenantId);
    return row;
  }

  async setActive(tenantId: string, id: string, active: boolean): Promise<void> {
    await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.safeguardingKeyword.update({
        where: { id },
        data: { active },
      });
    });
    this.invalidate(tenantId);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.safeguardingKeyword.delete({ where: { id } });
    });
    this.invalidate(tenantId);
  }

  /**
   * Bulk-import keywords inside a single transaction. Existing keywords (by
   * `(tenant_id, keyword)`) are left untouched so the unique seed is
   * preserved; new ones are inserted. Returns the split of imported vs
   * skipped so the caller can show a summary in the UI.
   */
  async bulkImport(
    tenantId: string,
    keywords: CreateSafeguardingKeywordDto[],
  ): Promise<{ imported: number; skipped: number }> {
    const result = await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;
        let imported = 0;
        let skipped = 0;

        for (const dto of keywords) {
          const existing = await db.safeguardingKeyword.findFirst({
            where: { tenant_id: tenantId, keyword: dto.keyword },
            select: { id: true },
          });

          if (existing) {
            skipped += 1;
            continue;
          }

          await db.safeguardingKeyword.create({
            data: {
              tenant_id: tenantId,
              keyword: dto.keyword,
              severity: dto.severity,
              category: dto.category,
              active: dto.active ?? true,
            },
          });
          imported += 1;
        }

        return { imported, skipped };
      },
      { maxWait: 10_000, timeout: 60_000 },
    );

    this.invalidate(tenantId);
    return result;
  }

  invalidate(tenantId: string): void {
    this.activeCache.delete(tenantId);
  }

  /** Test helper — clear every cached tenant. Not used in production paths. */
  clearAllForTest(): void {
    this.activeCache.clear();
  }
}
