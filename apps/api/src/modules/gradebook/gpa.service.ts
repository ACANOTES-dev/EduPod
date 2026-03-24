import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

interface GradingScaleRange {
  min: number;
  max: number;
  label: string;
  gpa_value?: number;
}

interface GradingScaleGrade {
  label: string;
  numeric_value?: number;
  gpa_value?: number;
}

interface GradingScaleConfig {
  type: 'numeric' | 'letter' | 'custom';
  ranges?: GradingScaleRange[];
  grades?: GradingScaleGrade[];
}

@Injectable()
export class GpaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute and persist GPA for a student in a specific period.
   * Uses credit_hours from ClassSubjectGradeConfig if available;
   * falls back to equal weighting.
   */
  async computeGpa(
    tenantId: string,
    studentId: string,
    periodId: string,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { id: true, first_name: true, last_name: true },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${studentId}" not found`,
      });
    }

    const period = await this.prisma.academicPeriod.findFirst({
      where: { id: periodId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!period) {
      throw new NotFoundException({
        code: 'PERIOD_NOT_FOUND',
        message: `Academic period with id "${periodId}" not found`,
      });
    }

    // Load period grade snapshots for this student/period
    const snapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        academic_period_id: periodId,
      },
      include: {
        class_entity: { select: { id: true } },
        subject: { select: { id: true } },
      },
    });

    if (snapshots.length === 0) {
      return { gpa_value: null, message: 'No period grades available to compute GPA' };
    }

    // Load tenant GPA precision setting
    const tenantSetting = await this.prisma.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });
    const settings = (tenantSetting?.settings ?? {}) as Record<string, unknown>;
    const gradebookSettings = (settings['gradebook'] ?? {}) as Record<string, unknown>;
    const gpaPrecision = (gradebookSettings['gpaPrecision'] as number) ?? 2;

    // For each snapshot, look up credit_hours and grading scale gpa_value
    let weightedGpaSum = 0;
    let totalCreditHours = 0;
    let useEqualWeighting = false;

    const gradePoints: Array<{ gpa_points: number; credit_hours: number }> = [];

    for (const snapshot of snapshots) {
      // Look up class-subject grade config for credit_hours and grading scale
      const gradeConfig = await this.prisma.classSubjectGradeConfig.findFirst({
        where: {
          tenant_id: tenantId,
          class_id: snapshot.class_id,
          subject_id: snapshot.subject_id,
        },
        include: { grading_scale: true },
      });

      const creditHours = gradeConfig?.credit_hours != null
        ? Number(gradeConfig.credit_hours)
        : null;

      if (creditHours === null) {
        useEqualWeighting = true;
      }

      // Determine grade point value from grading scale
      const computedValue = Number(snapshot.computed_value);
      let gpaPoints = 0;

      if (gradeConfig?.grading_scale) {
        const scaleConfig = gradeConfig.grading_scale.config_json as unknown as GradingScaleConfig;
        gpaPoints = this.resolveGpaPoints(computedValue, scaleConfig);
      } else {
        // Fallback: treat computed_value (%) as a 4.0-scale proxy
        gpaPoints = (computedValue / 100) * 4.0;
      }

      gradePoints.push({
        gpa_points: gpaPoints,
        credit_hours: creditHours ?? 1, // 1 unit for equal weighting
      });
    }

    // Compute weighted or equal GPA
    if (useEqualWeighting) {
      // Simple average of grade points (equal weighting)
      const sum = gradePoints.reduce((acc, gp) => acc + gp.gpa_points, 0);
      weightedGpaSum = sum;
      totalCreditHours = gradePoints.length;
    } else {
      for (const gp of gradePoints) {
        weightedGpaSum += gp.gpa_points * gp.credit_hours;
        totalCreditHours += gp.credit_hours;
      }
    }

    if (totalCreditHours === 0) {
      return { gpa_value: null, message: 'No credit hours configured' };
    }

    const rawGpa = weightedGpaSum / totalCreditHours;
    const factor = Math.pow(10, gpaPrecision);
    const gpaValue = Math.round(rawGpa * factor) / factor;

    // Persist/upsert gpa_snapshot
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const now = new Date();

    const snapshot = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.gpaSnapshot.upsert({
        where: {
          idx_gpa_snapshots_unique: {
            tenant_id: tenantId,
            student_id: studentId,
            academic_period_id: periodId,
          },
        },
        update: {
          gpa_value: gpaValue,
          credit_hours_total: totalCreditHours,
          snapshot_at: now,
        },
        create: {
          tenant_id: tenantId,
          student_id: studentId,
          academic_period_id: periodId,
          gpa_value: gpaValue,
          credit_hours_total: totalCreditHours,
          snapshot_at: now,
        },
      });
    });

    return {
      gpa_value: gpaValue,
      credit_hours_total: totalCreditHours,
      subjects_included: snapshots.length,
      snapshot,
    };
  }

  /**
   * Get cumulative GPA for a student across all periods.
   */
  async getCumulativeGpa(tenantId: string, studentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { id: true, first_name: true, last_name: true },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${studentId}" not found`,
      });
    }

    const snapshots = await this.prisma.gpaSnapshot.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      include: {
        academic_period: { select: { id: true, name: true, start_date: true } },
      },
      orderBy: { academic_period: { start_date: 'desc' } },
    });

    if (snapshots.length === 0) {
      return { student, cumulative_gpa: null, periods: [] };
    }

    // Weighted cumulative GPA by credit_hours across all periods
    let totalWeightedGpa = 0;
    let totalCreditHours = 0;

    for (const snap of snapshots) {
      const creditHours = Number(snap.credit_hours_total);
      totalWeightedGpa += Number(snap.gpa_value) * creditHours;
      totalCreditHours += creditHours;
    }

    const cumulativeGpa = totalCreditHours > 0
      ? Math.round((totalWeightedGpa / totalCreditHours) * 1000) / 1000
      : null;

    return {
      student,
      cumulative_gpa: cumulativeGpa,
      periods: snapshots.map((s) => ({
        period: s.academic_period,
        gpa_value: Number(s.gpa_value),
        credit_hours_total: Number(s.credit_hours_total),
        snapshot_at: s.snapshot_at,
      })),
    };
  }

  /**
   * Get GPA snapshots for a student in a specific period.
   */
  async getGpaSnapshot(
    tenantId: string,
    studentId: string,
    periodId: string,
  ) {
    const snapshot = await this.prisma.gpaSnapshot.findFirst({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        academic_period_id: periodId,
      },
      include: {
        academic_period: { select: { id: true, name: true } },
      },
    });

    if (!snapshot) {
      return { gpa_value: null, message: 'No GPA computed for this period' };
    }

    return {
      gpa_value: Number(snapshot.gpa_value),
      credit_hours_total: Number(snapshot.credit_hours_total),
      snapshot_at: snapshot.snapshot_at,
      period: snapshot.academic_period,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Resolve the GPA points for a given computed percentage using the grading scale.
   */
  private resolveGpaPoints(
    computedPercentage: number,
    config: GradingScaleConfig,
  ): number {
    if (config.type === 'numeric' && config.ranges) {
      for (const range of config.ranges) {
        if (computedPercentage >= range.min && computedPercentage <= range.max) {
          return range.gpa_value ?? (computedPercentage / 100) * 4.0;
        }
      }
    }

    if ((config.type === 'letter' || config.type === 'custom') && config.grades) {
      const gradesWithValues = config.grades
        .filter((g) => g.numeric_value !== undefined)
        .sort((a, b) => (b.numeric_value ?? 0) - (a.numeric_value ?? 0));

      for (const grade of gradesWithValues) {
        if (computedPercentage >= (grade.numeric_value ?? 0)) {
          return grade.gpa_value ?? (computedPercentage / 100) * 4.0;
        }
      }
    }

    // Fallback: proportional to 4.0 scale
    return (computedPercentage / 100) * 4.0;
  }
}
