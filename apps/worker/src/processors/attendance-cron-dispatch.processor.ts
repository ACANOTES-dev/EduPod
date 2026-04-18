import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';

import { ATTENDANCE_AUTO_LOCK_JOB } from './attendance-auto-lock.processor';
import { ATTENDANCE_DETECT_PATTERNS_JOB } from './attendance-pattern-detection.processor';
import { ATTENDANCE_DETECT_PENDING_JOB } from './attendance-pending-detection.processor';
import { ATTENDANCE_GENERATE_SESSIONS_JOB } from './attendance-session-generation.processor';

// ─── Job names ───────────────────────────────────────────────────────────────

export const ATTENDANCE_CRON_DISPATCH_GENERATE_JOB = 'attendance:cron-dispatch-generate';
export const ATTENDANCE_CRON_DISPATCH_LOCK_JOB = 'attendance:cron-dispatch-lock';
export const ATTENDANCE_CRON_DISPATCH_PATTERNS_JOB = 'attendance:cron-dispatch-patterns';
export const ATTENDANCE_CRON_DISPATCH_PENDING_JOB = 'attendance:cron-dispatch-pending';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Fans out per-tenant attendance jobs on a schedule. The per-tenant processors
 * (session generation, auto-lock, pattern detection, pending detection) require
 * `tenant_id` on their payload. This dispatcher runs on a cron with empty
 * payload, queries active tenants, and enqueues one per-tenant job for each.
 */
@Processor(QUEUE_NAMES.ATTENDANCE, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class AttendanceCronDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(AttendanceCronDispatchProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.ATTENDANCE) private readonly attendanceQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case ATTENDANCE_CRON_DISPATCH_GENERATE_JOB:
        return this.dispatchGenerate();
      case ATTENDANCE_CRON_DISPATCH_LOCK_JOB:
        return this.dispatchLock();
      case ATTENDANCE_CRON_DISPATCH_PATTERNS_JOB:
        return this.dispatchPatterns();
      case ATTENDANCE_CRON_DISPATCH_PENDING_JOB:
        return this.dispatchPending();
      default:
        return;
    }
  }

  private async listActiveTenantIds(): Promise<string[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });
    return tenants.map((t) => t.id);
  }

  private todayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async dispatchGenerate(): Promise<void> {
    const tenantIds = await this.listActiveTenantIds();
    const date = this.todayIsoDate();
    for (const tenant_id of tenantIds) {
      await this.attendanceQueue.add(
        ATTENDANCE_GENERATE_SESSIONS_JOB,
        { tenant_id, date },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    }
    this.logger.log(
      `Dispatched ${ATTENDANCE_GENERATE_SESSIONS_JOB} for ${tenantIds.length} tenant(s) on ${date}`,
    );
  }

  private async dispatchLock(): Promise<void> {
    const tenantIds = await this.listActiveTenantIds();
    for (const tenant_id of tenantIds) {
      await this.attendanceQueue.add(
        ATTENDANCE_AUTO_LOCK_JOB,
        { tenant_id },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    }
    this.logger.log(`Dispatched ${ATTENDANCE_AUTO_LOCK_JOB} for ${tenantIds.length} tenant(s)`);
  }

  private async dispatchPatterns(): Promise<void> {
    const tenantIds = await this.listActiveTenantIds();
    for (const tenant_id of tenantIds) {
      await this.attendanceQueue.add(
        ATTENDANCE_DETECT_PATTERNS_JOB,
        { tenant_id },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    }
    this.logger.log(
      `Dispatched ${ATTENDANCE_DETECT_PATTERNS_JOB} for ${tenantIds.length} tenant(s)`,
    );
  }

  private async dispatchPending(): Promise<void> {
    const tenantIds = await this.listActiveTenantIds();
    const date = this.todayIsoDate();
    for (const tenant_id of tenantIds) {
      await this.attendanceQueue.add(
        ATTENDANCE_DETECT_PENDING_JOB,
        { tenant_id, date },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    }
    this.logger.log(
      `Dispatched ${ATTENDANCE_DETECT_PENDING_JOB} for ${tenantIds.length} tenant(s) on ${date}`,
    );
  }
}
