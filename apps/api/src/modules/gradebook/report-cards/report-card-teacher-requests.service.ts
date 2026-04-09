import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, ReportCardTeacherRequest, TeacherRequestStatus } from '@prisma/client';

import type { GenerationScope, TeacherRequestScope } from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { NotificationsService } from '../../communications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacReadFacade } from '../../rbac/rbac-read.facade';

import type {
  ApproveTeacherRequestDto,
  ListTeacherRequestsQuery,
  RejectTeacherRequestDto,
  SubmitTeacherRequestDto,
} from './dto/teacher-request.dto';
import { ReportCardGenerationService } from './report-card-generation.service';
import { ReportCommentWindowsService } from './report-comment-windows.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeacherRequestActor {
  userId: string;
  isAdmin: boolean;
}

export interface ApproveTeacherRequestResult {
  request: ReportCardTeacherRequest;
  resulting_window_id: string | null;
  resulting_run_id: string | null;
}

// ─── State transitions ──────────────────────────────────────────────────────
// pending → approved | rejected | cancelled
// approved → completed
// Every other transition is invalid.

const VALID_TRANSITIONS: Record<TeacherRequestStatus, TeacherRequestStatus[]> = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['completed'],
  rejected: [],
  completed: [],
  cancelled: [],
};

function assertTransitionAllowed(from: TeacherRequestStatus, to: TeacherRequestStatus): void {
  if (!VALID_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException({
      code: 'INVALID_REQUEST_TRANSITION',
      message: `Cannot transition teacher request from "${from}" to "${to}"`,
    });
  }
}

// ─── Scope translation (teacher request → generation service) ──────────────
// The teacher-request scope shape is { scope: 'student' | 'class' | 'year_group',
// ids: string[] }, while the generation service consumes a discriminated union
// keyed on `mode`. This helper converts between them.

