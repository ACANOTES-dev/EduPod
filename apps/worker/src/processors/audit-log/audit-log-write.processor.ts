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
const SYSTEM_UUID_SENTINEL = '00000000-0000-0000-0000-000000000000';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normaliseUuid(value: string | null | undefined): string | undefined {
  if (!value || !UUID_RE.test(value)) return undefined;
  return value;
}

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
    const cleanTenantId = normaliseUuid(tenantId);
    const cleanActorUserId = normaliseUuid(actorUserId);
    const cleanEntityId = normaliseUuid(entityId);

    try {
      await this.prisma.$transaction(async (tx) => {
        // RLS policies on audit_logs reference current_setting('app.current_tenant_id');
        // PostgreSQL raises 42704 if the GUC is missing, so always set it — using the
        // zero-UUID sentinel for platform-level actions where tenantId is null (the
        // policy's `tenant_id IS NULL OR …` branch still matches those rows).
        const rlsTenantId = cleanTenantId ?? SYSTEM_UUID_SENTINEL;
        const rlsUserId = cleanActorUserId ?? SYSTEM_UUID_SENTINEL;
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${rlsTenantId}::text, true)`;
        await tx.$executeRaw`SELECT set_config('app.current_user_id', ${rlsUserId}::text, true)`;

        await tx.auditLog.create({
          data: {
            tenant_id: cleanTenantId,
            actor_user_id: cleanActorUserId,
            entity_type: entityType,
            entity_id: cleanEntityId,
            action: normalizedAction,
            metadata_json: metadata as Prisma.InputJsonValue,
            ip_address: ipAddress,
          },
        });
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to write audit log: entity_type=${entityType} action=${action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
