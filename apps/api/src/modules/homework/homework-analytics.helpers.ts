import type { Prisma } from '@prisma/client';

// ─── Filter Types ────────────────────────────────────────────────────────────

export interface AnalyticsFilters {
  academic_year_id?: string;
  academic_period_id?: string;
  date_from?: string;
  date_to?: string;
}

export interface LoadFilters extends AnalyticsFilters {
  class_id?: string;
}

// ─── Helper: Build base where clause from filters ────────────────────────────

export function buildAssignmentWhere(
  tenantId: string,
  filters: AnalyticsFilters,
): Prisma.HomeworkAssignmentWhereInput {
  const where: Prisma.HomeworkAssignmentWhereInput = {
    tenant_id: tenantId,
    status: 'published',
  };

  if (filters.academic_year_id) {
    where.academic_year_id = filters.academic_year_id;
  }
  if (filters.academic_period_id) {
    where.academic_period_id = filters.academic_period_id;
  }
  if (filters.date_from || filters.date_to) {
    where.due_date = {};
    if (filters.date_from) {
      where.due_date.gte = new Date(filters.date_from);
    }
    if (filters.date_to) {
      where.due_date.lte = new Date(filters.date_to);
    }
  }

  return where;
}