function requestScopeToGenerationScope(scope: TeacherRequestScope): GenerationScope {
  switch (scope.scope) {
    case 'student':
      return { mode: 'individual', student_ids: scope.ids };
    case 'class':
      return { mode: 'class', class_ids: scope.ids };
    case 'year_group':
      return { mode: 'year_group', year_group_ids: scope.ids };
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ReportCardTeacherRequestsService {
  private readonly logger = new Logger(ReportCardTeacherRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly notificationsService: NotificationsService,
    private readonly rbacReadFacade: RbacReadFacade,
    private readonly commentWindowsService: ReportCommentWindowsService,
    @Optional() private readonly generationService?: ReportCardGenerationService,
  ) {}

  // ─── Read ─────────────────────────────────────────────────────────────────

  async list(tenantId: string, actor: TeacherRequestActor, query: ListTeacherRequestsQuery) {
    const page = query.page;
    const pageSize = query.pageSize;

    const where: Prisma.ReportCardTeacherRequestWhereInput = { tenant_id: tenantId };
    if (query.status) where.status = query.status;
    if (query.request_type) where.request_type = query.request_type;

    // Non-admins may only see their own requests. If an admin explicitly
    // requests `my=true`, honour that filter too.
    if (!actor.isAdmin || query.my === true) {
      where.requested_by_user_id = actor.userId;
    }

    const [data, total] = await Promise.all([
      this.prisma.reportCardTeacherRequest.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.reportCardTeacherRequest.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  async listPendingForReviewer(tenantId: string) {
    return this.prisma.reportCardTeacherRequest.findMany({
      where: { tenant_id: tenantId, status: 'pending' },
      orderBy: { created_at: 'asc' },
    });
  }

  async findById(tenantId: string, actor: TeacherRequestActor, id: string) {
    const request = await this.prisma.reportCardTeacherRequest.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!request) {
      throw new NotFoundException({
        code: 'TEACHER_REQUEST_NOT_FOUND',
        message: `Teacher request with id "${id}" not found`,
      });
    }

    // Teachers may only read their own requests.
    if (!actor.isAdmin && request.requested_by_user_id !== actor.userId) {
      throw new ForbiddenException({
        code: 'TEACHER_REQUEST_FORBIDDEN',
        message: 'You can only view your own teacher requests',
      });
    }

    return request;
  }

  // ─── Write — teacher ─────────────────────────────────────────────────────

  async submit(
    tenantId: string,
    actor: TeacherRequestActor,
    dto: SubmitTeacherRequestDto,
  ): Promise<ReportCardTeacherRequest> {
    // Validate academic period belongs to tenant.
    const period = await this.academicReadFacade.findPeriodById(tenantId, dto.academic_period_id);
    if (!period) {
      throw new NotFoundException({
        code: 'ACADEMIC_PERIOD_NOT_FOUND',
        message: `Academic period "${dto.academic_period_id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const created = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCardTeacherRequest.create({
        data: {
          tenant_id: tenantId,
          requested_by_user_id: actor.userId,
          request_type: dto.request_type,
          academic_period_id: dto.academic_period_id,
          target_scope_json:
            dto.target_scope_json === undefined
              ? Prisma.JsonNull
              : (dto.target_scope_json as unknown as Prisma.InputJsonValue),
          reason: dto.reason,
          status: 'pending',
        },
      });
    });

    // Fire-and-forget notification to every admin. We intentionally do not
    // await inside the transaction — a notification failure must not roll the
    // request back.
    await this.notifyReviewersOnSubmit(tenantId, created).catch((err: unknown) => {
      this.logger.error(
        `Failed to notify reviewers for teacher request ${created.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return created;
  }

  async cancel(
    tenantId: string,
    actor: TeacherRequestActor,
    id: string,
  ): Promise<ReportCardTeacherRequest> {
    const existing = await this.prisma.reportCardTeacherRequest.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'TEACHER_REQUEST_NOT_FOUND',
        message: `Teacher request with id "${id}" not found`,
      });
    }

    // Server-side enforcement: teachers may only cancel their own pending
    // requests. Admins cannot cancel another teacher's request via this path —
    // they should reject it instead.
    if (existing.requested_by_user_id !== actor.userId) {
      throw new ForbiddenException({
        code: 'TEACHER_REQUEST_FORBIDDEN',
        message: 'You can only cancel your own teacher requests',
      });
    }

    assertTransitionAllowed(existing.status, 'cancelled');

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCardTeacherRequest.update({
        where: { id },
        data: { status: 'cancelled' },
      });
    });
  }

  // ─── Write — admin ───────────────────────────────────────────────────────

  async approve(
    tenantId: string,
    actor: TeacherRequestActor,
    id: string,
    dto: ApproveTeacherRequestDto,
  ): Promise<ApproveTeacherRequestResult> {
    const existing = await this.prisma.reportCardTeacherRequest.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'TEACHER_REQUEST_NOT_FOUND',
        message: `Teacher request with id "${id}" not found`,
      });
    }

    assertTransitionAllowed(existing.status, 'approved');

    // Optionally execute the downstream side-effect BEFORE flipping status,
    // so a failure leaves the request in `pending` rather than dangling in
    // `approved` with no resulting window/run.
    let resultingWindowId: string | null = null;
    let resultingRunId: string | null = null;

    if (dto.auto_execute === true) {
      if (existing.request_type === 'open_comment_window') {
        resultingWindowId = await this.autoExecuteOpenWindow(tenantId, actor, existing);
      } else if (existing.request_type === 'regenerate_reports') {
        resultingRunId = await this.autoExecuteRegenerate(tenantId, actor, existing);
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCardTeacherRequest.update({
        where: { id },
        data: {
          status: 'approved',
          reviewed_by_user_id: actor.userId,
          reviewed_at: new Date(),
          review_note: dto.review_note ?? null,
          resulting_window_id: resultingWindowId,
          resulting_run_id: resultingRunId,
        },
      });
    });

    await this.notifyAuthorOnDecision(tenantId, updated, 'approved').catch((err: unknown) => {
      this.logger.error(
        `Failed to notify author about approved request ${updated.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return {
      request: updated,
      resulting_window_id: resultingWindowId,
      resulting_run_id: resultingRunId,
    };
  }

  async reject(
    tenantId: string,
    actor: TeacherRequestActor,
    id: string,
    dto: RejectTeacherRequestDto,
  ): Promise<ReportCardTeacherRequest> {
    const existing = await this.prisma.reportCardTeacherRequest.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'TEACHER_REQUEST_NOT_FOUND',
        message: `Teacher request with id "${id}" not found`,
      });
    }

    assertTransitionAllowed(existing.status, 'rejected');

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCardTeacherRequest.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewed_by_user_id: actor.userId,
          reviewed_at: new Date(),
          review_note: dto.review_note,
        },
      });
    });

    await this.notifyAuthorOnDecision(tenantId, updated, 'rejected').catch((err: unknown) => {
      this.logger.error(
        `Failed to notify author about rejected request ${updated.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return updated;
  }

  async markCompleted(
    tenantId: string,
    _actor: TeacherRequestActor,
    id: string,
  ): Promise<ReportCardTeacherRequest> {
    const existing = await this.prisma.reportCardTeacherRequest.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'TEACHER_REQUEST_NOT_FOUND',
        message: `Teacher request with id "${id}" not found`,
      });
    }

    assertTransitionAllowed(existing.status, 'completed');

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reportCardTeacherRequest.update({
        where: { id },
        data: { status: 'completed' },
      });
    });
  }

  // ─── Auto-execute side-effects ───────────────────────────────────────────
  // These helpers run BEFORE the status update so a downstream failure leaves
  // the request in `pending`. Both delegate to the existing service so normal
  // permission, tenant, and state-machine guards still apply.

  private async autoExecuteOpenWindow(
    tenantId: string,
    actor: TeacherRequestActor,
    request: ReportCardTeacherRequest,
  ): Promise<string> {
    // Default window: opens immediately, closes in 7 days. The admin can
    // adjust via the UI if they'd rather pick custom dates — that path is the
    // `auto_execute = false` flow and is the preferred UX.
    const opensAt = new Date();
    const closesAt = new Date(opensAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    const window = await this.commentWindowsService.open(tenantId, actor.userId, {
      academic_period_id: request.academic_period_id,
      opens_at: opensAt.toISOString(),
      closes_at: closesAt.toISOString(),
      instructions: `Opened in response to teacher request #${request.id}`,
    });

    return window.id;
  }

  private async autoExecuteRegenerate(
    tenantId: string,
    actor: TeacherRequestActor,
    request: ReportCardTeacherRequest,
  ): Promise<string> {
    if (!this.generationService) {
      throw new BadRequestException({
        code: 'AUTO_EXECUTE_UNAVAILABLE',
        message: 'Report card generation service is not wired — cannot auto-execute regenerate',
      });
    }

    const scopeJson = request.target_scope_json as unknown as TeacherRequestScope | null;
    if (!scopeJson) {
      throw new BadRequestException({
        code: 'TEACHER_REQUEST_MISSING_SCOPE',
        message: 'Cannot auto-execute a regenerate request without target_scope_json',
      });
    }

    const { batch_job_id } = await this.generationService.generateRun(tenantId, actor.userId, {
      scope: requestScopeToGenerationScope(scopeJson),
      academic_period_id: request.academic_period_id,
      content_scope: 'grades_only',
      override_comment_gate: false,
    });

    return batch_job_id;
  }

  // ─── Notification helpers ────────────────────────────────────────────────

  private async notifyReviewersOnSubmit(
    tenantId: string,
    request: ReportCardTeacherRequest,
  ): Promise<void> {
    const reviewers = await this.rbacReadFacade.findMembershipsWithPermissionAndUser(
      tenantId,
      'report_cards.manage',
    );

    if (reviewers.length === 0) return;

    const recipients = reviewers.map((r) => ({
      tenant_id: tenantId,
      recipient_user_id: r.user_id,
      channel: 'in_app' as const,
      template_key: 'report_cards.teacher_request_submitted',
      locale: 'en',
      payload_json: {
        request_id: request.id,
        request_type: request.request_type,
        requested_by_user_id: request.requested_by_user_id,
        academic_period_id: request.academic_period_id,
      },
      source_entity_type: 'report_card_teacher_request',
      source_entity_id: request.id,
    }));

    await this.notificationsService.createBatch(tenantId, recipients);
  }

  private async notifyAuthorOnDecision(
    tenantId: string,
    request: ReportCardTeacherRequest,
    decision: 'approved' | 'rejected',
  ): Promise<void> {
    await this.notificationsService.createBatch(tenantId, [
      {
        tenant_id: tenantId,
        recipient_user_id: request.requested_by_user_id,
        channel: 'in_app',
        template_key:
          decision === 'approved'
            ? 'report_cards.teacher_request_approved'
            : 'report_cards.teacher_request_rejected',
        locale: 'en',
        payload_json: {
          request_id: request.id,
          request_type: request.request_type,
          decision,
          review_note: request.review_note,
          reviewed_by_user_id: request.reviewed_by_user_id,
        },
        source_entity_type: 'report_card_teacher_request',
        source_entity_id: request.id,
      },
    ]);
  }
}
