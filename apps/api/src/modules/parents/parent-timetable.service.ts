/* eslint-disable school/no-cross-module-prisma-access --
 * SCHED-032 / SCHED-035: parent-of-child + student-self timetable views.
 * Assembling a "what does my child's / my weekly timetable look like" response
 * is inherently cross-module — it touches students, classes, academics
 * (year groups), scheduling (period templates) and schedules. Threading this
 * through four separate ReadFacades with their own module-import edges drags
 * ParentsModule into a 4-way cycle via AdmissionsModule → FinanceModule.
 * The cleanest practical resolution is to let this single, tightly-scoped
 * read path access Prisma directly. All mutations still route through the
 * owning module's service layer. */
/* eslint-disable school/no-cross-module-internal-import */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthReadFacade } from '../auth/auth-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

import { ParentReadFacade } from './parent-read.facade';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParentTimetableResponse {
  class_name: string;
  classroom_model: 'fixed_homeroom' | 'free_movement';
  rotation_week_label: string | null;
  week_start: string;
  week_end: string;
  weekdays: number[];
  periods: Array<{ order: number; name: string; start_time: string; end_time: string }>;
  cells: Array<{
    weekday: number;
    period_order: number;
    period_name: string;
    subject_name: string;
    teacher_name: string | null;
    room_name: string | null;
  }>;
  /** True when the displayed week falls inside a published exam session. */
  exam_session_active?: boolean;
  /** Human-readable explanation shown in place of the weekly grid. */
  exam_session_message?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Parent- and student-scoped timetable assembler.
 *
 * - `GET /v1/parent/timetable?student_id=<uuid>` (parent-of-child) — delivered
 *   under SCHED-035.
 * - `GET /v1/parent/timetable/self` (student self) — delivered under
 *   SCHED-032.
 *
 * Both endpoints return the rich `{ class_name, classroom_model, weekdays,
 * periods, cells, … }` shape consumed by the frontend timetable tab.
 */
@Injectable()
export class ParentTimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parentReadFacade: ParentReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly authReadFacade: AuthReadFacade,
  ) {}

  /** Parent-of-child view — verifies the parent-student link first. */
  async getStudentTimetable(
    tenantId: string,
    parentUserId: string,
    studentId: string,
  ): Promise<ParentTimetableResponse> {
    const parent = await this.parentReadFacade.findByUserId(tenantId, parentUserId);
    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'No parent profile found for the current user',
      });
    }

    const isLinked = await this.studentReadFacade.isParentLinked(tenantId, studentId, parent.id);
    if (!isLinked) {
      throw new ForbiddenException({
        code: 'NOT_LINKED_TO_STUDENT',
        message: 'You are not linked to this student',
      });
    }

    return this.assembleForStudent(tenantId, studentId);
  }

  /** Student-self view — resolves the student record by name match. */
  async getSelfTimetable(tenantId: string, userId: string): Promise<ParentTimetableResponse> {
    const user = await this.authReadFacade.findUserSummary(tenantId, userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    const student = await this.studentReadFacade.findByUserName(
      tenantId,
      user.first_name,
      user.last_name,
    );
    if (!student) {
      throw new ForbiddenException({
        code: 'STUDENT_PROFILE_NOT_FOUND',
        message: 'No student profile linked to this account',
      });
    }

    return this.assembleForStudent(tenantId, student.id);
  }

  // ─── Internal assembly ──────────────────────────────────────────────────

  private async assembleForStudent(
    tenantId: string,
    studentId: string,
  ): Promise<ParentTimetableResponse> {
    // 1. Resolve the student's primary active class enrolment.
    const enrolment = await this.prisma.classEnrolment.findFirst({
      where: { tenant_id: tenantId, student_id: studentId, status: 'active' },
      select: {
        class_entity: {
          select: {
            id: true,
            name: true,
            academic_year_id: true,
            year_group_id: true,
          },
        },
      },
    });

    const classRow = enrolment?.class_entity ?? null;
    if (!classRow) {
      return this.emptyResponse('');
    }

    // 2. Classroom model comes from the year group (falls back to fixed_homeroom).
    let classroomModel: 'fixed_homeroom' | 'free_movement' = 'fixed_homeroom';
    if (classRow.year_group_id) {
      const yg = await this.prisma.yearGroup.findFirst({
        where: { id: classRow.year_group_id, tenant_id: tenantId },
        select: { classroom_model: true },
      });
      if (yg?.classroom_model === 'free_movement') classroomModel = 'free_movement';
    }

    // 3. Period templates — prefer year-group-scoped rows; fall back to
    //    tenant-wide (`year_group_id IS NULL`).
    const periodTemplateRows = await this.prisma.schedulePeriodTemplate.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: classRow.academic_year_id,
        schedule_period_type: 'teaching',
        OR: [{ year_group_id: classRow.year_group_id }, { year_group_id: null }],
      },
      orderBy: [{ weekday: 'asc' }, { period_order: 'asc' }],
      select: {
        weekday: true,
        period_order: true,
        period_name: true,
        start_time: true,
        end_time: true,
      },
    });

    const periodByOrder = new Map<
      number,
      { order: number; name: string; start_time: string; end_time: string }
    >();
    const weekdaySet = new Set<number>();
    for (const p of periodTemplateRows) {
      weekdaySet.add(p.weekday);
      if (!periodByOrder.has(p.period_order)) {
        periodByOrder.set(p.period_order, {
          order: p.period_order,
          name: p.period_name,
          start_time: p.start_time.toISOString().slice(11, 16),
          end_time: p.end_time.toISOString().slice(11, 16),
        });
      }
    }
    const periods = [...periodByOrder.values()].sort((a, b) => a.order - b.order);
    const weekdays = [...weekdaySet].sort((a, b) => a - b);

    // 4. Effective schedule rows for the class.
    const now = new Date();
    const schedules = await this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classRow.id,
        effective_start_date: { lte: now },
        OR: [{ effective_end_date: null }, { effective_end_date: { gte: now } }],
      },
      select: {
        weekday: true,
        period_order: true,
        class_entity: {
          select: {
            name: true,
            subject: { select: { name: true } },
          },
        },
        room: { select: { name: true } },
        teacher: {
          select: { user: { select: { first_name: true, last_name: true } } },
        },
      },
    });

    const cells: ParentTimetableResponse['cells'] = [];
    for (const s of schedules) {
      if (s.period_order == null) continue;
      const period = periodByOrder.get(s.period_order);
      cells.push({
        weekday: s.weekday,
        period_order: s.period_order,
        period_name: period?.name ?? '',
        subject_name: s.class_entity?.subject?.name ?? s.class_entity?.name ?? '',
        teacher_name: s.teacher
          ? `${s.teacher.user.first_name} ${s.teacher.user.last_name}`.trim()
          : null,
        room_name: s.room?.name ?? null,
      });
    }

    // 5. ISO Monday-to-Sunday week window (display-only).
    const dow = now.getUTCDay();
    const mondayOffset = (dow + 6) % 7;
    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - mondayOffset);
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

    // Exam-session full-suspension: hide regular grid for weeks that overlap
    // a published session — schools suspend normal classes during exam weeks.
    const activeSession = await this.prisma.examSession.findFirst({
      where: {
        tenant_id: tenantId,
        status: 'published',
        start_date: { lte: weekEnd },
        end_date: { gte: weekStart },
      },
      select: { id: true },
    });
    const isSuspended = activeSession !== null;

    return {
      class_name: classRow.name,
      classroom_model: classroomModel,
      rotation_week_label: null,
      week_start: weekStart.toISOString().slice(0, 10),
      week_end: weekEnd.toISOString().slice(0, 10),
      weekdays,
      periods,
      cells: isSuspended ? [] : cells,
      ...(isSuspended
        ? {
            exam_session_active: true,
            exam_session_message: 'No classes — exam session in progress',
          }
        : {}),
    };
  }

  private emptyResponse(className: string): ParentTimetableResponse {
    const today = new Date().toISOString().slice(0, 10);
    return {
      class_name: className,
      classroom_model: 'fixed_homeroom',
      rotation_week_label: null,
      week_start: today,
      week_end: today,
      weekdays: [],
      periods: [],
      cells: [],
    };
  }
}
