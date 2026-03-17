import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute period grades for a class/subject/period combination.
   * Full algorithm: load config, assessments, grades, compute weighted averages,
   * apply grading scale, upsert snapshots.
   */
  async compute(
    tenantId: string,
    classId: string,
    subjectId: string,
    periodId: string,
  ) {
    const warnings: ComputationWarning[] = [];

    // 1. Load class_subject_grade_config
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

    if (!config) {
      throw new NotFoundException({
        code: 'GRADE_CONFIG_NOT_FOUND',
        message: `Grade configuration for class "${classId}" and subject "${subjectId}" not found`,
      });
    }

    // 2. Parse grading scale config
    const scaleConfig = config.grading_scale.config_json as unknown as GradingScaleConfig;

    // 3. Load all assessments for (class, subject, period) where status NOT 'draft'
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
          select: { id: true, name: true },
        },
      },
    });

    // 4. If no assessments, error
    if (assessments.length === 0) {
      throw new BadRequestException({
        code: 'NO_ASSESSMENTS',
        message: 'No published assessments found for this class, subject, and period',
      });
    }

    // 5. Load enrolled students
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

    // 6. Get tenant setting for missing grade policy
    const tenantSetting = await this.prisma.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });

    const settings = (tenantSetting?.settings ?? {}) as Record<string, unknown>;
    const gradebookSettings = (settings['gradebook'] ?? {}) as Record<string, unknown>;
    const missingGradePolicy = (gradebookSettings['defaultMissingGradePolicy'] as string) ?? 'exclude';

    // 7. Parse category_weight_json
    const weightConfig = config.category_weight_json as unknown as {
      weights: CategoryWeight[];
    };
    const categoryWeights = weightConfig.weights;

    // 8. Normalize weights if sum != 100
    const weightSum = categoryWeights.reduce((sum, w) => sum + w.weight, 0);
    let normalizedWeights: Array<{ category_id: string; weight: number }>;

    if (Math.abs(weightSum - 100) > 0.01) {
      warnings.push({
        code: 'WEIGHTS_NORMALIZED',
        message: `Category weights summed to ${weightSum}, not 100. Weights have been normalized.`,
      });
      normalizedWeights = categoryWeights.map((w) => ({
        category_id: w.category_id,
        weight: (w.weight / weightSum) * 100,
      }));
    } else {
      normalizedWeights = categoryWeights.map((w) => ({
        category_id: w.category_id,
        weight: w.weight,
      }));
    }

    // Build a map of category_id -> weight
    const categoryWeightMap = new Map(
      normalizedWeights.map((w) => [w.category_id, w.weight]),
    );

    // Group assessments by category
    const assessmentsByCategory = new Map<string, typeof assessments>();
    for (const assessment of assessments) {
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
            const score = grade?.raw_score !== null && grade?.raw_score !== undefined
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
      const computedValue = totalUsedWeight > 0
        ? totalWeightedScore / totalUsedWeight
        : 0;

      // Apply grading scale for display_value
      const displayValue = this.applyGradingScale(computedValue, scaleConfig);

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

    return {
      data: snapshots,
      warnings,
      meta: {
        students_computed: snapshots.length,
        assessments_included: assessments.length,
        missing_grade_policy: missingGradePolicy,
      },
    };
  }

  /**
   * Apply grading scale to a computed percentage to get display value.
   */
  private applyGradingScale(
    percentage: number,
    config: GradingScaleConfig,
  ): string {
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
}
