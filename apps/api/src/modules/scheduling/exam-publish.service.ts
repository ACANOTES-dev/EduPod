import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { ParentReadFacade } from '../parents/parent-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../students/student-read.facade';

import { ExamNotificationsService } from './exam-notifications.service';

export interface PublishResult {
  id: string;
  status: 'published';
  published_at: string;
  slot_count: number;
  assessments_created: number;
  notifications_fanout: {
    parents: number;
    invigilators: number;
  };
}

/**
 * Publishes an exam session and wires the post-publish side effects:
 *   1. Transition status planning → published.
 *   2. Auto-create one Assessment per (class, examinable subject-config, paper)
 *      in the owning academic period. This lets teachers record marks in the
 *      regular gradebook without bespoke plumbing.
 *   3. Fan out notifications to parents of students in the affected year
 *      groups and to every invigilator in the pool.
 *
 * Circular-dependency note: we intentionally do NOT import GradebookModule's
 * AssessmentsService. The publish path writes assessments via raw Prisma so
 * ``SchedulingModule → GradebookModule`` stays one-way (GradebookModule
 * already imports SchedulingModule).
 */
@Injectable()
export class ExamPublishService {
  private readonly logger = new Logger(ExamPublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly parentReadFacade: ParentReadFacade,
    private readonly examNotifications: ExamNotificationsService,
  ) {}

  // ─── Publish ──────────────────────────────────────────────────────────────

