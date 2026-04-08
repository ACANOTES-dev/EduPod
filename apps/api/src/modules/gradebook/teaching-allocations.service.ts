/**
 * TeachingAllocationsService — Derives teacher class+subject teaching allocations.
 *
 * Allocations are derived from the intersection of:
 *   1. TeacherCompetency (teacher -> subject -> year_group for an academic year)
 *   2. ClassSubjectGradeConfig (class -> subject assignment from the Curriculum Matrix)
 *   3. Classes (active classes under each year_group)
 *
 * Each allocation is enriched with gradebook setup status: whether grade configs,
 * approved assessment categories, approved grading weights, and assessments exist.
 */
import { Injectable, Logger } from '@nestjs/common';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulingReadFacade } from '../scheduling/scheduling-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

// ─── Return type ─────────────────────────────────────────────────────────────

export interface TeachingAllocation {
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  subject_code: string | null;
  year_group_id: string;
  year_group_name: string;
  staff_profile_id: string;
  teacher_name: string;
  is_primary: boolean;
  // Setup status
  has_grade_config: boolean;
  has_approved_categories: number;
  has_approved_weights: boolean;
  assessment_count: number;
}

// ─── Internal types ──────────────────────────────────────────────────────────

interface RawAllocation {
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  subject_code: string | null;
  year_group_id: string;
  year_group_name: string;
  staff_profile_id: string;
  teacher_name: string;
  is_primary: boolean;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class TeachingAllocationsService {
  private readonly logger = new Logger(TeachingAllocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly schedulingReadFacade: SchedulingReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  /**
   * Get teaching allocations for the current user (teacher view).
   * Resolves userId -> staff_profile_id, then derives allocations from competencies.
   */
  async getMyAllocations(tenantId: string, userId: string): Promise<TeachingAllocation[]> {
    const staffProfileId = await this.staffProfileReadFacade.resolveProfileId(tenantId, userId);

    const activeYear = await this.academicReadFacade.findCurrentYear(tenantId);
    if (!activeYear) {
      return [];
    }

    const competencies = await this.schedulingReadFacade.findTeacherCompetencies(
      tenantId,
      activeYear.id,
    );

    // Filter to only this teacher's competencies
    const myCompetencies = competencies.filter((c) => c.staff_profile_id === staffProfileId);
    if (myCompetencies.length === 0) {
      return [];
    }

    return this.deriveAllocations(tenantId, activeYear.id, myCompetencies, staffProfileId);
  }

  /**
   * Get all teaching allocations across all teachers (leadership view).
   * Same derivation logic but without filtering to a single staff profile.
   */
  async getAllAllocations(tenantId: string): Promise<TeachingAllocation[]> {
    const activeYear = await this.academicReadFacade.findCurrentYear(tenantId);
    if (!activeYear) {
      return [];
    }

    const competencies = await this.schedulingReadFacade.findTeacherCompetencies(
      tenantId,
      activeYear.id,
    );

    if (competencies.length === 0) {
      return [];
    }

    return this.deriveAllocations(tenantId, activeYear.id, competencies);
  }

  /**
   * Get all teaching allocations for a specific class (any teacher can view).
   * Used by the assessments tab to show all subjects + teacher names per subject.
   */
  async getClassAllocations(tenantId: string, classId: string): Promise<TeachingAllocation[]> {
    const allAllocations = await this.getAllAllocations(tenantId);
    return allAllocations.filter((a) => a.class_id === classId);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Derive teaching allocations from competencies by cross-referencing with
   * curriculum requirements and classes, then enriching with setup status.
   *
   * When staffProfileId is provided, only looks up that single teacher's name.
   */
  private async deriveAllocations(
    tenantId: string,
    academicYearId: string,
    competencies: Array<{
      staff_profile_id: string;
      subject_id: string;
      year_group_id: string;
      is_primary: boolean;
    }>,
    staffProfileId?: string,
  ): Promise<TeachingAllocation[]> {
    // 1. Collect unique IDs from competencies
    const yearGroupIds = [...new Set(competencies.map((c) => c.year_group_id))];
    const subjectIds = [...new Set(competencies.map((c) => c.subject_id))];
    const staffProfileIds = staffProfileId
      ? [staffProfileId]
      : [...new Set(competencies.map((c) => c.staff_profile_id))];

    // 2. Fetch reference data in parallel via facades
    const [classSubjectConfigs, classes, subjects, yearGroups, staffProfiles] = await Promise.all([
      // Curriculum Matrix assignments (class+subject) — the source of truth for
      // which subjects are taught in which classes
      this.prisma.classSubjectGradeConfig.findMany({
        where: {
          tenant_id: tenantId,
          subject_id: { in: subjectIds },
        },
        select: {
          class_id: true,
          subject_id: true,
        },
      }),
      // Active classes for the academic year (filtered to relevant year groups)
      this.classesReadFacade.findByAcademicYear(tenantId, academicYearId),
      // Subject details (name, code)
      this.academicReadFacade.findSubjectsByIds(tenantId, subjectIds),
      // Year group names
      this.academicReadFacade.findAllYearGroups(tenantId),
      // Staff profile user names
      this.staffProfileReadFacade.findByIds(tenantId, staffProfileIds),
    ]);

    // 3. Build lookup maps
    // Class-level subject assignments from the Curriculum Matrix (class_subject_grade_configs)
    const classSubjectConfigSet = new Set(
      classSubjectConfigs.map((csg) => `${csg.class_id}:${csg.subject_id}`),
    );

    // Filter classes to only active ones in the relevant year_groups
    const activeClasses = classes.filter(
      (cls) =>
        cls.status === 'active' &&
        cls.year_group_id !== null &&
        yearGroupIds.includes(cls.year_group_id),
    );

    // Group classes by year_group_id
    const classesByYearGroup = new Map<string, Array<{ id: string; name: string }>>();
    for (const cls of activeClasses) {
      if (!cls.year_group_id) continue;
      const existing = classesByYearGroup.get(cls.year_group_id);
      if (existing) {
        existing.push({ id: cls.id, name: cls.name });
      } else {
        classesByYearGroup.set(cls.year_group_id, [{ id: cls.id, name: cls.name }]);
      }
    }

    const subjectMap = new Map(subjects.map((s) => [s.id, s]));
    const yearGroupMap = new Map(yearGroups.map((yg) => [yg.id, yg.name]));
    const staffMap = new Map(
      staffProfiles.map((sp) => [sp.id, `${sp.user.first_name} ${sp.user.last_name}`]),
    );

    // 4. Build raw allocations by crossing competencies with classes
    const rawAllocations: RawAllocation[] = [];

    for (const competency of competencies) {
      const subject = subjectMap.get(competency.subject_id);
      if (!subject) continue;

      const yearGroupName = yearGroupMap.get(competency.year_group_id) ?? '';
      const teacherName = staffMap.get(competency.staff_profile_id) ?? '';
      const yearGroupClasses = classesByYearGroup.get(competency.year_group_id) ?? [];

      for (const cls of yearGroupClasses) {
        // Skip if subject is not assigned to this class in the Curriculum Matrix
        if (!classSubjectConfigSet.has(`${cls.id}:${competency.subject_id}`)) {
          continue;
        }

        rawAllocations.push({
          class_id: cls.id,
          class_name: cls.name,
          subject_id: subject.id,
          subject_name: subject.name,
          subject_code: subject.code,
          year_group_id: competency.year_group_id,
          year_group_name: yearGroupName,
          staff_profile_id: competency.staff_profile_id,
          teacher_name: teacherName,
          is_primary: competency.is_primary,
        });
      }
    }

    if (rawAllocations.length === 0) {
      return [];
    }

    // 5. Enrich with setup status
    return this.enrichWithSetupStatus(tenantId, rawAllocations);
  }

  /**
   * Enrich raw allocations with gradebook setup status.
   *
   * All queries here target gradebook-owned models (classSubjectGradeConfig,
   * assessmentCategory, teacherGradingWeight, assessment) so direct Prisma
   * access is appropriate.
   */
  private async enrichWithSetupStatus(
    tenantId: string,
    rawAllocations: RawAllocation[],
  ): Promise<TeachingAllocation[]> {
    // Collect unique IDs for batch queries
    const classIds = [...new Set(rawAllocations.map((a) => a.class_id))];
    const subjectIds = [...new Set(rawAllocations.map((a) => a.subject_id))];
    const yearGroupIds = [...new Set(rawAllocations.map((a) => a.year_group_id))];

    // Run all enrichment queries in parallel (all gradebook-owned models)
    const [gradeConfigs, approvedCategories, approvedWeights, assessmentCounts] = await Promise.all(
      [
        // Grade configs (class+subject)
        this.prisma.classSubjectGradeConfig.findMany({
          where: {
            tenant_id: tenantId,
            class_id: { in: classIds },
            subject_id: { in: subjectIds },
          },
          select: {
            class_id: true,
            subject_id: true,
          },
        }),

        // Approved assessment categories scoped to subject+year_group (+ global)
        this.prisma.assessmentCategory.findMany({
          where: {
            tenant_id: tenantId,
            status: 'approved',
            OR: [
              {
                subject_id: { in: subjectIds },
                year_group_id: { in: yearGroupIds },
              },
              { subject_id: null, year_group_id: null },
              { subject_id: { in: subjectIds }, year_group_id: null },
              { subject_id: null, year_group_id: { in: yearGroupIds } },
            ],
          },
          select: {
            id: true,
            subject_id: true,
            year_group_id: true,
          },
        }),

        // Approved grading weights (subject+year_group)
        this.prisma.teacherGradingWeight.findMany({
          where: {
            tenant_id: tenantId,
            status: 'approved',
            subject_id: { in: subjectIds },
            year_group_id: { in: yearGroupIds },
          },
          select: {
            subject_id: true,
            year_group_id: true,
          },
        }),

        // Assessment counts per class+subject
        this.prisma.assessment.groupBy({
          by: ['class_id', 'subject_id'],
          where: {
            tenant_id: tenantId,
            class_id: { in: classIds },
            subject_id: { in: subjectIds },
          },
          _count: true,
        }),
      ],
    );

    // Build lookup structures
    const gradeConfigSet = new Set(gradeConfigs.map((gc) => `${gc.class_id}:${gc.subject_id}`));

    // Category count map: "subjectId:yearGroupId" -> count
    // A category matches if its scope includes the allocation's subject+year_group
    const categoryCountMap = new Map<string, number>();
    for (const allocation of rawAllocations) {
      const key = `${allocation.subject_id}:${allocation.year_group_id}`;
      if (!categoryCountMap.has(key)) {
        const count = approvedCategories.filter(
          (cat) =>
            (cat.subject_id === allocation.subject_id || cat.subject_id === null) &&
            (cat.year_group_id === allocation.year_group_id || cat.year_group_id === null),
        ).length;
        categoryCountMap.set(key, count);
      }
    }

    const approvedWeightSet = new Set(
      approvedWeights.map((aw) => `${aw.subject_id}:${aw.year_group_id}`),
    );

    const assessmentCountMap = new Map<string, number>();
    for (const ac of assessmentCounts) {
      assessmentCountMap.set(`${ac.class_id}:${ac.subject_id}`, ac._count);
    }

    // Assemble final allocations
    return rawAllocations.map((allocation) => ({
      ...allocation,
      has_grade_config: gradeConfigSet.has(`${allocation.class_id}:${allocation.subject_id}`),
      has_approved_categories:
        categoryCountMap.get(`${allocation.subject_id}:${allocation.year_group_id}`) ?? 0,
      has_approved_weights: approvedWeightSet.has(
        `${allocation.subject_id}:${allocation.year_group_id}`,
      ),
      assessment_count:
        assessmentCountMap.get(`${allocation.class_id}:${allocation.subject_id}`) ?? 0,
    }));
  }
}
