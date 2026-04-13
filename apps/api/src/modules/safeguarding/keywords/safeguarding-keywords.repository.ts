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
 * No in-process cache: the API and worker run as separate PM2 processes,
 * so any per-process memo would go stale across the boundary — an admin
 * deletes a keyword in the API process while the worker process still
 * matches on it until its own TTL expires. Keyword lists are small and
 * the tsvector query is cheap; read-through is fine at current scale.
 * If this ever becomes a perf hotspot, introduce a Redis pub/sub-backed
 * cache instead of a local one.
 */
@Injectable()
export class SafeguardingKeywordsRepository {
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

  /** Return the active keyword set for a tenant. Reads straight from DB. */
  async findActiveByTenant(tenantId: string): Promise<SafeguardingKeywordRow[]> {
    return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.safeguardingKeyword.findMany({
        where: { tenant_id: tenantId, active: true },
        orderBy: { keyword: 'asc' },
      });
    });
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
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.safeguardingKeyword.delete({ where: { id } });
    });
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

    return result;
  }
}