  async publishSession(
    tenantId: string,
    sessionId: string,
    actorUserId: string,
  ): Promise<PublishResult> {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      include: { _count: { select: { exam_slots: true } } },
    });
    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }
    if (session.status !== 'planning') {
      throw new BadRequestException({
        error: {
          code: 'SESSION_NOT_PLANNING',
          message: `Cannot publish a session in status "${session.status}"`,
        },
      });
    }
    if (session._count.exam_slots === 0) {
      throw new BadRequestException({
        error: {
          code: 'NO_SLOTS_GENERATED',
          message: 'Generate a schedule before publishing',
        },
      });
    }

    const slots = await this.prisma.examSlot.findMany({
      where: { tenant_id: tenantId, exam_session_id: sessionId },
      select: {
        id: true,
        year_group_id: true,
        subject_id: true,
        paper_number: true,
        date: true,
        exam_subject_config_id: true,
      },
    });

    const assessmentsCreated = await this.createGradebookAssessments(
      tenantId,
      session,
      actorUserId,
      slots,
    );

    const { parentCount, invigilatorCount } = await this.fanoutNotifications(
      tenantId,
      session.id,
      session.name,
      slots,
    );

    this.logger.log(
      `Published exam session ${sessionId}: ${slots.length} slots, ` +
        `${assessmentsCreated} assessments, ` +
        `notifications→ parents=${parentCount} invigilators=${invigilatorCount}`,
    );

    return {
      id: sessionId,
      status: 'published',
      published_at: new Date().toISOString(),
      slot_count: slots.length,
      assessments_created: assessmentsCreated,
      notifications_fanout: {
        parents: parentCount,
        invigilators: invigilatorCount,
      },
    };
  }

  // ─── Check if a date is in a published session window (for My Timetable) ──

  async hasActiveExamSession(tenantId: string, date: Date): Promise<boolean> {
    const session = await this.prisma.examSession.findFirst({
      where: {
        tenant_id: tenantId,
        status: 'published',
        start_date: { lte: date },
        end_date: { gte: date },
      },
      select: { id: true },
    });
    return session !== null;
  }

  // ─── Gradebook side effects ──────────────────────────────────────────────

  private async createGradebookAssessments(
    tenantId: string,
    session: {
      id: string;
      name: string;
      academic_period_id: string;
    },
    actorUserId: string,
    slots: Array<{
      id: string;
      year_group_id: string;
      subject_id: string;
      paper_number: number | null;
      date: Date;
      exam_subject_config_id: string | null;
    }>,
  ): Promise<number> {
    if (slots.length === 0) return 0;

    // Batch subject names up-front so assessment titles are human-readable
    const subjectIds = [...new Set(slots.map((s) => s.subject_id))];
    const subjects = await this.academicReadFacade.findSubjectsByIds(tenantId, subjectIds);
    const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

    // Cache classes per year group
    const yearGroupIds = [...new Set(slots.map((s) => s.year_group_id))];
    const yearGroupClassMap = new Map<string, Array<{ id: string }>>();
    for (const ygId of yearGroupIds) {
      const classes = await this.classesReadFacade.findByYearGroup(tenantId, ygId);
      yearGroupClassMap.set(
        ygId,
        classes.filter((c) => c.status === 'active').map((c) => ({ id: c.id })),
      );
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    let created = 0;

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Flip session status first — idempotency barrier inside the same txn.
      await db.examSession.update({
        where: { id: session.id },
        data: { status: 'published' },
      });

      const examCategoryId = await this.getOrCreateExamCategory(db, tenantId, actorUserId);

      for (const slot of slots) {
        const classes = yearGroupClassMap.get(slot.year_group_id) ?? [];
        if (classes.length === 0) continue;

        const subjectName = subjectNameById.get(slot.subject_id) ?? 'Exam';
        const paperSuffix = slot.paper_number ? ` — Paper ${slot.paper_number}` : '';
        const title = `${subjectName}${paperSuffix} — ${session.name}`;

        let firstAssessmentId: string | null = null;
        for (const c of classes) {
          const assessment = await db.assessment.create({
            data: {
              tenant_id: tenantId,
              class_id: c.id,
              subject_id: slot.subject_id,
              academic_period_id: session.academic_period_id,
              category_id: examCategoryId,
              title,
              max_score: 100,
              due_date: slot.date,
              status: 'open',
              counts_toward_report_card: true,
            },
          });
          created++;
          if (!firstAssessmentId) firstAssessmentId = assessment.id;
        }

        if (firstAssessmentId) {
          await db.examSlot.update({
            where: { id: slot.id },
            data: { gradebook_assessment_id: firstAssessmentId },
          });
        }
      }
    });

    return created;
  }

  private async getOrCreateExamCategory(
    db: PrismaService,
    tenantId: string,
    actorUserId: string,
  ): Promise<string> {
    const existing = await db.assessmentCategory.findFirst({
      where: {
        tenant_id: tenantId,
        name: 'Exams',
      },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await db.assessmentCategory.create({
      data: {
        tenant_id: tenantId,
        name: 'Exams',
        assessment_type: 'summative',
        default_weight: 50,
        status: 'approved',
        created_by_user_id: actorUserId,
      },
    });
    return created.id;
  }

  // ─── Notification fan-out ────────────────────────────────────────────────

  private async fanoutNotifications(
    tenantId: string,
    sessionId: string,
    sessionName: string,
    slots: Array<{ year_group_id: string }>,
  ): Promise<{ parentCount: number; invigilatorCount: number }> {
    const [parentUserIds, invigilatorUserIds] = await Promise.all([
      this.resolveParentUserIds(tenantId, [...new Set(slots.map((s) => s.year_group_id))]),
      this.resolveInvigilatorUserIds(tenantId, sessionId),
    ]);

    await Promise.all([
      this.examNotifications.notifyParentsScheduledPublished({
        tenantId,
        sessionId,
        sessionName,
        recipientUserIds: parentUserIds,
      }),
      this.examNotifications.notifyInvigilatorsAssigned({
        tenantId,
        sessionId,
        sessionName,
        recipientUserIds: invigilatorUserIds,
      }),
    ]);

    return {
      parentCount: parentUserIds.length,
      invigilatorCount: invigilatorUserIds.length,
    };
  }

  private async resolveParentUserIds(tenantId: string, yearGroupIds: string[]): Promise<string[]> {
    if (yearGroupIds.length === 0) return [];

    // Gather every class in the affected year groups, then every enrolled
    // student. Parents are resolved via student_parents; those parents are
    // mapped to user_ids via the Parent.user_id column.
    const classIds: string[] = [];
    for (const ygId of yearGroupIds) {
      const classes = await this.classesReadFacade.findByYearGroup(tenantId, ygId);
      for (const c of classes) {
        if (c.status === 'active') classIds.push(c.id);
      }
    }
    if (classIds.length === 0) return [];

    const studentIds: string[] = [];
    for (const classId of classIds) {
      const ids = await this.classesReadFacade.findEnrolledStudentIds(tenantId, classId);
      studentIds.push(...ids);
    }
    const uniqueStudentIds = [...new Set(studentIds)];
    if (uniqueStudentIds.length === 0) return [];

    const parentIds = await this.studentReadFacade.findParentIdsByStudentIds(
      tenantId,
      uniqueStudentIds,
    );
    if (parentIds.length === 0) return [];

    const contacts = await this.parentReadFacade.findActiveContactsByIds(tenantId, parentIds);
    return [
      ...new Set(
        contacts
          .map((c) => c.user_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
  }

  private async resolveInvigilatorUserIds(tenantId: string, sessionId: string): Promise<string[]> {
    const pool = await this.prisma.examInvigilatorPool.findMany({
      where: { tenant_id: tenantId, exam_session_id: sessionId },
      select: { staff_profile_id: true },
    });
    if (pool.length === 0) return [];

    const staff = await this.staffProfileReadFacade.findByIds(
      tenantId,
      pool.map((p) => p.staff_profile_id),
    );
    return [
      ...new Set(
        staff
          .map((s) => s.user_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
  }
}
