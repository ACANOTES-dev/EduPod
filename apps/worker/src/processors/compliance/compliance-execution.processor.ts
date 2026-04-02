import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { ComplianceAnonymisationCore } from '@school/prisma';
import type { AnonymisationCleanupPlan } from '@school/prisma';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { getRedisClient } from '../../base/redis.helpers';
import { deleteFromS3, uploadToS3 } from '../../base/s3.helpers';
import { deleteSearchDocument } from '../../base/search.helpers';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface ComplianceExecutionPayload extends TenantJobPayload {
  compliance_request_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const COMPLIANCE_EXECUTION_JOB = 'compliance:execute';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.IMPORTS, { lockDuration: 120_000 })
export class ComplianceExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(ComplianceExecutionProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<ComplianceExecutionPayload>): Promise<void> {
    if (job.name !== COMPLIANCE_EXECUTION_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${COMPLIANCE_EXECUTION_JOB} — tenant ${tenant_id}, request ${job.data.compliance_request_id}`,
    );

    const executionJob = new ComplianceExecutionJob(this.prisma);
    await executionJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

export class ComplianceExecutionJob extends TenantAwareJob<ComplianceExecutionPayload> {
  private readonly logger = new Logger(ComplianceExecutionJob.name);

  constructor(
    prisma: PrismaClient,
    private readonly anonymisationCore = new ComplianceAnonymisationCore(),
  ) {
    super(prisma);
  }

  protected async processJob(data: ComplianceExecutionPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, compliance_request_id } = data;

    // 1. Fetch compliance request
    const request = await tx.complianceRequest.findFirst({
      where: {
        id: compliance_request_id,
        tenant_id,
      },
    });

    if (!request) {
      throw new Error(
        `ComplianceRequest ${compliance_request_id} not found for tenant ${tenant_id}`,
      );
    }

    if (request.status === 'completed') {
      this.logger.warn(`ComplianceRequest ${compliance_request_id} already completed. Skipping.`);
      return;
    }

    // 2. Process based on request_type
    switch (request.request_type) {
      case 'access_export':
        await this.handleAccessExport(tx, tenant_id, request);
        break;
      case 'erasure':
        await this.handleErasure(tx, tenant_id, request);
        break;
      case 'rectification':
        // Rectification is a manual process — just mark completed
        this.logger.log(
          `Rectification request ${compliance_request_id} marked completed (manual process)`,
        );
        break;
      default:
        throw new Error(`Unknown compliance request type: ${request.request_type}`);
    }

    // 3. Update status to completed
    await tx.complianceRequest.update({
      where: { id: compliance_request_id },
      data: { status: 'completed' },
    });

    this.logger.log(
      `Compliance request ${compliance_request_id} (${request.request_type}) completed, tenant ${tenant_id}`,
    );
  }

  private async handleAccessExport(
    tx: PrismaClient,
    tenantId: string,
    request: {
      id: string;
      subject_type: string;
      subject_id: string;
    },
  ): Promise<void> {
    // Collect all data for the subject
    const exportData = await this.collectSubjectData(
      tx,
      tenantId,
      request.subject_type,
      request.subject_id,
    );

    // Upload JSON export to S3
    const exportFileKey = `compliance-exports/${tenantId}/${request.id}-${Date.now()}.json`;
    const exportJson = JSON.stringify(exportData, null, 2);

    try {
      await this.uploadExportToS3(exportFileKey, exportJson);
    } catch (err) {
      this.logger.warn(
        `Failed to upload export to S3 — storing file_key reference only: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Update export_file_key on the request
    await tx.complianceRequest.update({
      where: { id: request.id },
      data: { export_file_key: exportFileKey },
    });

    this.logger.log(
      `Access export for ${request.subject_type} ${request.subject_id} saved to ${exportFileKey}`,
    );
  }

  private async handleErasure(
    tx: PrismaClient,
    tenantId: string,
    request: {
      id: string;
      subject_type: string;
      subject_id: string;
      classification: string | null;
    },
  ): Promise<void> {
    const classification = request.classification;

    if (classification === 'retain_legal_basis') {
      this.logger.log(
        `Erasure request ${request.id} classified as retain_legal_basis — no data modification performed`,
      );
      return;
    }

    const result = await this.anonymisationCore.anonymiseSubject(
      tenantId,
      request.subject_type,
      request.subject_id,
      tx,
    );

    await this.runCleanupPlan(tenantId, result.cleanup, tx);

    this.logger.log(
      `Erasure (${classification ?? 'default'}) applied for ${request.subject_type} ${request.subject_id}. Entities: ${result.anonymised_entities.join(', ')}`,
    );
  }

