import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, type PlatformAuditAction } from '@prisma/client';
import type Redis from 'ioredis';

import {
  type OwnerActionConfirmationDto,
  type OwnerActionConfirmationQuery,
  type SessionMetadata,
} from '@school/shared';

import { runWithRlsContext } from '../../common/middleware/rls.middleware';
import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PlatformUsersService } from '../platform-users/platform-users.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueManagementService } from '../queue-admin/queue-management.service';
import { RedisService } from '../redis/redis.service';
import { TenantsService } from '../tenants/tenants.service';

const ACTION_PERMISSIONS: Partial<Record<PlatformAuditAction, string>> = {
  backup_restore_drill_deleted: 'platform.backups.manage',
  backup_restore_drill_updated: 'platform.backups.manage',
  cache_flushed_global: 'platform.cache.flush_global',
  job_removed: 'platform.queues.clean',
  queue_cleaned: 'platform.queues.clean',
  session_force_logged_out_tenant: 'platform.sessions.force_logout_tenant',
  tenant_archive: 'platform.tenants.archive',
  tenant_ownership_transferred: 'platform.users.transfer_ownership',
};

type ExecutorInput = {
  actorUserId: string;
  payload: unknown;
  targetResourceId?: string;
  targetTenantId?: string;
};

type Executor = (input: ExecutorInput) => Promise<Record<string, unknown>>;

export type OwnerActionConfirmationRow = Prisma.PlatformOwnerActionConfirmationGetPayload<{
  include: { actor: { select: { email: true; first_name: true; last_name: true } } };
}>;

