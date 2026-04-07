import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Valid assessment statuses that allow unlock requests ──────────────────────
const UNLOCKABLE_STATUSES = new Set(['submitted_locked', 'final_locked']);

@Injectable()
export class UnlockRequestService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create unlock request ────────────────────────────────────────────────────

  /**
   * Teacher requests an unlock for a locked assessment.
   * Sets the assessment status to 'unlock_requested' and creates a pending request.
   */
  async create(tenantId: string, assessmentId: string, userId: string, reason: string) {
    // 1. Verify assessment exists
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!assessment) {
      throw new NotFoundException({
        code: 'ASSESSMENT_NOT_FOUND',
        message: `Assessment with id "${assessmentId}" not found`,
      });
    }

    // 2. Assessment must be in a locked status
    if (!UNLOCKABLE_STATUSES.has(assessment.status)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: 'Can only request unlock for locked assessments',
      });
    }

    // 3. No pending unlock request should already exist
    const existingPending = await this.prisma.assessmentUnlockRequest.findFirst({
      where: {
        tenant_id: tenantId,
        assessment_id: assessmentId,
        status: 'pending',
      },
      select: { id: true },
    });

    if (existingPending) {
      throw new BadRequestException({
        code: 'UNLOCK_ALREADY_PENDING',
        message: 'An unlock request is already pending for this assessment',
      });
    }

    // 4. Create request + transition assessment within same RLS transaction
    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const unlockRequest = await db.assessmentUnlockRequest.create({
        data: {
          tenant_id: tenantId,
          assessment_id: assessmentId,
          requested_by_user_id: userId,
          reason,
          status: 'pending',
        },
      });

      await db.assessment.update({
        where: { id: assessmentId },
        data: { status: 'unlock_requested' },
      });

      return unlockRequest;
    });
  }

  // ─── List pending requests (leadership view) ─────────────────────────────────

  /**
   * Returns paginated list of pending unlock requests for a tenant.
   * Includes assessment details and requester name.
   */
  async findPending(tenantId: string, params: { page: number; pageSize: number }) {
    const { page, pageSize } = params;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.assessmentUnlockRequest.findMany({
        where: { tenant_id: tenantId, status: 'pending' },
        include: {
          assessment: {
            select: {
              id: true,
              title: true,
              class_entity: { select: { name: true } },
              subject: { select: { name: true } },
            },
          },
          requested_by: {
            select: { first_name: true, last_name: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.assessmentUnlockRequest.count({
        where: { tenant_id: tenantId, status: 'pending' },
      }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── List requests by assessment ──────────────────────────────────────────────

  /**
   * Returns all unlock requests for a specific assessment, newest first.
   */
  async findByAssessment(tenantId: string, assessmentId: string) {
    return this.prisma.assessmentUnlockRequest.findMany({
      where: { tenant_id: tenantId, assessment_id: assessmentId },
      include: {
        requested_by: {
          select: { first_name: true, last_name: true },
        },
        reviewed_by: {
          select: { first_name: true, last_name: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  // ─── Review (approve / reject) ───────────────────────────────────────────────

  /**
   * Leadership approves or rejects an unlock request.
   * On approval the assessment moves to 'reopened'.
   * On rejection the assessment returns to 'submitted_locked'.
   */
  async review(
    tenantId: string,
    requestId: string,
    reviewerUserId: string,
    dto: { status: 'approved' | 'rejected'; rejection_reason?: string },
  ) {
    // 1. Find the unlock request
    const unlockRequest = await this.prisma.assessmentUnlockRequest.findFirst({
      where: { id: requestId, tenant_id: tenantId },
      select: { id: true, status: true, assessment_id: true },
    });

    if (!unlockRequest) {
      throw new NotFoundException({
        code: 'UNLOCK_REQUEST_NOT_FOUND',
        message: `Unlock request with id "${requestId}" not found`,
      });
    }

    // 2. Must be pending
    if (unlockRequest.status !== 'pending') {
      throw new BadRequestException({
        code: 'REQUEST_NOT_PENDING',
        message: 'Only pending unlock requests can be reviewed',
      });
    }

    // 3. Rejection requires a reason
    if (dto.status === 'rejected' && !dto.rejection_reason) {
      throw new BadRequestException({
        code: 'REJECTION_REASON_REQUIRED',
        message: 'A rejection reason is required when rejecting an unlock request',
      });
    }

    // 4. Update request + assessment within same RLS transaction
    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const updatedRequest = await db.assessmentUnlockRequest.update({
        where: { id: requestId },
        data: {
          status: dto.status,
          reviewed_by_user_id: reviewerUserId,
          reviewed_at: new Date(),
          rejection_reason: dto.rejection_reason ?? null,
        },
      });

      const newAssessmentStatus = dto.status === 'approved' ? 'reopened' : 'submitted_locked';

      await db.assessment.update({
        where: { id: unlockRequest.assessment_id },
        data: { status: newAssessmentStatus },
      });

      return updatedRequest;
    });
  }
}
