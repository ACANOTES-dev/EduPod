import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ApprovalActionType, ApprovalRequestStatus } from '@school/shared';
import type { Queue } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';

interface ListRequestsFilters {
  page: number;
  pageSize: number;
  status?: ApprovalRequestStatus;
}

@Injectable()
export class ApprovalRequestsService {
  private readonly logger = new Logger(ApprovalRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    @InjectQueue('finance') private readonly financeQueue: Queue,
    @InjectQueue('payroll') private readonly payrollQueue: Queue,
  ) {}

  /**
   * List approval requests for a tenant, with pagination and optional status filter.
   */
  async listRequests(tenantId: string, filters: ListRequestsFilters) {
    const { page, pageSize, status } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (status) {
      where.status = status;
    }

    const [requests, total] = await Promise.all([
      this.prisma.approvalRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          requester: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
          approver: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);

    return {
      data: requests,
      meta: { page, pageSize, total },
    };
  }

  /**
   * Get a single approval request with full details.
   */
  async getRequest(tenantId: string, requestId: string) {
    const request = await this.prisma.approvalRequest.findFirst({
      where: {
        id: requestId,
        tenant_id: tenantId,
      },
      include: {
        requester: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
        announcements: {
          select: {
            id: true,
            title: true,
            body_html: true,
            scope: true,
            status: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException({
        code: 'APPROVAL_REQUEST_NOT_FOUND',
        message: `Approval request with id "${requestId}" not found`,
      });
    }

    return request;
  }

  /**
   * Approve an approval request.
   */
  async approve(
    tenantId: string,
    requestId: string,
    approverUserId: string,
    comment?: string,
  ) {
    const request = await this.prisma.approvalRequest.findFirst({
      where: {
        id: requestId,
        tenant_id: tenantId,
      },
    });

    if (!request) {
      throw new NotFoundException({
        code: 'APPROVAL_REQUEST_NOT_FOUND',
        message: `Approval request with id "${requestId}" not found`,
      });
    }

    if (request.status !== 'pending_approval') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot approve a request with status "${request.status}"`,
      });
    }

    if (request.requester_user_id === approverUserId) {
      throw new BadRequestException({
        code: 'SELF_APPROVAL_BLOCKED',
        message: 'Cannot approve your own request',
      });
    }

    const updated = await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        approver_user_id: approverUserId,
        decided_at: new Date(),
        decision_comment: comment ?? null,
      },
      include: {
        requester: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });

    // Mode A: Auto-execute on approval
    const MODE_A_CALLBACKS: Record<string, { queue: Queue; jobName: string }> = {
      announcement_publish: { queue: this.notificationsQueue, jobName: 'communications:on-approval' },
      invoice_issue: { queue: this.financeQueue, jobName: 'finance:on-approval' },
      payroll_finalise: { queue: this.payrollQueue, jobName: 'payroll:on-approval' },
    };

    const callback = MODE_A_CALLBACKS[request.action_type];
    if (callback) {
      await callback.queue.add(callback.jobName, {
        tenant_id: tenantId,
        approval_request_id: requestId,
        target_entity_id: request.target_entity_id,
        approver_user_id: approverUserId,
      });
    }

    return updated;
  }

  /**
   * Reject an approval request.
   */
  async reject(
    tenantId: string,
    requestId: string,
    approverUserId: string,
    comment?: string,
  ) {
    const request = await this.prisma.approvalRequest.findFirst({
      where: {
        id: requestId,
        tenant_id: tenantId,
      },
    });

    if (!request) {
      throw new NotFoundException({
        code: 'APPROVAL_REQUEST_NOT_FOUND',
        message: `Approval request with id "${requestId}" not found`,
      });
    }

    if (request.status !== 'pending_approval') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot reject a request with status "${request.status}"`,
      });
    }

    if (request.requester_user_id === approverUserId) {
      throw new BadRequestException({
        code: 'SELF_REJECTION_BLOCKED',
        message: 'Cannot reject your own request',
      });
    }

    const updated = await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        approver_user_id: approverUserId,
        decided_at: new Date(),
        decision_comment: comment ?? null,
      },
      include: {
        requester: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });

    return updated;
  }

  /**
   * Cancel an approval request. Only the requester can cancel.
   */
  async cancel(
    tenantId: string,
    requestId: string,
    requesterUserId: string,
    comment?: string,
  ) {
    const request = await this.prisma.approvalRequest.findFirst({
      where: {
        id: requestId,
        tenant_id: tenantId,
      },
    });

    if (!request) {
      throw new NotFoundException({
        code: 'APPROVAL_REQUEST_NOT_FOUND',
        message: `Approval request with id "${requestId}" not found`,
      });
    }

    if (request.status !== 'pending_approval') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot cancel a request with status "${request.status}"`,
      });
    }

    if (request.requester_user_id !== requesterUserId) {
      throw new ForbiddenException({
        code: 'NOT_REQUESTER',
        message: 'Only the requester can cancel their own request',
      });
    }

    const updated = await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: {
        status: 'cancelled',
        decision_comment: comment ?? null,
        decided_at: new Date(),
      },
      include: {
        requester: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });

    return updated;
  }

  /**
   * Cross-module engine method: check if an approval is needed and create one if so.
   *
   * Called by other modules (e.g., payroll, admissions) before executing an action.
   *
   * Returns:
   *   { approved: true } — no workflow or user has direct authority, proceed
   *   { approved: false, request_id: string } — approval needed, request created
   */
  async checkAndCreateIfNeeded(
    tenantId: string,
    actionType: string,
    targetEntityType: string,
    targetEntityId: string,
    requesterId: string,
    hasDirectAuthority: boolean,
  ): Promise<{ approved: boolean; request_id?: string }> {
    // Find active workflow for this action type
    const workflow = await this.prisma.approvalWorkflow.findFirst({
      where: {
        tenant_id: tenantId,
        action_type: actionType as ApprovalActionType,
        is_enabled: true,
      },
    });

    // No workflow or disabled: auto-approve
    if (!workflow) {
      return { approved: true };
    }

    // Direct authority (e.g., school_owner): auto-approve
    if (hasDirectAuthority) {
      return { approved: true };
    }

    // Create approval request
    const request = await this.prisma.approvalRequest.create({
      data: {
        tenant_id: tenantId,
        action_type: actionType,
        target_entity_type: targetEntityType,
        target_entity_id: targetEntityId,
        requester_user_id: requesterId,
        status: 'pending_approval',
      },
    });

    return { approved: false, request_id: request.id };
  }
}
