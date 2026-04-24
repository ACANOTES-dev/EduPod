import { Injectable } from '@nestjs/common';
import { IncidentStatus, RetentionStatus } from '@prisma/client';

import { ANTI_BULLYING_CATEGORIES } from '@school/shared/regulatory';

import { PrismaService } from '../prisma/prisma.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

const OPEN_STATUSES: IncidentStatus[] = [
  IncidentStatus.draft,
  IncidentStatus.active,
  IncidentStatus.investigating,
  IncidentStatus.under_review,
  IncidentStatus.awaiting_approval,
  IncidentStatus.awaiting_parent_meeting,
  IncidentStatus.escalated,
];

const EXCLUDED_STATUSES: IncidentStatus[] = [
  IncidentStatus.withdrawn,
  IncidentStatus.converted_to_safeguarding,
  IncidentStatus.superseded,
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AntiBullyingSummary {
  academic_year: string;
  total_incidents: number;
  open: number;
  resolved: number;
  resolved_this_term: number;
  days_since_last_incident: number | null;
  by_category: Array<{
    category: string;
    count: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  by_month: Array<{
    month: string;
    count: number;
  }>;
  recent_incidents: Array<{
    id: string;
    incident_number: string;
    student_name: string;
    category_name: string;
    occurred_at: string;
    status: IncidentStatus;
  }>;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class RegulatoryAntiBullyingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(tenantId: string): Promise<AntiBullyingSummary> {
    const now = new Date();
    const academicYear = this.getCurrentAcademicYear(now);
    const { startDate: yearStart, endDate: yearEnd } = this.getAcademicYearBounds(now);
    const termStart = this.getCurrentTermStart(now);

    const bullyingCategories = await this.prisma.behaviourCategory.findMany({
      where: {
        tenant_id: tenantId,
        name: { contains: 'bully', mode: 'insensitive' },
      },
      select: { id: true, name: true },
    });

    if (bullyingCategories.length === 0) {
      return {
        academic_year: academicYear,
        total_incidents: 0,
        open: 0,
        resolved: 0,
        resolved_this_term: 0,
        days_since_last_incident: null,
        by_category: ANTI_BULLYING_CATEGORIES.map((category) => ({
          category,
          count: 0,
          trend: 'stable',
        })),
        by_month: this.emptyMonthSeries(now),
        recent_incidents: [],
      };
    }

    const categoryIds = bullyingCategories.map((c) => c.id);

    const baseWhere = {
      tenant_id: tenantId,
      retention_status: RetentionStatus.active,
      category_id: { in: categoryIds },
      occurred_at: { gte: yearStart, lt: yearEnd },
      status: { notIn: EXCLUDED_STATUSES },
    } as const;

    const [incidents, lastIncident, recentIncidents] = await Promise.all([
      this.prisma.behaviourIncident.findMany({
        where: baseWhere,
        select: {
          id: true,
          status: true,
          occurred_at: true,
          updated_at: true,
          category_id: true,
        },
      }),
      this.prisma.behaviourIncident.findFirst({
        where: {
          tenant_id: tenantId,
          retention_status: RetentionStatus.active,
          category_id: { in: categoryIds },
          status: { notIn: EXCLUDED_STATUSES },
        },
        orderBy: { occurred_at: 'desc' },
        select: { occurred_at: true },
      }),
      this.prisma.behaviourIncident.findMany({
        where: {
          tenant_id: tenantId,
          retention_status: RetentionStatus.active,
          category_id: { in: categoryIds },
          status: { notIn: EXCLUDED_STATUSES },
        },
        orderBy: { occurred_at: 'desc' },
        take: 5,
        select: {
          id: true,
          incident_number: true,
          occurred_at: true,
          status: true,
          category: { select: { name: true } },
          participants: {
            where: { role: 'subject' },
            take: 1,
            select: {
              student: { select: { first_name: true, last_name: true } },
            },
          },
        },
      }),
    ]);

    const open = incidents.filter((i) => OPEN_STATUSES.includes(i.status)).length;
    const resolved = incidents.filter((i) => i.status === IncidentStatus.resolved).length;
    const resolvedThisTerm = incidents.filter(
      (i) => i.status === IncidentStatus.resolved && i.updated_at >= termStart,
    ).length;

    const daysSinceLastIncident = lastIncident?.occurred_at
      ? Math.floor((now.getTime() - lastIncident.occurred_at.getTime()) / MS_PER_DAY)
      : null;

    const categoryNameById = new Map(bullyingCategories.map((c) => [c.id, c.name]));
    const byCategory = this.buildCategoryBreakdown(incidents, categoryNameById, now);
    const byMonth = this.buildMonthSeries(incidents, now);

    return {
      academic_year: academicYear,
      total_incidents: incidents.length,
      open,
      resolved,
      resolved_this_term: resolvedThisTerm,
      days_since_last_incident: daysSinceLastIncident,
      by_category: byCategory,
      by_month: byMonth,
      recent_incidents: recentIncidents.map((row) => {
        const participant = row.participants[0];
        const student = participant?.student;
        const studentName = student
          ? `${student.first_name} ${student.last_name}`.trim()
          : '—';
        return {
          id: row.id,
          incident_number: row.incident_number,
          student_name: studentName,
          category_name: row.category.name,
          occurred_at: row.occurred_at.toISOString(),
          status: row.status,
        };
      }),
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private getCurrentAcademicYear(now: Date): string {
    const year = now.getFullYear();
    const month = now.getMonth();
    if (month >= 8) {
      return `${year}-${year + 1}`;
    }
    return `${year - 1}-${year}`;
  }

  private getAcademicYearBounds(now: Date): { startDate: Date; endDate: Date } {
    const year = now.getFullYear();
    const month = now.getMonth();
    if (month >= 8) {
      return {
        startDate: new Date(year, 8, 1),
        endDate: new Date(year + 1, 8, 1),
      };
    }
    return {
      startDate: new Date(year - 1, 8, 1),
      endDate: new Date(year, 8, 1),
    };
  }

  /**
   * Rough term boundaries: Sep-Dec (term 1), Jan-Mar (term 2), Apr-Aug (term 3).
   * We don't read AcademicPeriod rows because the feature should work before
   * any period data is entered for a tenant.
   */
  private getCurrentTermStart(now: Date): Date {
    const year = now.getFullYear();
    const month = now.getMonth();
    if (month >= 8) return new Date(year, 8, 1);
    if (month >= 3) return new Date(year, 3, 1);
    return new Date(year, 0, 1);
  }

  private buildCategoryBreakdown(
    incidents: Array<{ category_id: string; occurred_at: Date }>,
    categoryNameById: Map<string, string>,
    now: Date,
  ): AntiBullyingSummary['by_category'] {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * MS_PER_DAY);

    const rawCounts = new Map<string, { total: number; recent: number; prior: number }>();

    for (const incident of incidents) {
      const categoryName = categoryNameById.get(incident.category_id);
      if (!categoryName) continue;
      const key = this.matchToAbCategory(categoryName);
      const entry = rawCounts.get(key) ?? { total: 0, recent: 0, prior: 0 };
      entry.total += 1;
      if (incident.occurred_at >= thirtyDaysAgo) entry.recent += 1;
      else if (incident.occurred_at >= sixtyDaysAgo) entry.prior += 1;
      rawCounts.set(key, entry);
    }

    return ANTI_BULLYING_CATEGORIES.map((category) => {
      const entry = rawCounts.get(category) ?? { total: 0, recent: 0, prior: 0 };
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (entry.recent > entry.prior) trend = 'up';
      else if (entry.recent < entry.prior) trend = 'down';
      return { category, count: entry.total, trend };
    });
  }

  private buildMonthSeries(
    incidents: Array<{ occurred_at: Date }>,
    now: Date,
  ): AntiBullyingSummary['by_month'] {
    const months = this.emptyMonthSeries(now);
    const lookup = new Map(months.map((m, i) => [m.month, i]));
    for (const incident of incidents) {
      const key = this.monthKey(incident.occurred_at);
      const idx = lookup.get(key);
      if (idx === undefined) continue;
      const bucket = months[idx];
      if (bucket) bucket.count += 1;
    }
    return months;
  }

  private emptyMonthSeries(now: Date): AntiBullyingSummary['by_month'] {
    const series: AntiBullyingSummary['by_month'] = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      series.push({ month: this.monthKey(d), count: 0 });
    }
    return series;
  }

  private monthKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  private matchToAbCategory(categoryName: string): (typeof ANTI_BULLYING_CATEGORIES)[number] {
    const lower = categoryName.toLowerCase();
    if (lower.includes('cyber')) return 'cyberbullying';
    if (lower.includes('racist') || lower.includes('racial')) return 'racist';
    if (lower.includes('sexist')) return 'sexist';
    if (lower.includes('sexual')) return 'sexual_harassment';
    if (lower.includes('homophob')) return 'homophobic';
    if (lower.includes('transphob')) return 'transphobic';
    if (lower.includes('disab')) return 'disability_based';
    if (lower.includes('relig')) return 'religious_based';
    if (lower.includes('identity')) return 'identity_based';
    if (lower.includes('physical')) return 'physical';
    if (lower.includes('verbal')) return 'verbal';
    if (lower.includes('relational') || lower.includes('social')) return 'relational';
    return 'other';
  }
}
