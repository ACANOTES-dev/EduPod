import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { GpaService } from './gpa.service';
import { StandardsService } from './standards.service';

interface CategoryWeight {
  category_id: string;
  weight: number;
}

interface GradingScaleRange {
  min: number;
  max: number;
  label: string;
}

interface GradingScaleGrade {
  label: string;
  numeric_value?: number;
}

interface GradingScaleConfig {
  type: 'numeric' | 'letter' | 'custom';
  ranges?: GradingScaleRange[];
  grades?: GradingScaleGrade[];
}

export interface ComputationWarning {
  code: string;
  message: string;
}

@Injectable()
export class PeriodGradeComputationService {
  private readonly logger = new Logger(PeriodGradeComputationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gpaService: GpaService,
    private readonly standardsService: StandardsService,
  ) {}

  /**
   * Compute period grades for a class/subject/period combination.
   * Full algorithm: load config, assessments, grades, compute weighted averages,
   * apply grading scale, upsert snapshots.
   * Optionally triggers GPA and competency snapshot computation afterward.
   */
  async compute(tenantId: string, classId: string, subjectId: string, periodId: string) {
    const warnings: ComputationWarning[] = [];

    // 1. Look up class to get year_group_id
    const classEntity = await this.prisma.class.findFirst({
      where: { id: classId, tenant_id: tenantId },
      select: { year_group_id: true },
    });

    // 2. Try year-group weights first, fall back to class-subject config
    let categoryWeightsRaw: CategoryWeight[] = [];
    let scaleConfig: GradingScaleConfig | null = null;

    if (classEntity?.year_group_id) {
      const ygWeight = await this.prisma.yearGroupGradeWeight.findFirst({
        where: {
          tenant_id: tenantId,
          year_group_id: classEntity.year_group_id,
          academic_period_id: periodId,
        },
      });
      if (ygWeight) {
        const parsed = ygWeight.category_weights_json as unknown as { weights: CategoryWeight[] };
        categoryWeightsRaw = parsed?.weights ?? [];
      }
    }

    // Load class-subject config for grading scale (and as weight fallback)
    const config = await this.prisma.classSubjectGradeConfig.findFirst({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        subject_id: subjectId,
      },
      include: {
        grading_scale: true,
      },
    });

    if (config) {
      scaleConfig = config.grading_scale.config_json as unknown as GradingScaleConfig;
      // Use class-subject weights as fallback if no year-group weights found
      if (categoryWeightsRaw.length === 0) {
        const fallbackConfig = config.category_weight_json as unknown as {
          weights: CategoryWeight[];
        };
        categoryWeightsRaw = fallbackConfig?.weights ?? [];
      }
    }

    if (categoryWeightsRaw.length === 0) {
      throw new NotFoundException({
        code: 'GRADE_CONFIG_NOT_FOUND',
        message: `No grading weight configuration found for this class/year group and period. Configure weights in Settings > Grading Weights.`,
      });
    }

