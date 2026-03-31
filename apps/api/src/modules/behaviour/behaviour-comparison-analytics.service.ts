import { Injectable } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import type {
  BehaviourAnalyticsQuery,
  ClassComparisonResult,
  ComparisonResult,
  RatioResult,
} from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { buildIncidentWhere, makeDataQuality } from './behaviour-analytics-helpers';
import { BehaviourScopeService } from './behaviour-scope.service';

@Injectable()
export class BehaviourComparisonAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: BehaviourScopeService,
  ) {}

  // ─── Positive/Negative Ratio ───────────────────────────────────────────────

  async getRatio(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<RatioResult> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const where = buildIncidentWhere(tenantId, query, scope, userId, this.scopeService);

    // Group by year_group via participants
    const incidents = await this.prisma.behaviourIncident.findMany({
      where: {
        ...where,
        polarity: { in: ['positive', 'negative'] as $Enums.BehaviourPolarity[] },
      },
      select: {
        polarity: true,
        participants: {
          where: { participant_type: 'student' as $Enums.ParticipantType },
          select: {
            student: {
              select: { year_group_id: true, year_group: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    const groupMap = new Map<string, { name: string; positive: number; negative: number }>();

    for (const inc of incidents) {
      for (const p of inc.participants) {
        const yg = p.student?.year_group;
        if (!yg) continue;
        const existing = groupMap.get(yg.id) ?? { name: yg.name, positive: 0, negative: 0 };
        if (inc.polarity === 'positive') existing.positive++;
        else existing.negative++;
        groupMap.set(yg.id, existing);
      }
    }

    const entries = Array.from(groupMap.entries()).map(([id, data]) => ({
      group_id: id,
      group_name: data.name,
      positive: data.positive,
      negative: data.negative,
      ratio:
        data.positive + data.negative > 0 ? data.positive / (data.positive + data.negative) : null,
    }));

    return { entries, data_quality: makeDataQuality(false) };
  }

  // ─── Year Group Comparisons ────────────────────────────────────────────────

  async getComparisons(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<ComparisonResult> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const where = buildIncidentWhere(tenantId, query, scope, userId, this.scopeService);

    const incidents = await this.prisma.behaviourIncident.findMany({
      where,
      select: {
        polarity: true,
        participants: {
          where: { participant_type: 'student' as $Enums.ParticipantType },
          select: {
            student: {
              select: { year_group_id: true, year_group: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    const yearGroups = await this.prisma.yearGroup.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, name: true },
    });

    const studentCounts = await this.prisma.student.groupBy({
      by: ['year_group_id'],
      where: { tenant_id: tenantId, status: 'enrolled' as $Enums.StudentStatus },
      _count: true,
    });
    const studentCountMap = new Map(
      studentCounts
        .filter((s) => s.year_group_id !== null)
        .map((s) => [s.year_group_id as string, s._count]),
    );

    const ygMap = new Map<string, { positive: number; negative: number }>();
    for (const inc of incidents) {
      for (const p of inc.participants) {
        const ygId = p.student?.year_group_id;
        if (!ygId) continue;
        const existing = ygMap.get(ygId) ?? { positive: 0, negative: 0 };
        if (inc.polarity === 'positive') existing.positive++;
        else if (inc.polarity === 'negative') existing.negative++;
        ygMap.set(ygId, existing);
      }
    }

    const entries = yearGroups.map((yg) => {
      const data = ygMap.get(yg.id) ?? { positive: 0, negative: 0 };
      const studentCount = studentCountMap.get(yg.id) ?? 0;
      const total = data.positive + data.negative;
      return {
        year_group_id: yg.id,
        year_group_name: yg.name,
        incident_rate: studentCount > 0 ? Math.round((total / studentCount) * 10000) / 100 : null,
        positive_rate:
          studentCount > 0 ? Math.round((data.positive / studentCount) * 10000) / 100 : null,
        negative_rate:
          studentCount > 0 ? Math.round((data.negative / studentCount) * 10000) / 100 : null,
        student_count: studentCount,
      };
    });

    return { entries, data_quality: makeDataQuality(false) };
  }

  // ─── Class Comparisons ─────────────────────────────────────────────────────

  async getClassComparisons(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: BehaviourAnalyticsQuery,
  ): Promise<ClassComparisonResult> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const where = buildIncidentWhere(tenantId, query, scope, userId, this.scopeService);

    // Get incidents with participant student class enrolment info
    const incidents = await this.prisma.behaviourIncident.findMany({
      where,
      select: {
        polarity: true,
        participants: {
          where: { participant_type: 'student' as $Enums.ParticipantType },
          select: {
            student: {
              select: {
                class_enrolments: {
                  where: {
                    tenant_id: tenantId,
                    status: 'active' as $Enums.ClassEnrolmentStatus,
                  },
                  select: {
                    class_id: true,
                    class_entity: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Build class incident map
    const classMap = new Map<
      string,
      { name: string; positive: number; negative: number; total: number }
    >();

    for (const inc of incidents) {
      for (const p of inc.participants) {
        if (!p.student?.class_enrolments) continue;
        for (const enrolment of p.student.class_enrolments) {
          const classId = enrolment.class_id;
          const existing = classMap.get(classId) ?? {
            name: enrolment.class_entity.name,
            positive: 0,
            negative: 0,
            total: 0,
          };
          existing.total++;
          if (inc.polarity === 'positive') existing.positive++;
          else if (inc.polarity === 'negative') existing.negative++;
          classMap.set(classId, existing);
        }
      }
    }

    // Get student count per class
    const classIds = [...classMap.keys()];
    const studentCounts = await this.prisma.classEnrolment.groupBy({
      by: ['class_id'],
      where: {
        tenant_id: tenantId,
        class_id: { in: classIds },
        status: 'active' as $Enums.ClassEnrolmentStatus,
      },
      _count: true,
    });
    const studentCountMap = new Map(studentCounts.map((s) => [s.class_id, s._count]));

    const entries = Array.from(classMap.entries()).map(([classId, data]) => {
      const studentCount = studentCountMap.get(classId) ?? 0;
      return {
        class_id: classId,
        class_name: data.name,
        student_count: studentCount,
        incident_count: data.total,
        positive_count: data.positive,
        negative_count: data.negative,
        incident_rate_per_student:
          studentCount > 0 ? Math.round((data.total / studentCount) * 100) / 100 : null,
        positive_rate_per_student:
          studentCount > 0 ? Math.round((data.positive / studentCount) * 100) / 100 : null,
        negative_rate_per_student:
          studentCount > 0 ? Math.round((data.negative / studentCount) * 100) / 100 : null,
      };
    });

    // Sort by incident rate descending
    entries.sort((a, b) => (b.incident_rate_per_student ?? 0) - (a.incident_rate_per_student ?? 0));

    return { entries, data_quality: makeDataQuality(false) };
  }
}