@Injectable()
export class OwnerActionConfirmationService {
  private readonly executors: Partial<Record<PlatformAuditAction, Executor>>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformUsersService: PlatformUsersService,
    private readonly platformAuditService: PlatformAuditService,
    private readonly redisService: RedisService,
    private readonly tenantsService: TenantsService,
    private readonly queueManagementService: QueueManagementService,
  ) {
    this.executors = {
      backup_restore_drill_deleted: (input) => this.deleteRestoreDrill(input),
      backup_restore_drill_updated: (input) => this.confirmRestoreDrillUpdate(input),
      cache_flushed_global: (input) => this.flushGlobalCache(input),
      job_removed: (input) => this.removeQueueJob(input),
      queue_cleaned: (input) => this.cleanQueue(input),
      session_force_logged_out_tenant: (input) => this.forceLogoutTenant(input),
      tenant_archive: (input) => this.archiveTenant(input),
      tenant_ownership_transferred: (input) => this.transferTenantOwnership(input),
    };
  }

  getRegisteredExecutorActions(): PlatformAuditAction[] {
    return Object.keys(this.executors) as PlatformAuditAction[];
  }

  async confirmAndExecute(
    input: OwnerActionConfirmationDto,
    actorUserId: string,
    audit: PlatformAuditContext,
  ): Promise<{ confirmation_id: string; execution_status: 'executed' | 'failed' }> {
    const executor = this.executors[input.action];
    const requiredPermission = ACTION_PERMISSIONS[input.action];
    if (!executor || !requiredPermission) {
      throw new BadRequestException({
        code: 'ACTION_EXECUTOR_NOT_REGISTERED',
        message: `No owner-confirmed executor is registered for "${input.action}".`,
      });
    }

    const hasPermission = await this.platformUsersService.hasPermission(
      actorUserId,
      requiredPermission,
    );
    if (!hasPermission) {
      throw new BadRequestException({
        code: 'OWNER_ACTION_PERMISSION_DENIED',
        message: 'You do not have permission to execute this owner-confirmed action.',
      });
    }

    if (input.typed_confirmation !== input.confirmation_phrase) {
      throw new BadRequestException({
        code: 'CONFIRMATION_PHRASE_MISMATCH',
        message: 'Typed confirmation phrase does not match.',
      });
    }

    const confirmation = await this.prisma.platformOwnerActionConfirmation.create({
      data: {
        actor_user_id: actorUserId,
        action: input.action,
        target_resource_type: input.target_resource_type,
        target_resource_id: input.target_resource_id,
        target_tenant_id: input.target_tenant_id,
        payload_summary: toJson(input.payload),
        confirmation_phrase: input.confirmation_phrase,
        reason: input.reason,
      },
    });

    await this.platformAuditService.log({
      ...audit,
      action: input.action,
      target_resource_type: input.target_resource_type,
      target_resource_id: input.target_resource_id,
      target_tenant_id: input.target_tenant_id,
      payload: {
        extra: {
          confirmation_id: confirmation.id,
          payload_summary: input.payload,
          required_permission: requiredPermission,
        },
      },
      reason: input.reason,
    });

    try {
      const result = await executor({
        actorUserId,
        payload: input.payload,
        targetResourceId: input.target_resource_id,
        targetTenantId: input.target_tenant_id,
      });
      await this.prisma.platformOwnerActionConfirmation.update({
        where: { id: confirmation.id },
        data: {
          executed_at: new Date(),
          execution_status: 'executed',
          execution_result: toJson(result),
        },
      });
      return { confirmation_id: confirmation.id, execution_status: 'executed' };
    } catch (err: unknown) {
      await this.prisma.platformOwnerActionConfirmation.update({
        where: { id: confirmation.id },
        data: {
          executed_at: new Date(),
          execution_status: 'failed',
          execution_result: toJson({ error: err instanceof Error ? err.message : String(err) }),
        },
      });
      return { confirmation_id: confirmation.id, execution_status: 'failed' };
    }
  }

  async list(query: OwnerActionConfirmationQuery): Promise<{
    data: OwnerActionConfirmationRow[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await Promise.all([
      this.prisma.platformOwnerActionConfirmation.findMany({
        orderBy: { confirmed_at: 'desc' },
        skip,
        take: query.pageSize,
        include: {
          actor: { select: { email: true, first_name: true, last_name: true } },
        },
      }),
      this.prisma.platformOwnerActionConfirmation.count(),
    ]);

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  private async flushGlobalCache(_input: ExecutorInput): Promise<Record<string, unknown>> {
    const deletedCount = await deleteRedisPatterns(this.redisService.getClient(), [
      'analytics:*',
      'behaviour:points:*',
      'behaviour:pulse:*',
      'email-domain:verified:*',
      'permissions:*',
      'preview:*',
      'reports:*',
      'tenant:*:user:*:unread_notifications',
      'tenant_domain:*',
      'tenant_modules:*',
      'transcript:*',
    ]);
    return { deleted_count: deletedCount };
  }

  private async deleteRestoreDrill(input: ExecutorInput): Promise<Record<string, unknown>> {
    const drillId =
      input.targetResourceId ?? readString(asRecord(input.payload), 'restore_drill_id');
    if (!drillId) {
      throw new BadRequestException({
        code: 'RESTORE_DRILL_REQUIRED',
        message: 'Restore drill id is required.',
      });
    }
    const existing = await this.prisma.platformRestoreDrill.findUnique({ where: { id: drillId } });
    if (!existing) {
      return { restore_drill_id: drillId, deleted: false };
    }
    await this.prisma.platformRestoreDrill.delete({ where: { id: drillId } });
    return { restore_drill_id: drillId, deleted: true };
  }

  private async confirmRestoreDrillUpdate(input: ExecutorInput): Promise<Record<string, unknown>> {
    const drillId =
      input.targetResourceId ?? readString(asRecord(input.payload), 'restore_drill_id');
    if (!drillId) {
      throw new BadRequestException({
        code: 'RESTORE_DRILL_REQUIRED',
        message: 'Restore drill id is required.',
      });
    }
    const existing = await this.prisma.platformRestoreDrill.findUnique({ where: { id: drillId } });
    if (!existing) {
      throw new BadRequestException({
        code: 'RESTORE_DRILL_NOT_FOUND',
        message: 'Restore drill was not found.',
      });
    }
    return { restore_drill_id: drillId, destructive_update_confirmed: true };
  }

  private async cleanQueue(input: ExecutorInput): Promise<Record<string, unknown>> {
    const payload = asRecord(input.payload);
    const queueName = readString(payload, 'queue') ?? input.targetResourceId;
    if (!queueName) {
      throw new BadRequestException({
        code: 'QUEUE_REQUIRED',
        message: 'Queue name is required.',
      });
    }
    const status = readQueueCleanStatus(payload);
    const graceMs = readNumber(payload, 'grace_ms') ?? 0;
    const limit = Math.min(1000, Math.max(1, readNumber(payload, 'limit') ?? 100));
    const cleaned = await this.queueManagementService.cleanQueue(queueName, {
      grace_ms: graceMs,
      limit,
      status,
    });
    return { queue: queueName, status, cleaned_job_ids: cleaned.job_ids };
  }

  private async removeQueueJob(input: ExecutorInput): Promise<Record<string, unknown>> {
    const payload = asRecord(input.payload);
    const queueName = readString(payload, 'queue');
    const jobId = readString(payload, 'job_id') ?? input.targetResourceId;
    if (!queueName || !jobId) {
      throw new BadRequestException({
        code: 'QUEUE_JOB_REQUIRED',
        message: 'Queue name and job id are required.',
      });
    }
    const removed = await this.queueManagementService.removeJob(queueName, jobId);
    return { queue: queueName, job_id: jobId, ...removed };
  }

  private async archiveTenant(input: ExecutorInput): Promise<Record<string, unknown>> {
    const tenantId = input.targetTenantId ?? input.targetResourceId;
    if (!tenantId) {
      throw new BadRequestException({
        code: 'TENANT_REQUIRED',
        message: 'Tenant id is required.',
      });
    }
    const archived = await this.tenantsService.archiveTenant(tenantId, input.actorUserId);
    return { tenant_id: archived.id, status: archived.status };
  }

  private async forceLogoutTenant(input: ExecutorInput): Promise<Record<string, unknown>> {
    const tenantId = input.targetTenantId ?? input.targetResourceId;
    if (!tenantId) {
      throw new BadRequestException({
        code: 'TENANT_REQUIRED',
        message: 'Tenant id is required.',
      });
    }
    const deletedSessions = await deleteSessionsForTenant(this.redisService.getClient(), tenantId);
    return { tenant_id: tenantId, deleted_sessions: deletedSessions };
  }

  private async transferTenantOwnership(input: ExecutorInput): Promise<Record<string, unknown>> {
    const payload = asRecord(input.payload);
    const tenantId = input.targetTenantId ?? readString(payload, 'tenant_id');
    const fromUserId = readString(payload, 'from_user_id');
    const toUserId = readString(payload, 'to_user_id');
    if (!tenantId || !fromUserId || !toUserId) {
      throw new BadRequestException({
        code: 'OWNERSHIP_TRANSFER_PAYLOAD_REQUIRED',
        message: 'tenant_id, from_user_id, and to_user_id are required.',
      });
    }

    await runWithRlsContext(
      this.prisma,
      { tenant_id: tenantId, user_id: input.actorUserId },
      async (tx) => {
        const ownerRole = await tx.role.findFirst({
          where: { tenant_id: tenantId, role_key: 'school_owner' },
          select: { id: true },
        });
        if (!ownerRole) {
          throw new BadRequestException({
            code: 'SCHOOL_OWNER_ROLE_NOT_FOUND',
            message: 'School owner role was not found for this tenant.',
          });
        }

        const [fromMembership, toMembership] = await Promise.all([
          tx.tenantMembership.findUnique({
            where: {
              idx_tenant_memberships_tenant_user: { tenant_id: tenantId, user_id: fromUserId },
            },
            select: { id: true },
          }),
          tx.tenantMembership.findUnique({
            where: {
              idx_tenant_memberships_tenant_user: { tenant_id: tenantId, user_id: toUserId },
            },
            select: { id: true },
          }),
        ]);

        if (!fromMembership || !toMembership) {
          throw new BadRequestException({
            code: 'OWNERSHIP_TRANSFER_MEMBERSHIP_NOT_FOUND',
            message: 'Both users must have memberships at the tenant.',
          });
        }

        await tx.membershipRole.upsert({
          where: {
            membership_id_role_id: {
              membership_id: toMembership.id,
              role_id: ownerRole.id,
            },
          },
          update: {},
          create: {
            membership_id: toMembership.id,
            role_id: ownerRole.id,
            tenant_id: tenantId,
          },
        });
        await tx.membershipRole.deleteMany({
          where: { membership_id: fromMembership.id, role_id: ownerRole.id, tenant_id: tenantId },
        });
      },
    );

    return { tenant_id: tenantId, from_user_id: fromUserId, to_user_id: toUserId };
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {}, jsonReplacer)) as Prisma.InputJsonValue;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

type QueueCleanStatus = 'completed' | 'failed';

function readQueueCleanStatus(record: Record<string, unknown>): QueueCleanStatus {
  const value = readString(record, 'status') ?? readString(record, 'state') ?? 'failed';
  if (value === 'completed' || value === 'failed') {
    return value;
  }
  throw new BadRequestException({
    code: 'INVALID_QUEUE_CLEAN_STATE',
    message: `Queue clean status "${value}" is not supported.`,
  });
}

async function deleteRedisPatterns(client: Redis, patterns: string[]): Promise<number> {
  let deleted = 0;
  for (const pattern of patterns) {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await client.del(...keys);
      }
    } while (cursor !== '0');
  }
  return deleted;
}

function isSessionMetadata(value: unknown): value is SessionMetadata {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.session_id === 'string' &&
    typeof record.user_id === 'string' &&
    (typeof record.tenant_id === 'string' || record.tenant_id === null)
  );
}

async function deleteSessionsForTenant(client: Redis, tenantId: string): Promise<number> {
  let deleted = 0;
  let cursor = '0';
  do {
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', 'session:*', 'COUNT', 200);
    cursor = nextCursor;
    for (const key of keys) {
      const raw = await client.get(key);
      if (!raw) continue;
      const parsed = parseSessionMetadata(raw);
      if (!isSessionMetadata(parsed) || parsed.tenant_id !== tenantId) continue;
      await client.del(key);
      await client.srem(`user_sessions:${parsed.user_id}`, parsed.session_id);
      deleted += 1;
    }
  } while (cursor !== '0');
  return deleted;
}

function parseSessionMetadata(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (err: unknown) {
    console.error('[parseSessionMetadata]', err);
    return null;
  }
}
