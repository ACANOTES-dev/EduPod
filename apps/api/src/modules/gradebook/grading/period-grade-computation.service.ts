import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { ConfigurationReadFacade } from '../../configuration/configuration-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentReadFacade } from '../../students/student-read.facade';
import { WeightConfigService } from '../weight-config.service';

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

// ─── Cross-aggregation result types ─────────────────────────────────────────

export interface GradeCell {
  computed: number | null;
  display: string | null;
}

export interface CrossSubjectResult {
  students: Array<{
    student_id: string;
    student_name: string;
    subject_grades: Record<string, GradeCell>;
    overall: GradeCell;
  }>;
  subjects: Array<{ id: string; name: string; weight: number }>;
  warnings: ComputationWarning[];
}

export interface CrossPeriodResult {
  students: Array<{
    student_id: string;
    student_name: string;
    period_grades: Record<string, GradeCell>;
    annual: GradeCell;
  }>;
  periods: Array<{ id: string; name: string; weight: number }>;
  warnings: ComputationWarning[];
}

export interface YearOverviewResult {
  students: Array<{
    student_id: string;
    student_name: string;
    grades: Record<string, Record<string, GradeCell>>;
    period_overalls: Record<string, GradeCell>;
    year_overall: GradeCell;
  }>;
  subjects: Array<{ id: string; name: string }>;
  periods: Array<{ id: string; name: string; weight: number }>;
  warnings: ComputationWarning[];
}

