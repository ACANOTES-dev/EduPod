import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { PrismaService } from '../../prisma/prisma.service';

import type { CreateOverallCommentDto, UpdateOverallCommentDto } from './dto/overall-comment.dto';
import type { CommentActor } from './report-card-subject-comments.service';
import { ReportCommentWindowsService } from './report-comment-windows.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ListOverallCommentsQuery {
  class_id?: string;
  /** Non-null for per-period rows, or the literal 'full_year' to filter to NULL-period rows. */
  academic_period_id?: string | 'full_year';
  academic_year_id?: string;
  student_id?: string;
  author_user_id?: string;
  finalised?: boolean;
  page?: number;
  pageSize?: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ReportCardOverallCommentsService {
  private readonly logger = new Logger(ReportCardOverallCommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly windowsService: ReportCommentWindowsService,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  // ─── Read ─────────────────────────────────────────────────────────────────

  async list(tenantId: string, query: ListOverallCommentsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.ReportCardOverallCommentWhereInput = { tenant_id: tenantId };
    if (query.class_id) where.class_id = query.class_id;
    if (query.academic_period_id === 'full_year') {
      where.academic_period_id = null;
    } else if (query.academic_period_id) {
      where.academic_period_id = query.academic_period_id;
    }
    if (query.academic_year_id) where.academic_year_id = query.academic_year_id;
    if (query.student_id) where.student_id = query.student_id;
    if (query.author_user_id) where.author_user_id = query.author_user_id;
    if (query.finalised === true) where.finalised_at = { not: null };
    if (query.finalised === false) where.finalised_at = null;

    const [data, total] = await Promise.all([
      this.prisma.reportCardOverallComment.findMany({
        where,
        orderBy: [{ student_id: 'asc' }, { created_at: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.reportCardOverallComment.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  async findById(tenantId: string, id: string) {
    const row = await this.prisma.reportCardOverallComment.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'OVERALL_COMMENT_NOT_FOUND',
        message: `Overall comment "${id}" not found`,
      });
    }
    return row;
  }

  async findOne(
    tenantId: string,
    args: {
      studentId: string;
      /** Non-null for per-period lookup; null selects the full-year row. */
      academicPeriodId: string | null;
      /** Required when academicPeriodId is null to disambiguate year. */
      academicYearId?: string;
    },
  ) {
    const scopeWhere: Prisma.ReportCardOverallCommentWhereInput =
      args.academicPeriodId !== null
        ? { academic_period_id: args.academicPeriodId }
        : {
            academic_period_id: null,
            ...(args.academicYearId ? { academic_year_id: args.academicYearId } : {}),
          };

    return this.prisma.reportCardOverallComment.findFirst({
      where: {
        tenant_id: tenantId,
        student_id: args.studentId,
        ...scopeWhere,
      },
    });
  }

  // ─── Authorship check ────────────────────────────────────────────────────

  /**
   * Verify the actor is the homeroom teacher for the class. Admins bypass.
   */
  private async assertHomeroomTeacher(
    tenantId: string,
    actor: CommentActor,
    classId: string,
  ): Promise<void> {
    if (actor.isAdmin) return;

    const classes = (await this.classesReadFacade.findClassesGeneric(
      tenantId,
      { id: classId },
      {
        id: true,
        homeroom_teacher: { select: { user_id: true } },
      },
    )) as Array<{ id: string; homeroom_teacher: { user_id: string } | null }>;

    const cls = classes[0];
    if (!cls) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class "${classId}" not found`,
      });
    }
    if (!cls.homeroom_teacher || cls.homeroom_teacher.user_id !== actor.userId) {
      throw new ForbiddenException({
        code: 'INVALID_AUTHOR',
        message: 'Only the homeroom teacher can author the overall comment for this class',
      });
    }
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  async upsert(tenantId: string, actor: CommentActor, dto: CreateOverallCommentDto) {
    // Authorship BEFORE window check
    await this.assertHomeroomTeacher(tenantId, actor, dto.class_id);

    // Phase 1b — Option B: resolve period/year combination. The scope-aware
    // helper validates exactly one is provided and returns both IDs.
    const scope = await this.windowsService.resolveCommentScope(tenantId, {
      academic_period_id: dto.academic_period_id,
      academic_year_id: dto.academic_year_id,
    });
    await this.windowsService.assertWindowOpen(tenantId, scope);

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: actor.userId,
    });

    const existingScopeWhere: Prisma.ReportCardOverallCommentWhereInput =
      scope.periodId !== null
        ? { academic_period_id: scope.periodId }
        : { academic_period_id: null, academic_year_id: scope.yearId };

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const existing = await db.reportCardOverallComment.findFirst({
        where: {
          tenant_id: tenantId,
          student_id: dto.student_id,
          ...existingScopeWhere,
        },
      });

      if (existing) {
        return db.reportCardOverallComment.update({
          where: { id: existing.id },
          data: {
            comment_text: dto.comment_text,
            finalised_at: null,
            finalised_by_user_id: null,
            author_user_id: actor.userId,
          },
        });
      }

      return db.reportCardOverallComment.create({
        data: {
          tenant_id: tenantId,
          student_id: dto.student_id,
          class_id: dto.class_id,
          academic_period_id: scope.periodId,
          academic_year_id: scope.yearId,
          author_user_id: actor.userId,
          comment_text: dto.comment_text,
        },
      });
    });
  }

  async updateText(
    tenantId: string,
    actor: CommentActor,
    id: string,
    dto: UpdateOverallCommentDto,
  ) {
    const existing = await this.findById(tenantId, id);
    await this.assertHomeroomTeacher(tenantId, actor, existing.class_id);
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
      return db.reportCardOverallComment.update({
        where: { id },
        data: {
          comment_text: dto.comment_text,
          finalised_at: null,
          finalised_by_user_id: null,
          author_user_id: actor.userId,
        },
      });
    });
  }

  async finalise(tenantId: string, actor: CommentActor, id: string) {
    const existing = await this.findById(tenantId, id);
    await this.assertHomeroomTeacher(tenantId, actor, existing.class_id);
    await this.windowsService.assertWindowOpen(tenantId, {
      periodId: existing.academic_period_id,
      yearId: existing.academic_year_id,
    });

    if (!existing.comment_text || existing.comment_text.trim().length === 0) {
      throw new ForbiddenException({
        code: 'CANNOT_FINALISE_EMPTY_COMMENT',
        message: 'Cannot finalise an overall comment with empty text',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: actor.userId,
    });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCardOverallComment.update({
        where: { id },
        data: {
          finalised_at: new Date(),
          finalised_by_user_id: actor.userId,
        },
      });
    });
  }

  async unfinalise(tenantId: string, actor: CommentActor, id: string) {
    const existing = await this.findById(tenantId, id);
    await this.assertHomeroomTeacher(tenantId, actor, existing.class_id);
    await this.windowsService.assertWindowOpen(tenantId, {
      periodId: existing.academic_period_id,
      yearId: existing.academic_year_id,
    });

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
      return db.reportCardOverallComment.update({
        where: { id },
        data: { finalised_at: null, finalised_by_user_id: null },
      });
    });
  }
}
