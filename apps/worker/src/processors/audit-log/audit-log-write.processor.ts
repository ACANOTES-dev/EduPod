import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const AUDIT_LOG_WRITE_JOB = 'audit-log:write';

// ─── Payload ──────────────────────────────────────────────────────────────────

export interface AuditLogWritePayload {
  tenantId: string | null;
  actorUserId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_AUDIT_ACTION_LENGTH = 100;

// ─── Processor ────────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.AUDIT_LOG, {
  lockDuration: 10_000,
  stalledInterval: 30_000,
  maxStalledCount: 2,
})
export class AuditLogWriteProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditLogWriteProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<AuditLogWritePayload>): Promise<void> {
    if (job.name !== AUDIT_LOG_WRITE_JOB) {
      return;
    }

    const { tenantId, actorUserId, entityType, entityId, action, metadata, ipAddress } = job.data;
    const normalizedAction =
      action.length > MAX_AUDIT_ACTION_LENGTH ? action.slice(0, MAX_AUDIT_ACTION_LENGTH) : action;

    try {
      await this.prisma.auditLog.create({
        data: {
          tenant_id: tenantId ?? undefined,
          actor_user_id: actorUserId ?? undefined,
          entity_type: entityType,
          entity_id: entityId ?? undefined,
          action: normalizedAction,
          metadata_json: metadata as Prisma.InputJsonValue,
          ip_address: ipAddress,
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to write audit log: entity_type=${entityType} action=${action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
