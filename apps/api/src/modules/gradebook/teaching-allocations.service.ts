/**
 * TeachingAllocationsService — Derives teacher class+subject teaching allocations
 * from the live `schedules` table (Stage 8 source of truth).
 *
 * Each allocation is a `(class, subject, teacher)` triple derived from the
 * currently-effective entries in `schedules`, deduped across multiple periods.
 * Each allocation is enriched with gradebook setup status (grade configs,
 * approved assessment categories, approved grading weights, assessment counts).
 *
 * Empty-state contract: `getMyAllocations` and `getAllAllocations` return
 * `{ data: [], meta: { reason: 'no_timetable_applied' } }` when no schedule
 * has been applied for the active academic year, so the UI can render the
 * empty-state CTA ("Go to scheduling →") instead of a generic "No results".
 */
import { Injectable, Logger } from '@nestjs/common';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

// ─── Return types ────────────────────────────────────────────────────────────

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
  // Setup status
  has_grade_config: boolean;
  has_approved_categories: number;
  has_approved_weights: boolean;
  assessment_count: number;
}

export interface TeachingAllocationsResult {
  data: TeachingAllocation[];
  meta: { reason: 'no_timetable_applied' | 'ok' };
}

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
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class TeachingAllocationsService {
  private readonly logger = new Logger(TeachingAllocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  /**
   * Teacher view — the classes + subjects this user is scheduled to teach.
   */
  async getMyAllocations(tenantId: string, userId: string): Promise<TeachingAllocationsResult> {
    const activeYear = await this.academicReadFacade.findCurrentYear(tenantId);
    if (!activeYear) {
      return { data: [], meta: { reason: 'no_timetable_applied' } };
    }

    let staffProfileId: string;
    try {
      staffProfileId = await this.staffProfileReadFacade.resolveProfileId(tenantId, userId);
    } catch {
      // User has no staff profile — treat the same as an unscheduled teacher.
      return { data: [], meta: { reason: 'no_timetable_applied' } };
    }

    const hasAnySchedule = await this.schedulesReadFacade.hasAppliedSchedule(
      tenantId,
      activeYear.id,
    );
    if (!hasAnySchedule) {
      return { data: [], meta: { reason: 'no_timetable_applied' } };
    }

    const pairs = await this.schedulesReadFacade.getTeacherAssignmentsForYear(
      tenantId,
      activeYear.id,
      staffProfileId,
    );
    if (pairs.length === 0) {
      return { data: [], meta: { reason: 'ok' } };
    }

    const allocations = await this.hydrateAndEnrich(
      tenantId,
      activeYear.id,
      pairs.map((p) => ({ ...p, teacher_staff_id: staffProfileId })),
    );
    return { data: allocations, meta: { reason: 'ok' } };
  }

  /**
   * Leadership view — every teacher's allocations across the school.
   */
  async getAllAllocations(tenantId: string): Promise<TeachingAllocationsResult> {
    const activeYear = await this.academicReadFacade.findCurrentYear(tenantId);
    if (!activeYear) {
      return { data: [], meta: { reason: 'no_timetable_applied' } };
    }

    const hasAnySchedule = await this.schedulesReadFacade.hasAppliedSchedule(
      tenantId,
      activeYear.id,
    );
    if (!hasAnySchedule) {
      return { data: [], meta: { reason: 'no_timetable_applied' } };
    }

    const triples = await this.schedulesReadFacade.getAllAssignmentsForYear(
      tenantId,
      activeYear.id,
    );
    if (triples.length === 0) {
      return { data: [], meta: { reason: 'ok' } };
    }

    const allocations = await this.hydrateAndEnrich(tenantId, activeYear.id, triples);
    return { data: allocations, meta: { reason: 'ok' } };
  }

  /**
   * Scoped to a single class — used by the assessments tab to show every
   * subject and its assigned teacher for one class.
   */
  async getClassAllocations(tenantId: string, classId: string): Promise<TeachingAllocationsResult> {
    const all = await this.getAllAllocations(tenantId);
    return { data: all.data.filter((a) => a.class_id === classId), meta: all.meta };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Hydrate class/subject/teacher names + year groups onto raw triples, then
   * layer on gradebook setup status.
   */
  private async hydrateAndEnrich(
    tenantId: string,
    academicYearId: string,
    triples: Array<{ class_id: string; subject_id: string; teacher_staff_id: string }>,
  ): Promise<TeachingAllocation[]> {
    const subjectIds = [...new Set(triples.map((t) => t.subject_id))];
    const staffProfileIds = [...new Set(triples.map((t) => t.teacher_staff_id))];

    const [classes, subjects, yearGroups, staffProfiles] = await Promise.all([
      this.classesReadFacade.findByAcademicYear(tenantId, academicYearId),
      this.academicReadFacade.findSubjectsByIds(tenantId, subjectIds),
      this.academicReadFacade.findAllYearGroups(tenantId),
      this.staffProfileReadFacade.findByIds(tenantId, staffProfileIds),
    ]);

    const classMap = new Map(classes.map((c) => [c.id, c]));
    const subjectMap = new Map(subjects.map((s) => [s.id, s]));
    const yearGroupMap = new Map(yearGroups.map((yg) => [yg.id, yg.name]));
    const staffMap = new Map(
      staffProfiles.map((sp) => [sp.id, `${sp.user.first_name} ${sp.user.last_name}`]),
    );

    const rawAllocations: RawAllocation[] = [];
    for (const triple of triples) {
      const cls = classMap.get(triple.class_id);
      const subject = subjectMap.get(triple.subject_id);
      if (!cls || !subject || !cls.year_group_id) continue;

      rawAllocations.push({
        class_id: cls.id,
        class_name: cls.name,
        subject_id: subject.id,
        subject_name: subject.name,
        subject_code: subject.code,
        year_group_id: cls.year_group_id,
        year_group_name: yearGroupMap.get(cls.year_group_id) ?? '',
        staff_profile_id: triple.teacher_staff_id,
        teacher_name: staffMap.get(triple.teacher_staff_id) ?? '',
      });
    }

    if (rawAllocations.length === 0) return [];

    return this.enrichWithSetupStatus(tenantId, rawAllocations);
  }

  /**
   * Enrich raw allocations with gradebook setup status. All queries target
   * gradebook-owned models (classSubjectGradeConfig, assessmentCategory,
   * teacherGradingWeight, assessment) so direct Prisma access is appropriate.
   */
  private async enrichWithSetupStatus(
    tenantId: string,
    rawAllocations: RawAllocation[],
  ): Promise<TeachingAllocation[]> {
    const classIds = [...new Set(rawAllocations.map((a) => a.class_id))];
    const subjectIds = [...new Set(rawAllocations.map((a) => a.subject_id))];
    const yearGroupIds = [...new Set(rawAllocations.map((a) => a.year_group_id))];

    const [gradeConfigs, approvedCategories, approvedWeights, assessmentCounts] = await Promise.all(
      [
        this.prisma.classSubjectGradeConfig.findMany({
          where: {
            tenant_id: tenantId,
            class_id: { in: classIds },
            subject_id: { in: subjectIds },
          },
          select: { class_id: true, subject_id: true },
        }),
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
          select: { id: true, subject_id: true, year_group_id: true },
        }),
        this.prisma.teacherGradingWeight.findMany({
          where: {
            tenant_id: tenantId,
            status: 'approved',
            subject_id: { in: subjectIds },
            year_group_id: { in: yearGroupIds },
          },
          select: { subject_id: true, year_group_id: true },
        }),
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

    const gradeConfigSet = new Set(gradeConfigs.map((gc) => `${gc.class_id}:${gc.subject_id}`));

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
