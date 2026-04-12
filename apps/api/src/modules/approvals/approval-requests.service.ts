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

import { createRlsClient } from '../../common/middleware/rls.middleware';
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

interface PendingDecisionUpdate {
  status: 'approved' | 'rejected' | 'cancelled';
  approver_user_id?: string;
  decided_at: Date;
  decision_comment: string | null;
  callback_status?: 'pending';
  callback_attempts?: number;
  callback_error?: string | null;
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

  // ─── Atomic decision helpers ───────────────────────────────────────────────

  private async transitionPendingRequest(
    tenantId: string,
    requestId: string,
    actorUserId: string,
    data: PendingDecisionUpdate,
  ): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: actorUserId,
    });

    const result = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const updateResult = await db.approvalRequest.updateMany({
        where: {
          id: requestId,
          tenant_id: tenantId,
          status: 'pending_approval',
        },
        data,
      });

      if (updateResult.count > 0) {
        return { updated: true as const };
      }

      const latest = await db.approvalRequest.findFirst({
        where: {
          id: requestId,
          tenant_id: tenantId,
        },
        select: {
          status: true,
        },
      });

      return {
        updated: false as const,
        latestStatus: latest?.status ?? null,
      };
    });

    if (result.updated) {
      return;
    }

    if (result.latestStatus === null) {
      throw new NotFoundException({
        code: 'APPROVAL_REQUEST_NOT_FOUND',
        message: `Approval request with id "${requestId}" not found`,
      });
    }

    throw new ConflictException({
      code: 'APPROVAL_DECISION_CONFLICT',
      message:
        `Approval request with id "${requestId}" is no longer pending approval ` +
        `(current status: "${result.latestStatus}")`,
    });
  }

  private async markCallbackFailure(
    tenantId: string,
    requestId: string,
    actorUserId: string,
    errorMessage: string,
  ): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: actorUserId,
    });

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.approvalRequest.update({
        where: { id: requestId },
        data: {
          callback_status: 'failed',
          callback_error: `Enqueue failed: ${errorMessage}`,
        },
      });
    });
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

    await this.transitionPendingRequest(tenantId, requestId, approverUserId, {
      status: 'approved',
      approver_user_id: approverUserId,
      decided_at: new Date(),
      decision_comment: comment ?? null,
      ...(hasCallback
        ? {
            callback_status: 'pending',
            callback_attempts: 0,
            callback_error: null,
          }
        : {}),
    });

    if (callback) {
      try {
        // FIN-017: explicit retry policy — 5 attempts with exponential backoff
        // and a dedup jobId so retries coalesce. Without this a transient DB
        // blip during the callback leaves the entity stuck in pending_approval.
        await callback.queue.add(
          callback.jobName,
          {
            tenant_id: tenantId,
            approval_request_id: requestId,
            target_entity_id: request.target_entity_id,
            approver_user_id: approverUserId,
          },
          {
            attempts: 5,
            backoff: { type: 'exponential', delay: 1000 },
            jobId: `approval-callback:${requestId}`,
          },
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to enqueue callback for approval ${requestId}: ${errorMessage}`);
        await this.markCallbackFailure(tenantId, requestId, approverUserId, errorMessage);
      }
    }

    return this.getRequest(tenantId, requestId);
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

    await this.transitionPendingRequest(tenantId, requestId, approverUserId, {
      status: 'rejected',
      approver_user_id: approverUserId,
      decided_at: new Date(),
      decision_comment: comment ?? null,
    });

    return this.getRequest(tenantId, requestId);
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

    await this.transitionPendingRequest(tenantId, requestId, requesterUserId, {
      status: 'cancelled',
      decided_at: new Date(),
      decision_comment: comment ?? null,
    });

    return this.getRequest(tenantId, requestId);
  }

  /**
   * Manually retry a permanently-failed approval callback.
   * Resets callback_attempts to 0, re-enqueues the domain job.
   * Only valid for approved requests whose callback is stuck (failed or stale pending).
   * Returns early with a message if the callback has already completed successfully.
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

    // ─── Idempotency guard ────────────────────────────────────────────────────
    if (request.callback_status === 'executed') {
      return {
        message: 'Callback already executed successfully — no retry needed',
        id: requestId,
        callback_status: 'executed' as const,
      };
    }

    if (request.callback_status !== 'failed' && request.callback_status !== 'pending') {
      throw new BadRequestException({
        code: 'CALLBACK_NOT_RETRYABLE',
        message: `Cannot retry callback with status "${request.callback_status}" — must be "failed" or "pending"`,
      });
    }

    // For pending callbacks, only allow retry if stale (> 30 minutes old)
    if (request.callback_status === 'pending' && request.decided_at) {
      const staleThresholdMs = 30 * 60 * 1000;
      const decidedAt = new Date(request.decided_at).getTime();
      if (Date.now() - decidedAt < staleThresholdMs) {
        throw new BadRequestException({
          code: 'CALLBACK_NOT_STALE',
          message:
            'Callback is still pending and not yet past the stale threshold (30 minutes) — retry not allowed',
        });
      }
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

  // ─── Bulk retry for stuck callbacks ───────────────────────────────────────

  /**
   * Bulk-retry stuck approval callbacks.
   * Finds approved requests with failed or pending (stale) callback_status,
   * re-enqueues each one, and returns a summary.
   */
  async bulkRetryCallbacks(
    tenantId: string,
    statusFilter?: 'failed' | 'pending',
    maxCount = 50,
  ): Promise<{ retried: number; skipped: number }> {
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000);

    const callbackStatusFilter = statusFilter ? [statusFilter] : ['failed', 'pending'];

    const stuckRequests = await this.prisma.approvalRequest.findMany({
      where: {
        tenant_id: tenantId,
        status: 'approved',
        callback_status: { in: callbackStatusFilter },
        decided_at: { lt: staleThreshold },
      },
      select: {
        id: true,
        action_type: true,
        target_entity_id: true,
        approver_user_id: true,
        callback_status: true,
      },
      orderBy: { decided_at: 'asc' },
      take: maxCount,
    });

    let retried = 0;
    let skipped = 0;

    for (const req of stuckRequests) {
      const mapping = this.modeACallbacks[req.action_type];
      if (!mapping) {
        skipped++;
        continue;
      }

      try {
        await this.prisma.approvalRequest.update({
          where: { id: req.id },
          data: {
            callback_status: 'pending',
            callback_attempts: 0,
            callback_error: null,
          },
        });

        await mapping.queue.add(mapping.jobName, {
          tenant_id: tenantId,
          approval_request_id: req.id,
          target_entity_id: req.target_entity_id,
          approver_user_id: req.approver_user_id,
        });

        retried++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(`Bulk retry failed for approval ${req.id}: ${errorMessage}`);
        await this.prisma.approvalRequest.update({
          where: { id: req.id },
          data: {
            callback_status: 'failed',
            callback_error: `Bulk retry enqueue failed: ${errorMessage}`,
          },
        });
        skipped++;
      }
    }

    this.logger.log(`Bulk callback retry: ${retried} retried, ${skipped} skipped`);

    return { retried, skipped };
  }

  // ─── Callback health summary ──────────────────────────────────────────────

  /**
   * Returns a summary of callback statuses for approved requests in this tenant.
   */
  async getCallbackHealth(
    tenantId: string,
  ): Promise<{ pending: number; failed: number; executed: number; total: number }> {
    const [pending, failed, executed, total] = await Promise.all([
      this.prisma.approvalRequest.count({
        where: { tenant_id: tenantId, status: 'approved', callback_status: 'pending' },
      }),
      this.prisma.approvalRequest.count({
        where: { tenant_id: tenantId, status: 'approved', callback_status: 'failed' },
      }),
      this.prisma.approvalRequest.count({
        where: { tenant_id: tenantId, status: 'approved', callback_status: 'executed' },
      }),
      this.prisma.approvalRequest.count({
        where: { tenant_id: tenantId, status: 'approved', callback_status: { not: null } },
      }),
    ]);

    return { pending, failed, executed, total };
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
