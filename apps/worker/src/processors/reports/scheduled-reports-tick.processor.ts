import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { Job, Queue } from 'bullmq';
import { parseExpression } from 'cron-parser';

import { QUEUE_NAMES } from '../../base/queue.constants';

import {
  REPORTS_SCHEDULED_DELIVER_JOB,
  type ScheduledReportsDeliverPayload,
} from './scheduled-reports-deliver.processor';

// ─── Job name ────────────────────────────────────────────────────────────────

/**
 * Cross-tenant cron tick. Fired every 15 minutes by `CronSchedulerService`.
 * Empty payload — the processor scans every `scheduled_reports` row and fans
 * out one `reports:scheduled-deliver` per due report.
 */
export const REPORTS_SCHEDULED_RUN_JOB = 'reports:scheduled-run';

// ─── Tick handler ────────────────────────────────────────────────────────────

/**
 * Iterates `scheduled_reports` to identify which rows are due based on their
 * `schedule_cron` expression and `last_sent_at`. Each due report becomes one
 * `reports:scheduled-deliver` job carrying `{tenant_id, scheduled_report_id}`.
 *
 * The tick itself is platform-level — no `tenant_id` in its payload — and so
 * does NOT extend `TenantAwareJob`. RLS context is set by the per-report
 * deliver job (which does extend `TenantAwareJob`). The tick reads from a
 * platform-wide perspective (`prisma.scheduledReport.findMany`), which is
 * safe because `scheduled_reports` is opted into RLS at the database layer
 * and the worker process has the privileged `app_user` role: when no tenant
 * context is set, `app_user`'s policies return zero rows. We therefore
 * intentionally bypass RLS for the tick by NOT setting tenant context here
 * — this is the same pattern used by every other cross-tenant dispatcher
 * (`OverdueDetectionProcessor`, `BehaviourCronDispatchProcessor`, etc.).
 */
@Injectable()
export class ScheduledReportsTickProcessor {
  private readonly logger = new Logger(ScheduledReportsTickProcessor.name);

  /**
   * How far back from "now" we'll consider the previous expected fire time.
   * If the cron's most recent expected fire is older than `last_sent_at`, the
   * report has already run for that tick and is not due again until the
   * next cron boundary. The lookback ceiling exists so a long worker outage
   * doesn't unleash dozens of catch-up runs at once.
   */
  private static readonly LOOKBACK_MS = 24 * 60 * 60 * 1000;

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.REPORTS) private readonly reportsQueue: Queue,
  ) {}

  async process(job: Job<unknown>): Promise<void> {
    if (job.name !== REPORTS_SCHEDULED_RUN_JOB) return;

    const startedAt = Date.now();
    const dueReports = await this.findDueReports(new Date());

    if (dueReports.length === 0) {
      this.logger.log(
        `Tick complete — no scheduled reports due (took ${Date.now() - startedAt}ms)`,
      );
      return;
    }

    let enqueued = 0;
    for (const report of dueReports) {
      try {
        const payload: ScheduledReportsDeliverPayload = {
          tenant_id: report.tenant_id,
          scheduled_report_id: report.id,
        };
        await this.reportsQueue.add(REPORTS_SCHEDULED_DELIVER_JOB, payload, {
          // Each fan-out job needs to retry on transient failure but should
          // NOT spam the queue — the next 15-minute tick will pick up any
          // lingering due reports anyway.
          attempts: 2,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 50,
          removeOnFail: 200,
        });
        enqueued++;
      } catch (err) {
        // Never let one bad row poison the whole tick.
        this.logger.error(
          `Failed to enqueue deliver job for scheduled_report=${report.id} tenant=${report.tenant_id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Tick complete — fanned out ${enqueued}/${dueReports.length} deliver jobs (took ${Date.now() - startedAt}ms)`,
    );
  }

  /**
   * Reports are due when their cron expression's most recent prior fire-time
   * is more recent than `last_sent_at`. New rows (`last_sent_at IS NULL`)
   * are due as soon as the first cron boundary passes after their creation.
   */
  private async findDueReports(
    now: Date,
  ): Promise<Array<{ id: string; tenant_id: string; schedule_cron: string }>> {
    const rows = await this.prisma.scheduledReport.findMany({
      where: { active: true },
      select: { id: true, tenant_id: true, schedule_cron: true, last_sent_at: true },
    });

    const due: Array<{ id: string; tenant_id: string; schedule_cron: string }> = [];
    for (const row of rows) {
      if (this.isDue(row.schedule_cron, row.last_sent_at, now)) {
        due.push({ id: row.id, tenant_id: row.tenant_id, schedule_cron: row.schedule_cron });
      }
    }
    return due;
  }

  /**
   * True iff the most-recent expected fire time is later than `last_sent_at`
   * (or there is no `last_sent_at` and a fire time exists within the lookback
   * window). Invalid cron expressions are treated as "not due" so a single
   * bad row never blocks the whole tick.
   */
  private isDue(scheduleCron: string, lastSentAt: Date | null, now: Date): boolean {
    let prev: Date;
    try {
      const expr = parseExpression(scheduleCron, { currentDate: now, utc: true });
      prev = expr.prev().toDate();
    } catch (err) {
      this.logger.warn(
        `Invalid cron expression "${scheduleCron}" — skipping. ${(err as Error).message}`,
      );
      return false;
    }

    // Lookback ceiling — a worker outage of more than 24h shouldn't
    // unleash a flood of catch-up deliveries.
    if (now.getTime() - prev.getTime() > ScheduledReportsTickProcessor.LOOKBACK_MS) {
      return false;
    }

    if (!lastSentAt) return true;
    return prev.getTime() > lastSentAt.getTime();
  }
}
