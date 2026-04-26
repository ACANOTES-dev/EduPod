import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';
import Redis from 'ioredis';

import {
  buildSessionGenStatusKey,
  PAYROLL_SESSION_GENERATION_JOB,
  SESSION_GEN_STATUS_TTL_SECONDS,
} from '@school/shared/payroll';

import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface SessionGenerationPayload extends TenantJobPayload {
  payroll_run_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────
//
// The legacy `'payroll:generate-sessions'` constant has been retired in
// favour of `PAYROLL_SESSION_GENERATION_JOB` from `@school/shared/payroll`.
// `PAYROLL_GENERATE_SESSIONS_JOB` is kept as a re-export so the dispatcher
// (which still imports it under the old name) keeps working — both names
// resolve to the literal string the API enqueues with.

export const PAYROLL_GENERATE_SESSIONS_JOB = PAYROLL_SESSION_GENERATION_JOB;

// ─── Processor ───────────────────────────────────────────────────────────────
//
// Wave 3 of the payroll-overhaul rebuild — the session-generation worker
// now uses the canonical job name and Redis-key format, and counts
// CONFIRMED class delivery records (status = `delivered`) bracketed to
// the run's period — not raw `schedule.count()`. The legacy code counted
// scheduled slots, ignoring whether they were actually taught.

@Injectable()
export class PayrollSessionGenerationProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(PayrollSessionGenerationProcessor.name);
  private readonly redis: Redis;

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:5554', {
      maxRetriesPerRequest: null,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  async process(job: Job<SessionGenerationPayload>): Promise<void> {
    if (job.name !== PAYROLL_SESSION_GENERATION_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${PAYROLL_SESSION_GENERATION_JOB} — tenant ${tenant_id}, run ${job.data.payroll_run_id}`,
    );

    const generationJob = new PayrollSessionGenerationJob(this.prisma, this.redis);
    await generationJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class PayrollSessionGenerationJob extends TenantAwareJob<SessionGenerationPayload> {
  private readonly logger = new Logger(PayrollSessionGenerationJob.name);

  constructor(
    prisma: PrismaClient,
    private readonly redis: Redis,
  ) {
    super(prisma);
  }

  protected async processJob(data: SessionGenerationPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, payroll_run_id } = data;
    const statusKey = buildSessionGenStatusKey(tenant_id, payroll_run_id);

    try {
      // Fetch the payroll run to get period info
      const payrollRun = await tx.payrollRun.findFirst({
        where: { id: payroll_run_id, tenant_id },
        select: { period_month: true, period_year: true },
      });

      if (!payrollRun) {
        throw new Error(`Payroll run ${payroll_run_id} not found for tenant ${tenant_id}`);
      }

      // Calculate first and last day of the period month
      const firstDayOfMonth = new Date(payrollRun.period_year, payrollRun.period_month - 1, 1);
      const lastDayOfMonth = new Date(payrollRun.period_year, payrollRun.period_month, 0);

      // Set Redis status to running
      await this.redis.set(
        statusKey,
        JSON.stringify({
          status: 'running',
          updated_entry_count: 0,
          started_at: new Date().toISOString(),
        }),
        'EX',
        SESSION_GEN_STATUS_TTL_SECONDS,
      );

      // Get all per_class entries for this run
      const perClassEntries = await tx.payrollEntry.findMany({
        where: {
          tenant_id,
          payroll_run_id,
          compensation_type: 'per_class',
        },
        select: {
          id: true,
          staff_profile_id: true,
        },
      });

      this.logger.log(
        `Found ${perClassEntries.length} per-class entries for run ${payroll_run_id}`,
      );

      let updatedCount = 0;

      for (const entry of perClassEntries) {
        // Wave 3 — count CONFIRMED delivery records (status = 'delivered')
        // bracketed to the run period. The pre-rebuild code counted
        // `tx.schedule.count(...)` which over-counted by every scheduled
        // slot, including ones that never happened.
        const deliveredCount = await tx.classDeliveryRecord.count({
          where: {
            tenant_id,
            staff_profile_id: entry.staff_profile_id,
            status: 'delivered',
            delivery_date: {
              gte: firstDayOfMonth,
              lte: lastDayOfMonth,
            },
          },
        });

        // Update the entry with the delivered class count
        await tx.payrollEntry.update({
          where: { id: entry.id },
          data: {
            classes_taught: deliveredCount,
            auto_populated_class_count: deliveredCount,
          },
        });

        updatedCount++;
      }

      // Update Redis with completed status
      await this.redis.set(
        statusKey,
        JSON.stringify({
          status: 'completed',
          updated_entry_count: updatedCount,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        }),
        'EX',
        SESSION_GEN_STATUS_TTL_SECONDS,
      );

      this.logger.log(
        `Updated ${updatedCount} per-class entries for payroll run ${payroll_run_id}, tenant ${tenant_id}`,
      );
    } catch (err) {
      // Update Redis with failed status so the UI knows
      await this.redis.set(
        statusKey,
        JSON.stringify({
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
          failed_at: new Date().toISOString(),
        }),
        'EX',
        SESSION_GEN_STATUS_TTL_SECONDS,
      );
      throw err;
    }
  }
}
