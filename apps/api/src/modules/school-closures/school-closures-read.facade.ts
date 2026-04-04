/**
 * SchoolClosuresReadFacade — Centralized read service for school closure data.
 *
 * PURPOSE:
 * The school-closures module owns the `schoolClosure` table. Payroll's
 * class-delivery service queries school closures to exclude closure dates
 * when auto-populating delivery records.
 *
 * This facade provides a single, well-typed entry point for cross-module
 * school closure reads.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Batch methods return arrays (empty = nothing found).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface SchoolClosureDateRow {
  closure_date: Date;
}

export interface SchoolClosureRow {
  id: string;
  closure_date: Date;
  reason: string | null;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class SchoolClosuresReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find school closures within a date range. Used by payroll class-delivery
   * to exclude closure dates when auto-populating delivery records.
   */
  async findClosuresInRange(
    tenantId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<SchoolClosureDateRow[]> {
    return this.prisma.schoolClosure.findMany({
      where: {
        tenant_id: tenantId,
        closure_date: { gte: dateFrom, lte: dateTo },
      },
      select: { closure_date: true },
    });
  }

  /**
   * Get the set of closure date strings (YYYY-MM-DD) for a date range.
   * Convenience method that returns a Set for O(1) lookups.
   */
  async getClosureDateSet(tenantId: string, dateFrom: Date, dateTo: Date): Promise<Set<string>> {
    const closures = await this.findClosuresInRange(tenantId, dateFrom, dateTo);
    return new Set(closures.map((c) => c.closure_date.toISOString().split('T')[0] ?? ''));
  }

  /**
   * Check if a specific date is a school closure date.
   */
  async isClosureDate(tenantId: string, date: Date): Promise<boolean> {
    const found = await this.prisma.schoolClosure.findFirst({
      where: { tenant_id: tenantId, closure_date: date },
      select: { id: true },
    });
    return found !== null;
  }
}
