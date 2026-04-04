import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import type { AnalyticsFilters, LoadFilters } from './homework-analytics.helpers';
import { buildAssignmentWhere } from './homework-analytics.helpers';

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class HomeworkLoadAnalyticsService {
  private readonly logger = new Logger(HomeworkLoadAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Load Analysis ─────────────────────────────────────────────────────────

  /** Cross-subject load analysis per class per week. */
  async loadAnalysis(tenantId: string, filters: LoadFilters) {
    try {
      const baseWhere = buildAssignmentWhere(tenantId, filters);
      const where: Prisma.HomeworkAssignmentWhereInput = { ...baseWhere };
      if (filters.class_id) {
        where.class_id = filters.class_id;
      }

      const assignments = await this.prisma.homeworkAssignment.findMany({
        where,
        select: {
          class_id: true,
          subject_id: true,
          due_date: true,
          class_entity: { select: { name: true } },
          subject: { select: { name: true } },
        },
        orderBy: { due_date: 'asc' },
      });

      // Group by class, calculate weekly averages and subject breakdown
      const classMap = new Map<
        string,
        {
          class_id: string;
          class_name: string;
          weeks: Set<string>;
          total: number;
          subjects: Map<
            string,
            { subject_id: string | null; subject_name: string | null; count: number }
          >;
        }
      >();

      for (const a of assignments) {
        let group = classMap.get(a.class_id);
        if (!group) {
          group = {
            class_id: a.class_id,
            class_name: a.class_entity.name,
            weeks: new Set<string>(),
            total: 0,
            subjects: new Map(),
          };
          classMap.set(a.class_id, group);
        }

        group.total += 1;

        // Week key (ISO week start — Monday)
        const d = new Date(a.due_date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(d);
        weekStart.setDate(diff);
        group.weeks.add(weekStart.toISOString().slice(0, 10));

        // Subject breakdown
        const subKey = a.subject_id ?? 'none';
        let sub = group.subjects.get(subKey);
        if (!sub) {
          sub = {
            subject_id: a.subject_id,
            subject_name: a.subject?.name ?? null,
            count: 0,
          };
          group.subjects.set(subKey, sub);
        }
        sub.count += 1;
      }

      return {
        by_class: Array.from(classMap.values()).map((g) => ({
          class_id: g.class_id,
          class_name: g.class_name,
          total_assignments: g.total,
          weekly_avg: g.weeks.size > 0 ? Math.round((g.total / g.weeks.size) * 100) / 100 : 0,
          subject_breakdown: Array.from(g.subjects.values()),
        })),
      };
    } catch (err) {
      this.logger.error('[loadAnalysis] Failed to compute', err);
      throw err;
    }
  }

  // ─── Daily Load Heatmap ────────────────────────────────────────────────────

  /** Assignment counts by date and day of week for heatmap rendering. */
  async dailyLoadHeatmap(tenantId: string, filters: AnalyticsFilters) {
    try {
      const where = buildAssignmentWhere(tenantId, filters);

      const assignments = await this.prisma.homeworkAssignment.findMany({
        where,
        select: { due_date: true },
        orderBy: { due_date: 'asc' },
      });

      const dayNames = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];

      // Count per date
      const dateMap = new Map<string, number>();
      for (const a of assignments) {
        const dateStr = new Date(a.due_date).toISOString().slice(0, 10);
        dateMap.set(dateStr, (dateMap.get(dateStr) ?? 0) + 1);
      }

      return Array.from(dateMap.entries()).map(([date, count]) => ({
        date,
        day_of_week: dayNames[new Date(date).getDay()],
        count,
      }));
    } catch (err) {
      this.logger.error('[dailyLoadHeatmap] Failed to compute', err);
      throw err;
    }
  }
}
