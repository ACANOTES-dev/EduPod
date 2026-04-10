import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { PrismaService } from '../../prisma/prisma.service';

import type { CreateSubjectCommentDto, UpdateSubjectCommentDto } from './dto/subject-comment.dto';
import { ReportCommentWindowsService } from './report-comment-windows.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListSubjectCommentsQuery {
  class_id?: string;
  subject_id?: string;
  /** Non-null for per-period rows, or the literal 'full_year' to filter to NULL-period rows. */
  academic_period_id?: string | 'full_year';
  academic_year_id?: string;
  author_user_id?: string;
  student_id?: string;
  finalised?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CommentActor {
  userId: string;
  isAdmin: boolean;
}

export interface CountByClassSubjectPeriod {
  total: number;
  finalised: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ReportCardSubjectCommentsService {
  private readonly logger = new Logger(ReportCardSubjectCommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly windowsService: ReportCommentWindowsService,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  // ─── Read ─────────────────────────────────────────────────────────────────

  async list(tenantId: string, query: ListSubjectCommentsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.ReportCardSubjectCommentWhereInput = { tenant_id: tenantId };
    if (query.class_id) where.class_id = query.class_id;
    if (query.subject_id) where.subject_id = query.subject_id;
    if (query.academic_period_id === 'full_year') {
      where.academic_period_id = null;
    } else if (query.academic_period_id) {
      where.academic_period_id = query.academic_period_id;
    }
    if (query.academic_year_id) where.academic_year_id = query.academic_year_id;
    if (query.author_user_id) where.author_user_id = query.author_user_id;
    if (query.student_id) where.student_id = query.student_id;
    if (query.finalised === true) where.finalised_at = { not: null };
    if (query.finalised === false) where.finalised_at = null;

    const [data, total] = await Promise.all([
      this.prisma.reportCardSubjectComment.findMany({
        where,
        orderBy: [{ student_id: 'asc' }, { created_at: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.reportCardSubjectComment.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  async findById(tenantId: string, id: string) {
    const row = await this.prisma.reportCardSubjectComment.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'SUBJECT_COMMENT_NOT_FOUND',
        message: `Subject comment "${id}" not found`,
      });
    }
    return row;
  }

  async findOne(
    tenantId: string,
    args: {
      studentId: string;
      subjectId: string;
      /** Non-null for per-period lookup; null selects the full-year row. */
      academicPeriodId: string | null;
      /** Required when academicPeriodId is null. */
      academicYearId?: string;
    },
  ) {
    const scopeWhere: Prisma.ReportCardSubjectCommentWhereInput =
      args.academicPeriodId !== null
        ? { academic_period_id: args.academicPeriodId }
        : {
            academic_period_id: null,
            ...(args.academicYearId ? { academic_year_id: args.academicYearId } : {}),
          };

    return this.prisma.reportCardSubjectComment.findFirst({
      where: {
        tenant_id: tenantId,
        student_id: args.studentId,
        subject_id: args.subjectId,
        ...scopeWhere,
      },
    });
  }

  async countByClassSubjectPeriod(
    tenantId: string,
    args: {
      classId: string;
      subjectId: string;
      /** Non-null for per-period counts; null counts the full-year rows. */
      academicPeriodId: string | null;
      academicYearId?: string;
    },
  ): Promise<CountByClassSubjectPeriod> {
    const scopeWhere: Prisma.ReportCardSubjectCommentWhereInput =
      args.academicPeriodId !== null
        ? { academic_period_id: args.academicPeriodId }
        : {
            academic_period_id: null,
            ...(args.academicYearId ? { academic_year_id: args.academicYearId } : {}),
          };
    const where = {
      tenant_id: tenantId,
      class_id: args.classId,
      subject_id: args.subjectId,
      ...scopeWhere,
    };
    const [total, finalised] = await Promise.all([
      this.prisma.reportCardSubjectComment.count({ where }),
      this.prisma.reportCardSubjectComment.count({
        where: { ...where, finalised_at: { not: null } },
      }),
    ]);
    return { total, finalised };
  }

  // ─── Authorship / permission checks ──────────────────────────────────────

  /**
   * Verify the actor is assigned as a teacher on the (class, subject) pair.
   * Admins (report_cards.manage) bypass this check.
   */
  private async assertTeachesClassSubject(
    tenantId: string,
    actor: CommentActor,
    classId: string,
    subjectId: string,
  ): Promise<void> {
    if (actor.isAdmin) return;

    const cls = await this.classesReadFacade.findById(tenantId, classId);
    if (!cls) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class "${classId}" not found`,
      });
    }

    // The subject must match either the class's direct subject field or be
    // reachable via class_staff staff assignments with the matching user.
    if (cls.subject_id && cls.subject_id !== subjectId) {
      throw new ForbiddenException({
        code: 'INVALID_AUTHOR',
        message: `You are not assigned to teach subject "${subjectId}" in class "${classId}"`,
      });
    }

    const staffAssignments = (await this.classesReadFacade.findClassStaffGeneric(
      tenantId,
      {
        class_id: classId,
        staff_profile: { user_id: actor.userId },
      },
      { class_id: true },
    )) as Array<{ class_id: string }>;
    if (staffAssignments.length === 0) {
      throw new ForbiddenException({
        code: 'INVALID_AUTHOR',
        message: 'You are not assigned to this class',
      });
    }
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  async upsert(tenantId: string, actor: CommentActor, dto: CreateSubjectCommentDto) {
    // Authorship BEFORE window — never leak window state to unauthorised users.
    await this.assertTeachesClassSubject(tenantId, actor, dto.class_id, dto.subject_id);

    // Phase 1b — Option B: resolve period/year combination.
    const scope = await this.windowsService.resolveCommentScope(tenantId, {
      academic_period_id: dto.academic_period_id,
      academic_year_id: dto.academic_year_id,
    });
    await this.windowsService.assertWindowOpen(tenantId, scope);

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: actor.userId,
    });

    const existingScopeWhere: Prisma.ReportCardSubjectCommentWhereInput =
      scope.periodId !== null
        ? { academic_period_id: scope.periodId }
        : { academic_period_id: null, academic_year_id: scope.yearId };

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.reportCardSubjectComment.findFirst({
        where: {
          tenant_id: tenantId,
          student_id: dto.student_id,
          subject_id: dto.subject_id,
          ...existingScopeWhere,
        },
      });

      const isAiDraft = dto.is_ai_draft ?? false;

      if (existing) {
        return db.reportCardSubjectComment.update({
          where: { id: existing.id },
          data: {
            comment_text: dto.comment_text,
            is_ai_draft: isAiDraft,
            // An edit invalidates finalisation — the comment must be re-finalised.
            finalised_at: null,
            finalised_by_user_id: null,
            last_ai_drafted_at: isAiDraft ? new Date() : existing.last_ai_drafted_at,
            // Author becomes whoever last wrote the comment.
            author_user_id: actor.userId,
          },
        });
      }

      return db.reportCardSubjectComment.create({
        data: {
          tenant_id: tenantId,
          student_id: dto.student_id,
          subject_id: dto.subject_id,
          class_id: dto.class_id,
          academic_period_id: scope.periodId,
          academic_year_id: scope.yearId,
          author_user_id: actor.userId,
          comment_text: dto.comment_text,
          is_ai_draft: isAiDraft,
          last_ai_drafted_at: isAiDraft ? new Date() : null,
        },
      });
    });
  }

  async updateText(
    tenantId: string,
    actor: CommentActor,
    id: string,
    dto: UpdateSubjectCommentDto,
  ) {
    const existing = await this.findById(tenantId, id);
    await this.assertTeachesClassSubject(tenantId, actor, existing.class_id, existing.subject_id);
    await this.windowsService.assertWindowOpen(tenantId, {
      periodId: existing.academic_period_id,
      yearId: existing.academic_year_id,
    });

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: actor.userId,
    });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCardSubjectComment.update({
        where: { id },
        data: {
          comment_text: dto.comment_text,
          is_ai_draft: dto.is_ai_draft ?? false,
          finalised_at: null,
          finalised_by_user_id: null,
          author_user_id: actor.userId,
        },
      });
    });
  }

  async finalise(tenantId: string, actor: CommentActor, id: string) {
    const existing = await this.findById(tenantId, id);
    await this.assertTeachesClassSubject(tenantId, actor, existing.class_id, existing.subject_id);
    await this.windowsService.assertWindowOpen(tenantId, {
      periodId: existing.academic_period_id,
      yearId: existing.academic_year_id,
    });

    if (!existing.comment_text || existing.comment_text.trim().length === 0) {
      throw new ForbiddenException({
        code: 'CANNOT_FINALISE_EMPTY_COMMENT',
        message: 'Cannot finalise a subject comment with empty text',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: actor.userId,
    });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCardSubjectComment.update({
        where: { id },
        data: {
          finalised_at: new Date(),
          finalised_by_user_id: actor.userId,
          is_ai_draft: false,
        },
      });
    });
  }

  async unfinalise(tenantId: string, actor: CommentActor, id: string) {
    const existing = await this.findById(tenantId, id);
    await this.assertTeachesClassSubject(tenantId, actor, existing.class_id, existing.subject_id);
    await this.windowsService.assertWindowOpen(tenantId, {
      periodId: existing.academic_period_id,
      yearId: existing.academic_year_id,
    });

    // Only the original finaliser or an admin can unfinalise
    if (!actor.isAdmin && existing.finalised_by_user_id !== actor.userId) {
      throw new ForbiddenException({
        code: 'INVALID_UNFINALISE_ACTOR',
        message: 'Only the original finaliser or an admin can unfinalise this comment',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: actor.userId,
    });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCardSubjectComment.update({
        where: { id },
        data: { finalised_at: null, finalised_by_user_id: null },
      });
    });
  }

  async bulkFinalise(
    tenantId: string,
    actor: CommentActor,
    args: { classId: string; subjectId: string; academicPeriodId: string },
  ): Promise<number> {
    await this.assertTeachesClassSubject(tenantId, actor, args.classId, args.subjectId);
    await this.windowsService.assertWindowOpen(tenantId, {
      periodId: args.academicPeriodId,
      yearId: '',
    });

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: actor.userId,
    });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const result = await db.reportCardSubjectComment.updateMany({
        where: {
          tenant_id: tenantId,
          class_id: args.classId,
          subject_id: args.subjectId,
          academic_period_id: args.academicPeriodId,
          finalised_at: null,
          comment_text: { not: '' },
        },
        data: {
          finalised_at: new Date(),
          finalised_by_user_id: actor.userId,
          is_ai_draft: false,
        },
      });
      return result.count;
    });
  }
}
