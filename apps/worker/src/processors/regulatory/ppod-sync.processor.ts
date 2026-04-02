import { createHash } from 'crypto';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PodDatabaseType, PodSyncStatus, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import type { TenantJobPayload } from '../../base/tenant-aware-job';
import { TenantAwareJob } from '../../base/tenant-aware-job';

// ─── Payload ────────────────────────────────────────────────────────────────
export interface PpodSyncPayload extends TenantJobPayload {
  database_type: 'ppod' | 'pod';
  scope: 'full' | 'incremental';
}

// ─── Job name ───────────────────────────────────────────────────────────────
export const REGULATORY_PPOD_SYNC_JOB = 'regulatory:ppod-sync';

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.REGULATORY, { lockDuration: 120_000 })
export class RegulatoryPpodSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(RegulatoryPpodSyncProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<PpodSyncPayload>): Promise<void> {
    if (job.name !== REGULATORY_PPOD_SYNC_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${REGULATORY_PPOD_SYNC_JOB} — tenant ${tenant_id}, type ${job.data.database_type}, scope ${job.data.scope}`,
    );

    const innerJob = new PpodSyncJob(this.prisma);
    await innerJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ──────────────────────────────────────────

class PpodSyncJob extends TenantAwareJob<PpodSyncPayload> {
  private readonly logger = new Logger(PpodSyncJob.name);

  protected async processJob(data: PpodSyncPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, database_type, scope } = data;
    const dbType = database_type as PodDatabaseType;
    const startedAt = new Date();

    // 1. Query active students
    const students = await tx.student.findMany({
      where: { tenant_id, status: 'active' },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        date_of_birth: true,
        national_id: true,
      },
    });

    this.logger.log(
      `Tenant ${tenant_id}: syncing ${students.length} students for ${database_type} (${scope})`,
    );

    let pendingCount = 0;
    let skippedCount = 0;

    for (const student of students) {
      // 2. Check for existing mapping
      const existingMapping = await tx.ppodStudentMapping.findFirst({
        where: {
          tenant_id,
          student_id: student.id,
          database_type: dbType,
        },
      });

      // 3. Build current data hash for change detection
      const currentHash = this.buildDataHash(student);

      if (scope === 'incremental' && existingMapping) {
        if (existingMapping.last_sync_hash === currentHash) {
          skippedCount++;
          continue;
        }
      }

      // 4. Mark mapping as pending sync
      if (existingMapping) {
        await tx.ppodStudentMapping.update({
          where: { id: existingMapping.id },
          data: {
            sync_status: PodSyncStatus.pod_pending,
            last_sync_hash: currentHash,
            data_snapshot: this.buildSnapshot(student),
          },
        });
      } else {
        await tx.ppodStudentMapping.create({
          data: {
            tenant_id,
            student_id: student.id,
            database_type: dbType,
            sync_status: PodSyncStatus.pod_pending,
            last_sync_hash: currentHash,
            data_snapshot: this.buildSnapshot(student),
          },
        });
      }

      pendingCount++;
    }

    // 5. Create sync log entry
    await tx.ppodSyncLog.create({
      data: {
        tenant_id,
        database_type: dbType,
        sync_type: scope === 'full' ? 'full' : 'incremental',
        triggered_by_id: data.user_id ?? null,
        started_at: startedAt,
        completed_at: new Date(),
        status: 'sync_completed',
        records_pushed: pendingCount,
        records_created: 0,
        records_updated: pendingCount,
        records_failed: 0,
        transport_used: 'worker_job',
      },
    });

    this.logger.log(
      `Tenant ${tenant_id}: ${database_type} sync complete — ${pendingCount} pending, ${skippedCount} skipped`,
    );
  }

  private buildDataHash(student: {
    first_name: string;
    last_name: string;
    date_of_birth: Date | null;
    national_id: string | null;
  }): string {
    const content = [
      student.first_name,
      student.last_name,
      student.date_of_birth?.toISOString() ?? '',
      student.national_id ?? '',
    ].join('|');
    return createHash('md5').update(content).digest('hex');
  }

  private buildSnapshot(student: {
    first_name: string;
    last_name: string;
    date_of_birth: Date | null;
    national_id: string | null;
  }): Prisma.InputJsonValue {
    return {
      first_name: student.first_name,
      last_name: student.last_name,
      date_of_birth: student.date_of_birth?.toISOString() ?? null,
      national_id: student.national_id ?? null,
    };
  }
}