    // 3. Load tenant settings for formative weight cap
    const tenantSetting = await this.prisma.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });

    const settings = (tenantSetting?.settings ?? {}) as Record<string, unknown>;
    const gradebookSettings = (settings['gradebook'] ?? {}) as Record<string, unknown>;
    const missingGradePolicy =
      (gradebookSettings['defaultMissingGradePolicy'] as string) ?? 'exclude';
    const formativeWeightCap = gradebookSettings['formativeWeightCap'] as number | null | undefined;
    const formativeIncluded = gradebookSettings['formativeIncludedInPeriodGrade'] !== false;

    // 4. Load all assessments for (class, subject, period) where status NOT 'draft'
    const assessments = await this.prisma.assessment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        subject_id: subjectId,
        academic_period_id: periodId,
        status: { not: 'draft' },
      },
      include: {
        grades: true,
        category: {
          select: { id: true, name: true, assessment_type: true },
        },
      },
    });

    // 5. If no assessments, error
    if (assessments.length === 0) {
      throw new BadRequestException({
        code: 'NO_ASSESSMENTS',
        message: 'No published assessments found for this class, subject, and period',
      });
    }

    // 6. Load enrolled students
    const enrolments = await this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        status: 'active',
      },
      select: { student_id: true },
    });

    const studentIds = enrolments.map((e) => e.student_id);

    if (studentIds.length === 0) {
      throw new BadRequestException({
        code: 'NO_STUDENTS',
        message: 'No actively enrolled students found in this class',
      });
    }

    // 7. Apply formative inclusion setting
    // If formativeIncluded = false, exclude formative assessments entirely
    const includedAssessments = formativeIncluded
      ? assessments
      : assessments.filter((a) => a.category.assessment_type !== 'formative');

    if (includedAssessments.length === 0) {
      throw new BadRequestException({
        code: 'NO_ASSESSMENTS',
        message:
          'No summative assessments found and formative grades are excluded from period grade',
      });
    }

    // 8. Resolve and normalize category weights with formative cap
    const categoryWeights = this.resolveWeightsWithFormativeCap(
      categoryWeightsRaw,
      includedAssessments.map((a) => ({
        category_id: a.category_id,
        assessment_type: a.category.assessment_type,
      })),
      formativeWeightCap ?? null,
      warnings,
    );

    // Build a map of category_id -> weight
    const categoryWeightMap = new Map(categoryWeights.map((w) => [w.category_id, w.weight]));

    // Group assessments by category
    const assessmentsByCategory = new Map<string, typeof includedAssessments>();
    for (const assessment of includedAssessments) {
      const catId = assessment.category_id;
      const existing = assessmentsByCategory.get(catId) ?? [];
      existing.push(assessment);
      assessmentsByCategory.set(catId, existing);
    }

    // 9. For each student, compute weighted average
    const snapshotData: Array<{
      student_id: string;
      computed_value: number;
      display_value: string;
    }> = [];

    for (const studentId of studentIds) {
      let totalWeightedScore = 0;
      let totalUsedWeight = 0;

      for (const [categoryId, catAssessments] of assessmentsByCategory) {
        const weight = categoryWeightMap.get(categoryId);
        if (weight === undefined) continue;

        let categoryNumerator = 0;
        let categoryDenominator = 0;
        let hasCategoryData = false;

        for (const assessment of catAssessments) {
          const grade = assessment.grades.find((g) => g.student_id === studentId);
          const maxScore = Number(assessment.max_score);

          if (missingGradePolicy === 'exclude') {
            // Only include graded assessments (raw_score IS NOT NULL)
            if (grade?.raw_score !== null && grade?.raw_score !== undefined) {
              categoryNumerator += Number(grade.raw_score);
              categoryDenominator += maxScore;
              hasCategoryData = true;
            }
          } else {
            // 'zero' policy: treat missing as 0
            const score =
              grade?.raw_score !== null && grade?.raw_score !== undefined
                ? Number(grade.raw_score)
                : 0;
            categoryNumerator += score;
            categoryDenominator += maxScore;
            hasCategoryData = true;
          }
        }

        if (hasCategoryData && categoryDenominator > 0) {
          const categoryScore = (categoryNumerator / categoryDenominator) * 100;
          totalWeightedScore += categoryScore * weight;
          totalUsedWeight += weight;
        }
      }

      // Compute weighted average
      const computedValue = totalUsedWeight > 0 ? totalWeightedScore / totalUsedWeight : 0;

      // Apply grading scale for display_value (if available)
      const displayValue = scaleConfig
        ? this.applyGradingScale(computedValue, scaleConfig)
        : `${Math.round(computedValue * 100) / 100}%`;

      snapshotData.push({
        student_id: studentId,
        computed_value: Math.round(computedValue * 10000) / 10000,
        display_value: displayValue,
      });
    }

    // 10. Upsert into period_grade_snapshots
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const now = new Date();

    const snapshots = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const results = [];

      for (const data of snapshotData) {
        const result = await db.periodGradeSnapshot.upsert({
          where: {
            idx_period_snapshots_unique: {
              tenant_id: tenantId,
              student_id: data.student_id,
              class_id: classId,
              subject_id: subjectId,
              academic_period_id: periodId,
            },
          },
          update: {
            computed_value: data.computed_value,
            display_value: data.display_value,
            snapshot_at: now,
            // DO NOT update override fields
          },
          create: {
            tenant_id: tenantId,
            student_id: data.student_id,
            class_id: classId,
            subject_id: subjectId,
            academic_period_id: periodId,
            computed_value: data.computed_value,
            display_value: data.display_value,
            snapshot_at: now,
          },
        });

        results.push(result);
      }

      return results;
    })) as { id: string }[];

    // 11. Trigger GPA computation for all students (best-effort, non-blocking)
    void this.triggerGpaComputation(tenantId, studentIds, periodId);

    // 12. Trigger competency snapshot computation for all students (best-effort)
    void this.triggerCompetencyComputation(tenantId, studentIds, periodId);

    return {
      data: snapshots,
      warnings,
      meta: {
        students_computed: snapshots.length,
        assessments_included: includedAssessments.length,
        missing_grade_policy: missingGradePolicy,
        formative_cap_applied: formativeWeightCap != null,
      },
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Resolve category weights, applying the formative cap if configured.
   * Formative categories' combined weight is capped at formativeWeightCap%.
   * Summative weights are scaled up proportionally to compensate.
   */
  private resolveWeightsWithFormativeCap(
    rawWeights: CategoryWeight[],
    categoryTypes: Array<{ category_id: string; assessment_type: string }>,
    formativeWeightCap: number | null,
    warnings: ComputationWarning[],
  ): CategoryWeight[] {
    const weightSum = rawWeights.reduce((sum, w) => sum + w.weight, 0);

    if (weightSum === 0) {
      throw new BadRequestException({
        code: 'ZERO_WEIGHT_SUM',
        message: 'Category weights must not all be zero',
      });
    }

    // Normalize weights to sum to 100
    let normalizedWeights: CategoryWeight[];
    if (Math.abs(weightSum - 100) > 0.01) {
      warnings.push({
        code: 'WEIGHTS_NORMALIZED',
        message: `Category weights summed to ${weightSum}, not 100. Weights have been normalized.`,
      });
      normalizedWeights = rawWeights.map((w) => ({
        category_id: w.category_id,
        weight: (w.weight / weightSum) * 100,
      }));
    } else {
      normalizedWeights = rawWeights.map((w) => ({ ...w }));
    }

    // Apply formative cap if configured
    if (formativeWeightCap != null && formativeWeightCap >= 0) {
      const typeMap = new Map(categoryTypes.map((ct) => [ct.category_id, ct.assessment_type]));

      const formativeWeights = normalizedWeights.filter(
        (w) => typeMap.get(w.category_id) === 'formative',
      );
      const summativeWeights = normalizedWeights.filter(
        (w) => typeMap.get(w.category_id) !== 'formative',
      );

      const currentFormativeTotal = formativeWeights.reduce((sum, w) => sum + w.weight, 0);

      if (currentFormativeTotal > formativeWeightCap) {
        warnings.push({
          code: 'FORMATIVE_CAP_APPLIED',
          message: `Formative weight (${currentFormativeTotal.toFixed(1)}%) exceeded cap (${formativeWeightCap}%). Weights adjusted.`,
        });

        // Scale formative weights down to cap
        const formativeScaleFactor = formativeWeightCap / currentFormativeTotal;
        const scaledFormative = formativeWeights.map((w) => ({
          ...w,
          weight: w.weight * formativeScaleFactor,
        }));

        // Scale summative weights up to fill the remaining (100 - cap)%
        const remainingSummativeWeight = 100 - formativeWeightCap;
        const currentSummativeTotal = summativeWeights.reduce((sum, w) => sum + w.weight, 0);

        const summativeScaleFactor =
          currentSummativeTotal > 0 ? remainingSummativeWeight / currentSummativeTotal : 1;

        const scaledSummative = summativeWeights.map((w) => ({
          ...w,
          weight: w.weight * summativeScaleFactor,
        }));

        return [...scaledFormative, ...scaledSummative];
      }
    }

    return normalizedWeights;
  }

  /**
   * Apply grading scale to a computed percentage to get display value.
   */
  private applyGradingScale(percentage: number, config: GradingScaleConfig): string {
    if (config.type === 'numeric' && config.ranges) {
      // Find the range that contains this percentage
      for (const range of config.ranges) {
        if (percentage >= range.min && percentage <= range.max) {
          return range.label;
        }
      }
      // If no range matches, return the percentage as a string
      return `${Math.round(percentage * 100) / 100}%`;
    }

    if ((config.type === 'letter' || config.type === 'custom') && config.grades) {
      // For letter/custom grades with numeric_value:
      // Find the grade whose numeric_value is closest to the percentage (without going above)
      const gradesWithValues = config.grades
        .filter((g) => g.numeric_value !== undefined)
        .sort((a, b) => (b.numeric_value ?? 0) - (a.numeric_value ?? 0));

      for (const grade of gradesWithValues) {
        if (percentage >= (grade.numeric_value ?? 0)) {
          return grade.label;
        }
      }

      // Return the lowest grade if nothing else matches
      if (gradesWithValues.length > 0) {
        return gradesWithValues[gradesWithValues.length - 1]!.label;
      }

      return `${Math.round(percentage * 100) / 100}%`;
    }

    return `${Math.round(percentage * 100) / 100}%`;
  }

  /**
   * Trigger GPA computation for a list of students — best-effort, non-blocking.
   * Errors are logged but do not fail the period grade computation.
   */
  private async triggerGpaComputation(
    tenantId: string,
    studentIds: string[],
    periodId: string,
  ): Promise<void> {
    for (const studentId of studentIds) {
      try {
        await this.gpaService.computeGpa(tenantId, studentId, periodId);
      } catch (err) {
        this.logger.warn(
          `GPA computation failed for student ${studentId} in period ${periodId} — period grade computation continues`,
          err,
        );
      }
    }
  }

  /**
   * Trigger competency snapshot computation for a list of students — best-effort.
   */
  private async triggerCompetencyComputation(
    tenantId: string,
    studentIds: string[],
    periodId: string,
  ): Promise<void> {
    for (const studentId of studentIds) {
      try {
        await this.standardsService.computeCompetencySnapshots(tenantId, studentId, periodId);
      } catch (err) {
        this.logger.warn(
          `Competency snapshot computation failed for student ${studentId} in period ${periodId} — period grade computation continues`,
          err,
        );
      }
    }
  }
}
