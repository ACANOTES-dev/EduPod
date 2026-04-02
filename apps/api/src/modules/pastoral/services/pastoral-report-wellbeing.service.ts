import { Injectable, Logger } from '@nestjs/common';

import type { ReportFilterDto } from '@school/shared/pastoral';

import type { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import type { WellbeingProgrammeReportData } from './pastoral-report.service';

// ─── Helpers ───────────────────────────────────────────────────────────────

function defaultDateRange(filters: ReportFilterDto): { from: Date; to: Date } {
  const to = filters.to_date ? new Date(filters.to_date) : new Date();
  const from = filters.from_date
    ? new Date(filters.from_date)
    : new Date(to.getFullYear() - 1, to.getMonth(), to.getDate());
  return { from, to };
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0] ?? '';
}

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class PastoralReportWellbeingService {
  private readonly logger = new Logger(PastoralReportWellbeingService.name);

  constructor(private readonly eventService: PastoralEventService) {}

  // ─── Build Wellbeing Programme Report ─────────────────────────────────────

  async build(
    db: PrismaService,
    tenantId: string,
    userId: string,
    filters: ReportFilterDto,
  ): Promise<WellbeingProgrammeReportData> {
    const { from, to } = defaultDateRange(filters);

    const yearGroupFilter = filters.year_group_id
      ? { student: { year_group_id: filters.year_group_id } }
      : {};

    // 1. Total students
    const totalStudents = await db.student.count({
      where: {
        tenant_id: tenantId,
        ...(filters.year_group_id ? { year_group_id: filters.year_group_id } : {}),
      },
    });

    // 2. Students with Level 2+ interventions
    const level2PlusInterventions = await db.pastoralIntervention.findMany({
      where: {
        tenant_id: tenantId,
        continuum_level: { gte: 2 },
        created_at: { gte: from, lte: to },
        ...yearGroupFilter,
      },
      select: { student_id: true },
    });

    const uniqueStudentsWithInterventions = new Set(
      level2PlusInterventions.map((i) => i.student_id),
    );

    const interventionCoveragePercent =
      totalStudents > 0
        ? Math.round((uniqueStudentsWithInterventions.size / totalStudents) * 100 * 100) / 100
        : 0;

    // 3. Continuum distribution
    const allInterventions = await db.pastoralIntervention.findMany({
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
        ...yearGroupFilter,
      },
      select: {
        continuum_level: true,
        intervention_type: true,
        student_id: true,
        student: {
          select: {
            year_group_id: true,
            year_group: { select: { name: true } },
          },
        },
      },
    });

    const continuumDistribution = { level_1: 0, level_2: 0, level_3: 0 };
    const interventionTypeMap: Record<string, number> = {};

    for (const intervention of allInterventions) {
      if (intervention.continuum_level === 1) continuumDistribution.level_1++;
      else if (intervention.continuum_level === 2) continuumDistribution.level_2++;
      else if (intervention.continuum_level === 3) continuumDistribution.level_3++;

      interventionTypeMap[intervention.intervention_type] =
        (interventionTypeMap[intervention.intervention_type] ?? 0) + 1;
    }

    // 4. Referral rate
    const referralCount = await db.pastoralReferral.count({
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
        ...(filters.year_group_id ? { student: { year_group_id: filters.year_group_id } } : {}),
      },
    });

    const referralRate =
      totalStudents > 0 ? Math.round((referralCount / totalStudents) * 100 * 100) / 100 : 0;

    // 5. Concern-to-case conversion rate
    const concernTotal = await db.pastoralConcern.count({
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
        ...(filters.year_group_id ? { student: { year_group_id: filters.year_group_id } } : {}),
      },
    });
    const concernsWithCase = await db.pastoralConcern.count({
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
        case_id: { not: null },
        ...(filters.year_group_id ? { student: { year_group_id: filters.year_group_id } } : {}),
      },
    });
    const conversionRate =
      concernTotal > 0 ? Math.round((concernsWithCase / concernTotal) * 100 * 100) / 100 : 0;

    // 6. By year group
    const yearGroupInterventionMap: Record<
      string,
      { name: string; students: Set<string>; count: number }
    > = {};

    for (const intervention of allInterventions) {
      const ygId = intervention.student?.year_group_id;
      const ygName = intervention.student?.year_group?.name ?? 'Unassigned';
      const key = ygId ?? 'unassigned';

      if (!yearGroupInterventionMap[key]) {
        yearGroupInterventionMap[key] = {
          name: ygName,
          students: new Set<string>(),
          count: 0,
        };
      }
      yearGroupInterventionMap[key].students.add(intervention.student_id);
      yearGroupInterventionMap[key].count++;
    }

    const byYearGroup = Object.values(yearGroupInterventionMap).map((yg) => ({
      year_group_name: yg.name,
      intervention_count: yg.count,
      student_count: yg.students.size,
    }));

    const result: WellbeingProgrammeReportData = {
      period: { from: toISODate(from), to: toISODate(to) },
      intervention_coverage_percent: interventionCoveragePercent,
      continuum_distribution: continuumDistribution,
      referral_rate: referralRate,
      concern_to_case_conversion_rate: conversionRate,
      intervention_type_distribution: interventionTypeMap,
      by_year_group: byYearGroup,
    };

    // Fire audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'report_generated',
      entity_type: 'export',
      entity_id: 'report',
      student_id: null,
      actor_user_id: userId,
      tier: 1,
      payload: {
        report_type: 'wellbeing_programme',
        requested_by: userId,
        filters,
      },
      ip_address: null,
    });

    return result;
  }
}
