import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';
import Redis from 'ioredis';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface SessionGenerationPayload extends TenantJobPayload {
  payroll_run_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const PAYROLL_GENERATE_SESSIONS_JOB = 'payroll:generate-sessions';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PAYROLL, { lockDuration: 300_000 })
export class PayrollSessionGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(PayrollSessionGenerationProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<SessionGenerationPayload>): Promise<void> {
    if (job.name !== PAYROLL_GENERATE_SESSIONS_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${PAYROLL_GENERATE_SESSIONS_JOB} — tenant ${tenant_id}, run ${job.data.payroll_run_id}`,
    );

    const generationJob = new PayrollSessionGenerationJob(this.prisma);
    await generationJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class PayrollSessionGenerationJob extends TenantAwareJob<SessionGenerationPayload> {
  private readonly logger = new Logger(PayrollSessionGenerationJob.name);
  private readonly redis: Redis;

  constructor(prisma: PrismaClient) {
    super(prisma);
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:5554');
  }

  protected async processJob(data: SessionGenerationPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, payroll_run_id } = data;
    const redisKey = `payroll:session-gen:${payroll_run_id}`;

    try {
      // Fetch the payroll run to get period info
      const payrollRun = await tx.payrollRun.findFirst({
        where: {
          id: payroll_run_id,
          tenant_id,
        },
        select: {
          period_month: true,
          period_year: true,
        },
      });

      if (!payrollRun) {
        throw new Error(`Payroll run ${payroll_run_id} not found for tenant ${tenant_id}`);
      }

      // Calculate first and last day of the period month
      const firstDayOfMonth = new Date(payrollRun.period_year, payrollRun.period_month - 1, 1);
      const lastDayOfMonth = new Date(payrollRun.period_year, payrollRun.period_month, 0);

      // Set Redis status to running
      await this.redis.set(
        redisKey,
        JSON.stringify({
          status: 'running',
          updated_entry_count: 0,
          started_at: new Date().toISOString(),
        }),
        'EX',
        600,
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
        // Count schedules for the teacher active during this month
        const scheduleCount = await tx.schedule.count({
          where: {
            tenant_id,
            teacher_staff_id: entry.staff_profile_id,
            effective_start_date: { lte: lastDayOfMonth },
            OR: [{ effective_end_date: null }, { effective_end_date: { gte: firstDayOfMonth } }],
          },
        });

        // Update the entry with the schedule count
        await tx.payrollEntry.update({
          where: { id: entry.id },
          data: {
            classes_taught: scheduleCount,
            auto_populated_class_count: scheduleCount,
          },
        });

        updatedCount++;
      }

      // Update Redis with completed status
      await this.redis.set(
        redisKey,
        JSON.stringify({
          status: 'completed',
          updated_entry_count: updatedCount,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        }),
        'EX',
        600,
      );

      this.logger.log(
        `Updated ${updatedCount} per-class entries for payroll run ${payroll_run_id}, tenant ${tenant_id}`,
      );
    } catch (err) {
      // Update Redis with failed status so the UI knows
      await this.redis.set(
        redisKey,
        JSON.stringify({
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
          failed_at: new Date().toISOString(),
        }),
        'EX',
        600,
      );
      throw err;
    } finally {
      await this.redis.quit();
    }
  }
}