  private async collectSubjectData(
    tx: PrismaClient,
    tenantId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      tenant_id: tenantId,
      subject_type: subjectType,
      subject_id: subjectId,
    };

    switch (subjectType) {
      case 'student': {
        const student = await tx.student.findFirst({
          where: { id: subjectId, tenant_id: tenantId },
          include: {
            student_parents: { include: { parent: true } },
            attendance_records: { take: 100, orderBy: { created_at: 'desc' } },
            grades: { take: 100, orderBy: { created_at: 'desc' } },
          },
        });
        result['student'] = student;
        break;
      }
      case 'parent': {
        const parent = await tx.parent.findFirst({
          where: { id: subjectId, tenant_id: tenantId },
          include: {
            student_parents: { include: { student: true } },
          },
        });
        result['parent'] = parent;
        break;
      }
      case 'household': {
        const household = await tx.household.findFirst({
          where: { id: subjectId, tenant_id: tenantId },
          include: {
            students: true,
            household_parents: { include: { parent: true } },
          },
        });
        result['household'] = household;
        break;
      }
      case 'user': {
        // User is platform-level, no tenant_id filter on user table
        const user = await tx.user.findUnique({
          where: { id: subjectId },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            created_at: true,
          },
        });
        result['user'] = user;
        break;
      }
      default:
        result['error'] = `Unknown subject type: ${subjectType}`;
    }

    return result;
  }

  private async uploadExportToS3(fileKey: string, content: string): Promise<void> {
    await uploadToS3(fileKey, content);
  }

  private async runCleanupPlan(
    tenantId: string,
    cleanup: AnonymisationCleanupPlan,
    tx: PrismaClient,
  ): Promise<void> {
    await this.removeSearchEntries(cleanup, tx);
    await this.deleteComplianceExports(cleanup, tx);
    await this.clearRedisArtifacts(tenantId, cleanup);
  }

  private async removeSearchEntries(
    cleanup: AnonymisationCleanupPlan,
    tx: PrismaClient,
  ): Promise<void> {
    for (const removal of cleanup.searchRemovals) {
      await deleteSearchDocument(removal.entityType, removal.entityId);
      await tx.searchIndexStatus.deleteMany({
        where: {
          entity_type: removal.entityType,
          entity_id: removal.entityId,
        },
      });
    }
  }

  private async deleteComplianceExports(
    cleanup: AnonymisationCleanupPlan,
    tx: PrismaClient,
  ): Promise<void> {
    for (const key of cleanup.s3ObjectKeys) {
      try {
        await deleteFromS3(key);
      } catch (error) {
        this.logger.warn(
          `[deleteComplianceExports] ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (cleanup.complianceRequestIdsToClear.length > 0) {
      await tx.complianceRequest.updateMany({
        where: {
          id: { in: cleanup.complianceRequestIdsToClear },
        },
        data: {
          export_file_key: null,
        },
      });
    }
  }

  private async clearRedisArtifacts(
    tenantId: string,
    cleanup: AnonymisationCleanupPlan,
  ): Promise<void> {
    const redis = getRedisClient();
    const keys = new Set<string>(cleanup.previewKeys);

    for (const userId of cleanup.unreadNotificationUserIds) {
      keys.add(`tenant:${tenantId}:user:${userId}:unread_notifications`);
    }

    for (const pattern of cleanup.cachePatterns) {
      const matchedKeys = await this.findKeysByPattern(pattern);
      for (const key of matchedKeys) {
        keys.add(key);
      }
    }

    if (keys.size > 0 || cleanup.permissionMembershipIds.length > 0) {
      const pipeline = redis.pipeline();

      for (const key of keys) {
        pipeline.del(key);
      }

      for (const membershipId of cleanup.permissionMembershipIds) {
        pipeline.del(`permissions:${membershipId}`);
      }

      await pipeline.exec();
    }

    for (const userId of cleanup.sessionUserIds) {
      const sessionIds = await redis.smembers(`user_sessions:${userId}`);
      if (sessionIds.length > 0) {
        await redis.del(...sessionIds.map((sessionId) => `session:${sessionId}`));
      }
      await redis.del(`user_sessions:${userId}`);
    }
  }

  private async findKeysByPattern(pattern: string): Promise<string[]> {
    const redis = getRedisClient();
    const keys = new Set<string>();
    let cursor = '0';

    do {
      const [nextCursor, foundKeys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '100');
      cursor = nextCursor;
      for (const key of foundKeys) {
        keys.add(key);
      }
    } while (cursor !== '0');

    return Array.from(keys);
  }
}
