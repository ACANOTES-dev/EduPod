import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CommentWindowStatus, Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulesReadFacade } from '../../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../../staff-profiles/staff-profile-read.facade';

import type { CreateCommentWindowDto, UpdateCommentWindowDto } from './dto/comment-window.dto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListCommentWindowsQuery {
  page?: number;
  pageSize?: number;
  status?: CommentWindowStatus;
  academic_period_id?: string;
  academic_year_id?: string;
}

/**
 * Phase 1b — Option B: every comment write passes through the window
 * enforcement. Per-period callers pass `{ periodId, yearId }`; full-year
 * callers pass `{ periodId: null, yearId }`. The enforcement resolves to a
 * window row matching the same shape.
 */
export interface CommentWindowScope {
  periodId: string | null;
  yearId: string;
}

// ─── State transitions ───────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<CommentWindowStatus, CommentWindowStatus[]> = {
  scheduled: ['open', 'closed'],
  open: ['closed'],
  closed: ['open'],
};

function assertTransitionAllowed(from: CommentWindowStatus, to: CommentWindowStatus): void {
  if (!VALID_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException({
      code: 'INVALID_WINDOW_TRANSITION',
      message: `Cannot transition comment window from "${from}" to "${to}"`,
    });
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ReportCommentWindowsService {
  private readonly logger = new Logger(ReportCommentWindowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findActive(tenantId: string) {
    return this.prisma.reportCommentWindow.findFirst({
      where: { tenant_id: tenantId, status: 'open' },
      orderBy: { opens_at: 'desc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const window = await this.prisma.reportCommentWindow.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!window) {
      throw new NotFoundException({
        code: 'COMMENT_WINDOW_NOT_FOUND',
        message: `Comment window "${id}" not found`,
      });
    }
    return window;
  }

  async findByPeriod(tenantId: string, academicPeriodId: string) {
    return this.prisma.reportCommentWindow.findMany({
      where: { tenant_id: tenantId, academic_period_id: academicPeriodId },
      orderBy: { opens_at: 'desc' },
    });
  }

  async list(tenantId: string, query: ListCommentWindowsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ReportCommentWindowWhereInput = { tenant_id: tenantId };
    if (query.status) where.status = query.status;
    if (query.academic_period_id) where.academic_period_id = query.academic_period_id;
    if (query.academic_year_id) where.academic_year_id = query.academic_year_id;

    const [data, total] = await Promise.all([
      this.prisma.reportCommentWindow.findMany({
        where,
        orderBy: { opens_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.reportCommentWindow.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  async open(tenantId: string, actorUserId: string, dto: CreateCommentWindowDto) {
    // Pre-flight: friendly error if another window is already open
    const existingOpen = await this.prisma.reportCommentWindow.findFirst({
      where: { tenant_id: tenantId, status: 'open' },
    });
    if (existingOpen) {
      throw new ConflictException({
        code: 'COMMENT_WINDOW_ALREADY_OPEN',
        message: `Another comment window is already open (id "${existingOpen.id}"). Close it before opening a new one.`,
      });
    }

    const opensAt = new Date(dto.opens_at);
    const closesAt = new Date(dto.closes_at);
    const now = new Date();
    const initialStatus: CommentWindowStatus = opensAt <= now ? 'open' : 'scheduled';

    // Phase 1b — Option B: resolve period/year combination. Per-period
    // window → derive year from period's parent. Full-year window →
    // period stays null, year must be provided by the caller.
    const rawPeriod = dto.academic_period_id ?? null;
    const rawYear = dto.academic_year_id ?? null;

    let periodId: string | null;
    let academicYearId: string;

    if (rawPeriod !== null && rawPeriod !== '') {
      const period = await this.academicReadFacade.findPeriodById(tenantId, rawPeriod);
      if (!period) {
        throw new NotFoundException({
          code: 'ACADEMIC_PERIOD_NOT_FOUND',
          message: `Academic period "${rawPeriod}" not found`,
        });
      }
      periodId = rawPeriod;
      academicYearId = period.academic_year_id;
    } else if (rawYear !== null && rawYear !== '') {
      const year = await this.academicReadFacade.findYearById(tenantId, rawYear);
      if (!year) {
        throw new NotFoundException({
          code: 'ACADEMIC_YEAR_NOT_FOUND',
          message: `Academic year "${rawYear}" not found`,
        });
      }
      periodId = null;
      academicYearId = year.id;
    } else {
      throw new BadRequestException({
        code: 'PERIOD_OR_YEAR_REQUIRED',
        message: 'Either academic_period_id or academic_year_id is required',
      });
    }

    // Round-2 QA: validate the homeroom assignment list before opening the
    // window. Every class_id and staff_profile_id must belong to this tenant
    // (RLS will enforce that anyway, but a friendly 400 beats a transaction
    // rollback) and the classes must be on the same academic year as the
    // window. Empty list is fine — classes left unassigned simply skip the
    // overall-comment slot for this window.
    const homeroomAssignments = dto.homeroom_assignments ?? [];
    if (homeroomAssignments.length > 0) {
      const classIds = Array.from(new Set(homeroomAssignments.map((a) => a.class_id)));
      const staffIds = Array.from(
        new Set(homeroomAssignments.map((a) => a.homeroom_teacher_staff_id)),
      );

      // Cross-module read facades — direct prisma.class / prisma.staffProfile
      // access from the gradebook module is blocked by the architecture lint
      // rule, so we route through the canonical generic helpers instead.
      const [foundClassesRaw, foundStaffRaw] = await Promise.all([
        this.classesReadFacade.findClassesGeneric(
          tenantId,
          { id: { in: classIds } },
          { id: true, academic_year_id: true },
        ),
        this.staffProfileReadFacade.findManyGeneric(tenantId, {
          where: { id: { in: staffIds } },
          select: { id: true },
        }),
      ]);
      const foundClasses = foundClassesRaw as Array<{ id: string; academic_year_id: string }>;
      const foundStaff = foundStaffRaw as Array<{ id: string }>;

      if (foundClasses.length !== classIds.length) {
        throw new BadRequestException({
          code: 'HOMEROOM_CLASS_NOT_FOUND',
          message: 'One or more classes in homeroom_assignments do not exist for this tenant',
        });
      }
      if (foundStaff.length !== staffIds.length) {
        throw new BadRequestException({
          code: 'HOMEROOM_STAFF_NOT_FOUND',
          message: 'One or more staff members in homeroom_assignments do not exist for this tenant',
        });
      }
      const wrongYear = foundClasses.find((c) => c.academic_year_id !== academicYearId);
      if (wrongYear) {
        throw new BadRequestException({
          code: 'HOMEROOM_CLASS_WRONG_YEAR',
          message: `Class "${wrongYear.id}" is not on the same academic year as this comment window`,
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      try {
        const created = await db.reportCommentWindow.create({
          data: {
            tenant_id: tenantId,
            academic_period_id: periodId,
            academic_year_id: academicYearId,
            opens_at: opensAt,
            closes_at: closesAt,
            instructions: dto.instructions ?? null,
            status: initialStatus,
            opened_by_user_id: actorUserId,
          },
        });

        if (homeroomAssignments.length > 0) {
          await db.reportCommentWindowHomeroom.createMany({
            data: homeroomAssignments.map((a) => ({
              tenant_id: tenantId,
              comment_window_id: created.id,
              class_id: a.class_id,
              homeroom_teacher_staff_id: a.homeroom_teacher_staff_id,
            })),
          });
        }

        return created;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException({
            code: 'COMMENT_WINDOW_ALREADY_OPEN',
            message: 'Another comment window is already open for this tenant',
          });
        }
        throw err;
      }
    });
  }

  // ─── Homeroom assignment lookups ─────────────────────────────────────────
  //
  // The overall-comments authorisation path and the teacher landing endpoint
  // both ask "for the active window matching scope X, who is the homeroom
  // teacher of class C?" and "what classes is staff S the homeroom teacher
  // of right now?". Both go through this service so the schema decisions
  // stay encapsulated.

  /** Find the open window matching the given scope. Null when none. */
  async findOpenWindow(tenantId: string, scope: CommentWindowScope) {
    const scopeWhere: Prisma.ReportCommentWindowWhereInput =
      scope.periodId !== null
        ? { academic_period_id: scope.periodId }
        : { academic_period_id: null, academic_year_id: scope.yearId };

    return this.prisma.reportCommentWindow.findFirst({
      where: { tenant_id: tenantId, status: 'open', ...scopeWhere },
    });
  }

  /**
   * Resolve the homeroom teacher assignment for (scope, class). Returns null
   * when no window is open OR no homeroom has been assigned for this class
   * on the active window. The user_id is included so the caller can compare
   * against `actor.userId` without a second staff_profile lookup.
   */
  async getHomeroomTeacherForClass(
    tenantId: string,
    scope: CommentWindowScope,
    classId: string,
  ): Promise<{ staff_profile_id: string; user_id: string; comment_window_id: string } | null> {
    const window = await this.findOpenWindow(tenantId, scope);
    if (!window) return null;

    const assignment = await this.prisma.reportCommentWindowHomeroom.findFirst({
      where: {
        tenant_id: tenantId,
        comment_window_id: window.id,
        class_id: classId,
      },
      select: {
        homeroom_teacher_staff_id: true,
        staff_profile: { select: { user_id: true } },
      },
    });
    if (!assignment) return null;

    return {
      staff_profile_id: assignment.homeroom_teacher_staff_id,
      user_id: assignment.staff_profile.user_id,
      comment_window_id: window.id,
    };
  }

  /**
   * Return the class IDs for which the given staff member is the homeroom
   * teacher on the open window matching `scope`. Used by the teacher
   * landing endpoint to render "your overall-comment classes" cards.
   */
  async listHomeroomClassesForStaff(
    tenantId: string,
    scope: CommentWindowScope,
    staffProfileId: string,
  ): Promise<string[]> {
    const window = await this.findOpenWindow(tenantId, scope);
    if (!window) return [];

    const rows = await this.prisma.reportCommentWindowHomeroom.findMany({
      where: {
        tenant_id: tenantId,
        comment_window_id: window.id,
        homeroom_teacher_staff_id: staffProfileId,
      },
      select: { class_id: true },
    });
    return rows.map((r) => r.class_id);
  }

  /** All (class_id, staff_profile_id) pairs for a window. Admin views. */
  async listHomeroomAssignmentsForWindow(
    tenantId: string,
    commentWindowId: string,
  ): Promise<Array<{ class_id: string; homeroom_teacher_staff_id: string }>> {
    return this.prisma.reportCommentWindowHomeroom.findMany({
      where: { tenant_id: tenantId, comment_window_id: commentWindowId },
      select: { class_id: true, homeroom_teacher_staff_id: true },
    });
  }

  /**
   * Find the most recent prior window for a scope and return its homeroom
   * assignments. Used by the teacher-request auto-execute flow so that
   * reopening a window carries forward the homeroom picks the admin made
   * the first time around — without this the teacher who triggered the
   * request would land on an empty overall-comment scope. Returns an empty
   * array when there is no prior window (fresh period) or when the prior
   * window had no assignments.
   */
  async findLatestHomeroomAssignmentsForScope(
    tenantId: string,
    scope: CommentWindowScope,
  ): Promise<Array<{ class_id: string; homeroom_teacher_staff_id: string }>> {
    const scopeWhere: Prisma.ReportCommentWindowWhereInput =
      scope.periodId !== null
        ? { academic_period_id: scope.periodId }
        : { academic_period_id: null, academic_year_id: scope.yearId };

    const latest = await this.prisma.reportCommentWindow.findFirst({
      where: { tenant_id: tenantId, ...scopeWhere },
      orderBy: { opens_at: 'desc' },
      select: { id: true },
    });

    if (!latest) return [];
    return this.listHomeroomAssignmentsForWindow(tenantId, latest.id);
  }

  // ─── Landing endpoint scoping ────────────────────────────────────────────
  //
  // The /report-comments landing page asks the backend "what classes can I
  // see?". It returns:
  //   - overall_class_ids: classes where the actor is the homeroom teacher
  //     on the open comment window (unlocks the overall-comment slot)
  //   - subject_assignments: (class_id, subject_id) pairs the actor can
  //     write subject comments for
  //
  // For an admin the answer is "every (class, subject) pair in the curriculum
  // matrix" (unchanged — admins see the whole school).
  //
  // For a teacher (Stage 8 source of truth: the live `schedules` table) the
  // answer is "every `(class, subject)` pair this teacher is scheduled to
  // teach on the applied timetable". If no timetable has been applied, the
  // teacher sees an empty `subject_assignments` list and the UI renders the
  // "No timetable applied yet" empty state.

  async getLandingScopeForActor(
    tenantId: string,
    actor: { userId: string; isAdmin: boolean },
  ): Promise<{
    is_admin: boolean;
    overall_class_ids: string[];
    subject_assignments: Array<{ class_id: string; subject_id: string }>;
    active_window_id: string | null;
    no_timetable_applied: boolean;
  }> {
    const activeWindow = await this.prisma.reportCommentWindow.findFirst({
      where: { tenant_id: tenantId, status: 'open' },
      orderBy: { opens_at: 'desc' },
      select: { id: true, academic_year_id: true },
    });

    // Resolve the academic year. When a window is open we use its year;
    // otherwise we fall back to the tenant's current academic year so the
    // page still renders a read-only view.
    const academicYearId =
      activeWindow?.academic_year_id ??
      (await this.academicReadFacade.findCurrentYear(tenantId))?.id ??
      null;

    // Admin path — whole-school curriculum matrix for the academic year.
    if (actor.isAdmin) {
      const subjectAssignments = await this.buildAdminSubjectAssignments(tenantId, academicYearId);
      return {
        is_admin: true,
        overall_class_ids: [],
        subject_assignments: subjectAssignments,
        active_window_id: activeWindow?.id ?? null,
        no_timetable_applied: false,
      };
    }

    // Teacher path — derive (class, subject) pairs from the live schedules
    // table. Homeroom assignments are still looked up from the explicit
    // homeroom table on the active window.
    let staffProfileId: string;
    try {
      staffProfileId = await this.staffProfileReadFacade.resolveProfileId(tenantId, actor.userId);
    } catch {
      return {
        is_admin: false,
        overall_class_ids: [],
        subject_assignments: [],
        active_window_id: activeWindow?.id ?? null,
        no_timetable_applied: false,
      };
    }

    const overallClassIds = activeWindow
      ? (
          await this.prisma.reportCommentWindowHomeroom.findMany({
            where: {
              tenant_id: tenantId,
              comment_window_id: activeWindow.id,
              homeroom_teacher_staff_id: staffProfileId,
            },
            select: { class_id: true },
          })
        ).map((r) => r.class_id)
      : [];

    if (!academicYearId) {
      return {
        is_admin: false,
        overall_class_ids: overallClassIds,
        subject_assignments: [],
        active_window_id: activeWindow?.id ?? null,
        no_timetable_applied: false,
      };
    }

    const hasAnySchedule = await this.schedulesReadFacade.hasAppliedSchedule(
      tenantId,
      academicYearId,
    );
    if (!hasAnySchedule) {
      return {
        is_admin: false,
        overall_class_ids: overallClassIds,
        subject_assignments: [],
        active_window_id: activeWindow?.id ?? null,
        no_timetable_applied: true,
      };
    }

    const subjectAssignments = await this.schedulesReadFacade.getTeacherAssignmentsForYear(
      tenantId,
      academicYearId,
      staffProfileId,
    );

    return {
      is_admin: false,
      overall_class_ids: overallClassIds,
      subject_assignments: subjectAssignments,
      active_window_id: activeWindow?.id ?? null,
      no_timetable_applied: false,
    };
  }

  /**
   * Admin-view helper: every `(class_id, subject_id)` pair in the curriculum
   * matrix for the academic year. Unchanged from the Stage 7 behaviour —
   * admins always see the whole school regardless of timetable state.
   */
  private async buildAdminSubjectAssignments(
    tenantId: string,
    academicYearId: string | null,
  ): Promise<Array<{ class_id: string; subject_id: string }>> {
    if (!academicYearId) return [];

    const classes = (await this.classesReadFacade.findClassesGeneric(
      tenantId,
      { academic_year_id: academicYearId, status: 'active' },
      { id: true, year_group_id: true },
    )) as Array<{ id: string; year_group_id: string | null }>;

    if (classes.length === 0) return [];

    const classIds = classes.map((c) => c.id);
    const matrixRows = await this.prisma.classSubjectGradeConfig.findMany({
      where: { tenant_id: tenantId, class_id: { in: classIds } },
      select: { class_id: true, subject_id: true },
    });
    return matrixRows.map((r) => ({ class_id: r.class_id, subject_id: r.subject_id }));
  }

  async closeNow(tenantId: string, actorUserId: string, id: string) {
    const existing = await this.findById(tenantId, id);
    assertTransitionAllowed(existing.status, 'closed');

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCommentWindow.update({
        where: { id },
        data: {
          status: 'closed',
          closed_at: new Date(),
          closed_by_user_id: actorUserId,
        },
      });
    });
  }

  async extend(tenantId: string, _actorUserId: string, id: string, newClosesAt: Date) {
    const existing = await this.findById(tenantId, id);
    if (existing.status !== 'open' && existing.status !== 'scheduled') {
      throw new BadRequestException({
        code: 'INVALID_WINDOW_EXTEND',
        message: `Cannot extend a window with status "${existing.status}"`,
      });
    }
    if (newClosesAt <= existing.opens_at) {
      throw new BadRequestException({
        code: 'INVALID_WINDOW_EXTEND',
        message: 'new closes_at must be strictly after opens_at',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCommentWindow.update({
        where: { id },
        data: { closes_at: newClosesAt },
      });
    });
  }

  async reopen(tenantId: string, _actorUserId: string, id: string) {
    const existing = await this.findById(tenantId, id);
    assertTransitionAllowed(existing.status, 'open');

    // Guard against reopening when another window is already open
    const otherOpen = await this.prisma.reportCommentWindow.findFirst({
      where: { tenant_id: tenantId, status: 'open', id: { not: id } },
    });
    if (otherOpen) {
      throw new ConflictException({
        code: 'COMMENT_WINDOW_ALREADY_OPEN',
        message: `Another comment window is already open (id "${otherOpen.id}"). Close it before reopening this one.`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      try {
        return await db.reportCommentWindow.update({
          where: { id },
          data: {
            status: 'open',
            closed_at: null,
            closed_by_user_id: null,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException({
            code: 'COMMENT_WINDOW_ALREADY_OPEN',
            message: 'Another comment window is already open for this tenant',
          });
        }
        throw err;
      }
    });
  }

  async updateInstructions(
    tenantId: string,
    _actorUserId: string,
    id: string,
    dto: UpdateCommentWindowDto,
  ) {
    const existing = await this.findById(tenantId, id);

    const data: Prisma.ReportCommentWindowUpdateInput = {};
    if (dto.instructions !== undefined) data.instructions = dto.instructions;
    if (dto.opens_at !== undefined) {
      if (existing.status === 'closed') {
        throw new BadRequestException({
          code: 'INVALID_WINDOW_UPDATE',
          message: 'Cannot modify opens_at on a closed window',
        });
      }
      data.opens_at = new Date(dto.opens_at);
    }
    if (dto.closes_at !== undefined) {
      if (existing.status === 'closed') {
        throw new BadRequestException({
          code: 'INVALID_WINDOW_UPDATE',
          message: 'Cannot modify closes_at on a closed window',
        });
      }
      data.closes_at = new Date(dto.closes_at);
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCommentWindow.update({ where: { id }, data });
    });
  }

  // ─── Internal enforcement ────────────────────────────────────────────────
  //
  // The single reusable cost-control primitive. Every comment write and every
  // AI call MUST go through this. Throws ForbiddenException with
  // COMMENT_WINDOW_CLOSED when no open window exists for the target scope.
  //
  // Phase 1b — Option B: accepts either a period-scoped or year-scoped
  // (full-year) assertion. The caller normalises the incoming DTO into a
  // `CommentWindowScope` via `resolveCommentScope()` below.

  async assertWindowOpenForPeriod(tenantId: string, academicPeriodId: string): Promise<void> {
    // Kept for backwards compatibility with callers that still pass a raw
    // period id. Internally delegates to the scope-aware path.
    await this.assertWindowOpen(tenantId, { periodId: academicPeriodId, yearId: '' });
  }

  async assertWindowOpen(tenantId: string, scope: CommentWindowScope): Promise<void> {
    // Period-scoped writes match windows with the same non-null period.
    // Full-year (NULL period) writes match full-year windows with the same
    // academic_year_id.
    const scopeWhere: Prisma.ReportCommentWindowWhereInput =
      scope.periodId !== null
        ? { academic_period_id: scope.periodId }
        : { academic_period_id: null, academic_year_id: scope.yearId };

    const open = await this.prisma.reportCommentWindow.findFirst({
      where: {
        tenant_id: tenantId,
        status: 'open',
        ...scopeWhere,
      },
    });

    if (open) {
      const now = new Date();
      if (open.closes_at <= now) {
        // Clock has moved past the scheduled close time. Reject — a cron/admin
        // will flip status on the next tick.
        throw new ForbiddenException({
          code: 'COMMENT_WINDOW_CLOSED',
          message: 'The comment window has expired. Contact an administrator to reopen it.',
        });
      }
      return;
    }

    // No open window. Look up next scheduled window so we can give a helpful
    // error message. No access to PII here — just the upcoming opens_at.
    const next = await this.prisma.reportCommentWindow.findFirst({
      where: {
        tenant_id: tenantId,
        status: 'scheduled',
        ...scopeWhere,
      },
      orderBy: { opens_at: 'asc' },
    });

    const suffix = next ? ` The next window opens at ${next.opens_at.toISOString()}.` : '';
    const scopeLabel = scope.periodId !== null ? 'academic period' : 'academic year';

    throw new ForbiddenException({
      code: 'COMMENT_WINDOW_CLOSED',
      message: `No comment window is currently open for this ${scopeLabel}.${suffix}`,
    });
  }

  /**
   * Normalises a caller's `{ academic_period_id?, academic_year_id? }` pair
   * into a concrete `CommentWindowScope`. Exactly one must be provided and
   * valid. When period is set, the year is derived from the period's parent
   * year. When period is null, the year must be supplied.
   */
  async resolveCommentScope(
    tenantId: string,
    input: { academic_period_id?: string | null; academic_year_id?: string | null },
  ): Promise<CommentWindowScope> {
    const rawPeriod = input.academic_period_id ?? null;
    const rawYear = input.academic_year_id ?? null;

    if (rawPeriod !== null && rawPeriod !== '') {
      const period = await this.academicReadFacade.findPeriodById(tenantId, rawPeriod);
      if (!period) {
        throw new NotFoundException({
          code: 'ACADEMIC_PERIOD_NOT_FOUND',
          message: `Academic period "${rawPeriod}" not found`,
        });
      }
      return { periodId: rawPeriod, yearId: period.academic_year_id };
    }

    if (rawYear !== null && rawYear !== '') {
      const year = await this.academicReadFacade.findYearById(tenantId, rawYear);
      if (!year) {
        throw new NotFoundException({
          code: 'ACADEMIC_YEAR_NOT_FOUND',
          message: `Academic year "${rawYear}" not found`,
        });
      }
      return { periodId: null, yearId: year.id };
    }

    throw new BadRequestException({
      code: 'PERIOD_OR_YEAR_REQUIRED',
      message: 'Either academic_period_id or academic_year_id is required',
    });
  }
}