@Injectable()
export class PeriodGradeComputationService {
  private readonly logger = new Logger(PeriodGradeComputationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gpaService: GpaService,
    private readonly standardsService: StandardsService,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly configurationReadFacade: ConfigurationReadFacade,
    private readonly weightConfigService: WeightConfigService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
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
    const classEntity = await this.classesReadFacade
      .findClassesGeneric(tenantId, { id: classId }, { year_group_id: true })
      .then((rows) => (rows[0] as { year_group_id: string | null } | undefined) ?? null);

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
    const tenantSettingRow = await this.configurationReadFacade.findSettings(tenantId);
    const settings = (tenantSettingRow?.settings ?? {}) as Record<string, unknown>;
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
    const enrolments = (await this.classesReadFacade.findEnrolmentsGeneric(
      tenantId,
      { class_id: classId, status: 'active' },
      { student_id: true },
    )) as Array<{ student_id: string }>;

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

  // ─── Cross-Subject Aggregation (All Subjects × Specific Period) ─────────

  /**
   * Aggregate existing period grade snapshots across all subjects for a period.
   * Uses subject_period_weights for the weighted average, normalising when
   * a subject has no computed snapshot for a given student.
   */
  async computeCrossSubject(
    tenantId: string,
    classId: string,
    periodId: string,
  ): Promise<CrossSubjectResult> {
    const warnings: ComputationWarning[] = [];

    // 1. Subjects from curriculum matrix (include grading scale for display fixup)
    const classSubjects = await this.prisma.classSubjectGradeConfig.findMany({
      where: { tenant_id: tenantId, class_id: classId },
      include: {
        subject: { select: { id: true, name: true } },
        grading_scale: { select: { config_json: true } },
      },
    });
    const subjects = classSubjects
      .map((cs) => ({ id: cs.subject_id, name: cs.subject.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const subjectIds = subjects.map((s) => s.id);

    // Build subject → grading scale lookup for display fixup
    const subjectScales = new Map<string, GradingScaleConfig>();
    for (const cs of classSubjects) {
      if (cs.grading_scale?.config_json) {
        subjectScales.set(
          cs.subject_id,
          cs.grading_scale.config_json as unknown as GradingScaleConfig,
        );
      }
    }

    // 2. Existing snapshots
    const snapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        academic_period_id: periodId,
        subject_id: { in: subjectIds },
      },
    });

    // 3. Enrolled students (with names)
    const { studentMap, studentIds } = await this.loadEnrolledStudents(tenantId, classId);

    // 4. Subject weights (equal-weight fallback)
    const subjectWeights = await this.resolveSubjectWeightsOrEqual(
      tenantId,
      classId,
      periodId,
      subjectIds,
      warnings,
    );

    // 5. Build lookup: studentId → subjectId → GradeCell
    const snapshotLookup = this.buildSnapshotLookup(snapshots, 'subject_id');

    // 6. Weighted average per student
    const studentRows = studentIds.map((sid) => {
      const grades = snapshotLookup.get(sid) ?? new Map<string, GradeCell>();
      const subjectGrades: Record<string, GradeCell> = {};
      const activeIds = new Set<string>();

      for (const s of subjects) {
        const cell = grades.get(s.id) ?? { computed: null, display: null };
        // Fixup: if display is a percentage but a grading scale exists, apply it
        if (cell.computed !== null && cell.display?.endsWith('%')) {
          const scale = subjectScales.get(s.id);
          if (scale) {
            cell.display = this.applyGradingScale(cell.computed, scale);
          }
        }
        subjectGrades[s.id] = cell;
        if (cell.computed !== null) activeIds.add(s.id);
      }

      const overall = this.weightedAverage(subjectWeights, subjectGrades, activeIds);

      return {
        student_id: sid,
        student_name: studentMap.get(sid) ?? '',
        subject_grades: subjectGrades,
        overall,
      };
    });

    return {
      students: studentRows,
      subjects: subjects.map((s) => ({
        ...s,
        weight: subjectWeights.get(s.id) ?? 0,
      })),
      warnings,
    };
  }

  // ─── Cross-Period Aggregation (Specific Subject × All Periods) ─────────

  /**
   * Aggregate existing period grade snapshots across all periods for a subject.
   * Uses period_year_weights for the weighted average.
   */
  async computeCrossPeriod(
    tenantId: string,
    classId: string,
    subjectId: string,
    academicYearId: string,
  ): Promise<CrossPeriodResult> {
    const warnings: ComputationWarning[] = [];

    // 1. Periods for the academic year (via facade)
    const periods = (
      await this.academicReadFacade.findPeriodsForYear(tenantId, academicYearId)
    ).map((p) => ({ id: p.id, name: p.name }));
    const periodIds = periods.map((p) => p.id);

    // 2. Existing snapshots
    const snapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        subject_id: subjectId,
        academic_period_id: { in: periodIds },
      },
    });

    // 3. Enrolled students
    const { studentMap, studentIds } = await this.loadEnrolledStudents(tenantId, classId);

    // 4. Period weights (equal-weight fallback)
    const periodWeights = await this.resolvePeriodWeightsOrEqual(
      tenantId,
      classId,
      academicYearId,
      periodIds,
      warnings,
    );

    // 5. Build lookup: studentId → periodId → GradeCell
    const snapshotLookup = this.buildSnapshotLookup(snapshots, 'academic_period_id');

    // 5b. Load grading scale for display fixup
    const subjectConfig = await this.prisma.classSubjectGradeConfig.findFirst({
      where: { tenant_id: tenantId, class_id: classId, subject_id: subjectId },
      include: { grading_scale: { select: { config_json: true } } },
    });
    const scaleForSubject = subjectConfig?.grading_scale?.config_json
      ? (subjectConfig.grading_scale.config_json as unknown as GradingScaleConfig)
      : null;

    // 6. Weighted average per student
    const studentRows = studentIds.map((sid) => {
      const grades = snapshotLookup.get(sid) ?? new Map<string, GradeCell>();
      const periodGrades: Record<string, GradeCell> = {};
      const activeIds = new Set<string>();

      for (const p of periods) {
        const cell = grades.get(p.id) ?? { computed: null, display: null };
        if (cell.computed !== null && cell.display?.endsWith('%') && scaleForSubject) {
          cell.display = this.applyGradingScale(cell.computed, scaleForSubject);
        }
        periodGrades[p.id] = cell;
        if (cell.computed !== null) activeIds.add(p.id);
      }

      const annual = this.weightedAverage(periodWeights, periodGrades, activeIds);

      return {
        student_id: sid,
        student_name: studentMap.get(sid) ?? '',
        period_grades: periodGrades,
        annual,
      };
    });

    return {
      students: studentRows,
      periods: periods.map((p) => ({
        ...p,
        weight: periodWeights.get(p.id) ?? 0,
      })),
      warnings,
    };
  }

  // ─── Year Overview (All Subjects × All Periods) ───────────────────────

  /**
   * Full year matrix: for each period compute a cross-subject overall,
   * then weight the period overalls to produce a year-end grade.
   */
  async computeYearOverview(
    tenantId: string,
    classId: string,
    academicYearId: string,
  ): Promise<YearOverviewResult> {
    const warnings: ComputationWarning[] = [];

    // 1. Periods + subjects
    const periods = (
      await this.academicReadFacade.findPeriodsForYear(tenantId, academicYearId)
    ).map((p) => ({ id: p.id, name: p.name }));
    const periodIds = periods.map((p) => p.id);

    const classSubjects = await this.prisma.classSubjectGradeConfig.findMany({
      where: { tenant_id: tenantId, class_id: classId },
      include: { subject: { select: { id: true, name: true } } },
    });
    const subjects = classSubjects
      .map((cs) => ({ id: cs.subject_id, name: cs.subject.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const subjectIds = subjects.map((s) => s.id);

    // 2. ALL snapshots for this class in the year
    const snapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        subject_id: { in: subjectIds },
        academic_period_id: { in: periodIds },
      },
    });

    // 3. Students
    const { studentMap, studentIds } = await this.loadEnrolledStudents(tenantId, classId);

    // 4. Weights
    const periodWeights = await this.resolvePeriodWeightsOrEqual(
      tenantId,
      classId,
      academicYearId,
      periodIds,
      warnings,
    );

    // Subject weights per period (may differ per period)
    const subjectWeightsByPeriod = new Map<string, Map<string, number>>();
    for (const p of periods) {
      const sw = await this.resolveSubjectWeightsOrEqual(
        tenantId,
        classId,
        p.id,
        subjectIds,
        warnings,
      );
      subjectWeightsByPeriod.set(p.id, sw);
    }

    // 5. Triple-keyed lookup: studentId → periodId → subjectId → GradeCell
    const tripleMap = new Map<string, Map<string, Map<string, GradeCell>>>();
    for (const snap of snapshots) {
      if (!tripleMap.has(snap.student_id)) tripleMap.set(snap.student_id, new Map());
      const byPeriod = tripleMap.get(snap.student_id)!;
      if (!byPeriod.has(snap.academic_period_id)) byPeriod.set(snap.academic_period_id, new Map());
      byPeriod.get(snap.academic_period_id)!.set(snap.subject_id, {
        computed: snap.computed_value ? Number(snap.computed_value) : null,
        display: snap.display_value,
      });
    }

    // 6. For each student: per-period overall → year overall
    const studentRows = studentIds.map((sid) => {
      const studentPeriods = tripleMap.get(sid) ?? new Map();
      const grades: Record<string, Record<string, GradeCell>> = {};
      const periodOveralls: Record<string, GradeCell> = {};
      const activePeriodsForYear = new Set<string>();

      for (const period of periods) {
        const periodSubjects = studentPeriods.get(period.id) ?? new Map();
        const subjectWeights = subjectWeightsByPeriod.get(period.id) ?? new Map();
        const periodSubjectGrades: Record<string, GradeCell> = {};
        const activeSubjectIds = new Set<string>();

        for (const s of subjects) {
          const cell = periodSubjects.get(s.id) ?? { computed: null, display: null };
          periodSubjectGrades[s.id] = cell;
          if (cell.computed !== null) activeSubjectIds.add(s.id);
        }

        grades[period.id] = periodSubjectGrades;

        // Period overall = weighted average of subject grades
        const periodOverall = this.weightedAverage(
          subjectWeights,
          periodSubjectGrades,
          activeSubjectIds,
        );
        periodOveralls[period.id] = periodOverall;
        if (periodOverall.computed !== null) activePeriodsForYear.add(period.id);
      }

      // Year overall = weighted average of period overalls
      const yearOverall = this.weightedAverage(periodWeights, periodOveralls, activePeriodsForYear);

      return {
        student_id: sid,
        student_name: studentMap.get(sid) ?? '',
        grades,
        period_overalls: periodOveralls,
        year_overall: yearOverall,
      };
    });

    return {
      students: studentRows,
      subjects,
      periods: periods.map((p) => ({ ...p, weight: periodWeights.get(p.id) ?? 0 })),
      warnings,
    };
  }

  // ─── Shared aggregation helpers ─────────────────────────────────────────

  /** Load enrolled students for a class — returns id→name map and ordered id list. */
  private async loadEnrolledStudents(
    tenantId: string,
    classId: string,
  ): Promise<{ studentMap: Map<string, string>; studentIds: string[] }> {
    const enrolments = (await this.classesReadFacade.findEnrolmentsGeneric(
      tenantId,
      { class_id: classId, status: 'active' },
      { student_id: true },
    )) as Array<{ student_id: string }>;

    const ids = enrolments.map((e) => e.student_id);
    const students = await this.studentReadFacade.findByIds(tenantId, ids);

    return {
      studentMap: new Map(students.map((s) => [s.id, `${s.first_name} ${s.last_name}`])),
      studentIds: ids,
    };
  }

  /** Build a lookup: studentId → dimensionId → GradeCell from snapshot rows. */
  private buildSnapshotLookup(
    snapshots: Array<{
      student_id: string;
      subject_id: string;
      academic_period_id: string;
      computed_value: unknown;
      display_value: string | null;
    }>,
    dimensionKey: 'subject_id' | 'academic_period_id',
  ): Map<string, Map<string, GradeCell>> {
    const lookup = new Map<string, Map<string, GradeCell>>();
    for (const snap of snapshots) {
      if (!lookup.has(snap.student_id)) lookup.set(snap.student_id, new Map());
      lookup.get(snap.student_id)!.set(snap[dimensionKey], {
        computed: snap.computed_value != null ? Number(snap.computed_value) : null,
        display: snap.display_value,
      });
    }
    return lookup;
  }

  /** Weighted average with automatic normalisation for missing entries. */
  private weightedAverage(
    weights: Map<string, number>,
    values: Record<string, GradeCell>,
    activeIds: Set<string>,
  ): GradeCell {
    if (activeIds.size === 0) return { computed: null, display: null };

    // Normalise: only consider weights for active (non-null) entries
    let activeTotalWeight = 0;
    for (const id of activeIds) {
      activeTotalWeight += weights.get(id) ?? 0;
    }
    if (activeTotalWeight === 0) return { computed: null, display: null };

    let weightedSum = 0;
    for (const id of activeIds) {
      const rawWeight = weights.get(id) ?? 0;
      const effectiveWeight = (rawWeight / activeTotalWeight) * 100;
      const score = values[id]?.computed ?? 0;
      weightedSum += score * effectiveWeight;
    }

    const result = weightedSum / 100;
    const rounded = Math.round(result * 100) / 100;
    return { computed: rounded, display: `${rounded}%` };
  }

  /** Resolve subject weights — falls back to equal weights when unconfigured. */
  private async resolveSubjectWeightsOrEqual(
    tenantId: string,
    classId: string,
    periodId: string,
    subjectIds: string[],
    warnings: ComputationWarning[],
  ): Promise<Map<string, number>> {
    const weights = await this.weightConfigService.resolveSubjectWeightsForClass(
      tenantId,
      classId,
      periodId,
    );
    if (weights.size > 0) return weights;

    // Fall back to equal weights
    const eq = 100 / subjectIds.length;
    const map = new Map<string, number>();
    for (const id of subjectIds) map.set(id, eq);
    warnings.push({
      code: 'EQUAL_SUBJECT_WEIGHTS',
      message: 'No subject weights configured — using equal weights.',
    });
    return map;
  }

  /** Resolve period weights — falls back to equal weights when unconfigured. */
  private async resolvePeriodWeightsOrEqual(
    tenantId: string,
    classId: string,
    academicYearId: string,
    periodIds: string[],
    warnings: ComputationWarning[],
  ): Promise<Map<string, number>> {
    const weights = await this.weightConfigService.resolvePeriodWeightsForClass(
      tenantId,
      classId,
      academicYearId,
    );
    if (weights.size > 0) return weights;

    const eq = 100 / periodIds.length;
    const map = new Map<string, number>();
    for (const id of periodIds) map.set(id, eq);
    warnings.push({
      code: 'EQUAL_PERIOD_WEIGHTS',
      message: 'No period weights configured — using equal weights.',
    });
    return map;
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
      // Sort ranges descending by min so we match the highest applicable range first
      const sorted = [...config.ranges].sort((a, b) => b.min - a.min);
      for (const range of sorted) {
        if (percentage >= range.min) {
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
          err instanceof Error ? err.stack : String(err),
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
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }
}
