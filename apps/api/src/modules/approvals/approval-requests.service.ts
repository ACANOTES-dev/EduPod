import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';

import type { ApprovalActionType, ApprovalRequestStatus } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

// ─── Mode A callback mapping ─────────────────────────────────────────────

interface CallbackMapping {
  queue: Queue;
  jobName: string;
}

function buildModeACallbacks(
  notificationsQueue: Queue,
  financeQueue: Queue,
  payrollQueue: Queue,
): Record<string, CallbackMapping> {
  return {
    announcement_publish: { queue: notificationsQueue, jobName: 'communications:on-approval' },
    invoice_issue: { queue: financeQueue, jobName: 'finance:on-approval' },
    payroll_finalise: { queue: payrollQueue, jobName: 'payroll:on-approval' },
  };
}

interface ListRequestsFilters {
  page: number;
  pageSize: number;
  status?: ApprovalRequestStatus;
  callback_status?: string;
}

@Injectable()
export class ApprovalRequestsService {
  private readonly logger = new Logger(ApprovalRequestsService.name);
  private readonly modeACallbacks: Record<string, CallbackMapping>;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    @InjectQueue('finance') private readonly financeQueue: Queue,
    @InjectQueue('payroll') private readonly payrollQueue: Queue,
  ) {
    this.modeACallbacks = buildModeACallbacks(notificationsQueue, financeQueue, payrollQueue);
  }

  /**
   * List approval requests for a tenant, with pagination and optional status filter.
   */
  async listRequests(tenantId: string, filters: ListRequestsFilters) {
    const { page, pageSize, status, callback_status } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (status) {
      where.status = status;
    }
    if (callback_status) {
      where.callback_status = callback_status;
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
  async approve(tenantId: string, requestId: string, approverUserId: string, comment?: string) {
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

    // Mode A: Auto-execute on approval
    const callback = this.modeACallbacks[request.action_type];
    const hasCallback = !!callback;

    const updated = await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        approver_user_id: approverUserId,
        decided_at: new Date(),
        decision_comment: comment ?? null,
        // Track callback dispatch status for reconciliation
        ...(hasCallback ? { callback_status: 'pending', callback_attempts: 0 } : {}),
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

    if (callback) {
      try {
        await callback.queue.add(callback.jobName, {
          tenant_id: tenantId,
          approval_request_id: requestId,
          target_entity_id: request.target_entity_id,
          approver_user_id: approverUserId,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to enqueue callback for approval ${requestId}: ${errorMessage}`);
        // Mark callback as failed so reconciliation can retry
        await this.prisma.approvalRequest.update({
          where: { id: requestId },
          data: {
            callback_status: 'failed',
            callback_error: `Enqueue failed: ${errorMessage}`,
          },
        });
      }
    }

    return updated;
  }

  /**
   * Reject an approval request.
   */
  async reject(tenantId: string, requestId: string, approverUserId: string, comment?: string) {
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
  async cancel(tenantId: string, requestId: string, requesterUserId: string, comment?: string) {
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
   * Manually retry a permanently-failed approval callback.
   * Resets callback_attempts to 0, re-enqueues the domain job.
   * Only valid for approved requests with callback_status = 'failed'.
   */
  async retryCallback(tenantId: string, requestId: string) {
    const request = await this.prisma.approvalRequest.findFirst({
      where: { id: requestId, tenant_id: tenantId },
    });

    if (!request) {
      throw new NotFoundException({
        code: 'APPROVAL_REQUEST_NOT_FOUND',
        message: `Approval request with id "${requestId}" not found`,
      });
    }

    if (request.status !== 'approved') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot retry callback for a request with status "${request.status}" — must be "approved"`,
      });
    }

    if (request.callback_status !== 'failed') {
      throw new BadRequestException({
        code: 'CALLBACK_NOT_FAILED',
        message: `Cannot retry callback with status "${request.callback_status}" — must be "failed"`,
      });
    }

    const mapping = this.modeACallbacks[request.action_type];
    if (!mapping) {
      throw new BadRequestException({
        code: 'NO_CALLBACK_MAPPING',
        message: `Action type "${request.action_type}" does not have a callback mapping`,
      });
    }

    // Reset callback state
    await this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: {
        callback_status: 'pending',
        callback_attempts: 0,
        callback_error: null,
      },
    });

    // Re-enqueue the domain job
    try {
      await mapping.queue.add(mapping.jobName, {
        tenant_id: tenantId,
        approval_request_id: requestId,
        target_entity_id: request.target_entity_id,
        approver_user_id: request.approver_user_id,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to re-enqueue callback for approval ${requestId}: ${errorMessage}`);
      await this.prisma.approvalRequest.update({
        where: { id: requestId },
        data: {
          callback_status: 'failed',
          callback_error: `Manual retry enqueue failed: ${errorMessage}`,
        },
      });
      throw new BadRequestException({
        code: 'CALLBACK_ENQUEUE_FAILED',
        message: `Failed to enqueue callback: ${errorMessage}`,
      });
    }

    this.logger.log(`Manual callback retry for approval ${requestId} (${request.action_type})`);

    return this.getRequest(tenantId, requestId);
  }

  /**
   * Cross-module engine method: check if an approval is needed and create one if so.
   *
   * Called by other modules (e.g., payroll, admissions) before executing an action.
   * Accepts an optional transaction client (`db`) so callers already inside an RLS
   * transaction can keep the approval creation atomic with their domain state change.
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
    db?: PrismaService,
  ): Promise<{ approved: boolean; request_id?: string }> {
    const prisma = db ?? this.prisma;

    // Find active workflow for this action type
    const workflow = await prisma.approvalWorkflow.findFirst({
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

    // ─── R-22: Duplicate guard — reject if an open request already exists ───
    const existing = await prisma.approvalRequest.findFirst({
      where: {
        tenant_id: tenantId,
        target_entity_type: targetEntityType,
        target_entity_id: targetEntityId,
        action_type: actionType,
        status: { in: ['pending_approval'] },
      },
    });

    if (existing) {
      throw new ConflictException({
        code: 'DUPLICATE_APPROVAL_REQUEST',
        message: `An open approval request already exists for this ${targetEntityType}`,
      });
    }

    // Create approval request
    const request = await prisma.approvalRequest.create({
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
