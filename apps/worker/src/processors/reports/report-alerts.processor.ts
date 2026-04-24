import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import type { TenantJobPayload } from '../../base/tenant-aware-job';
import { TenantAwareJob } from '../../base/tenant-aware-job';

import { evaluateTenant, type EvaluateTenantResult } from './report-alerts/alert-evaluator';

// ─── Job names ────────────────────────────────────────────────────────────────

/**
 * Cross-tenant cron tick. The handler scans active tenants and
 * enqueues one per-tenant evaluation job for each. Run every 30
 * minutes from CronSchedulerService.
 */
export const REPORTS_ALERT_EVALUATE_JOB = 'reports:alert-evaluate';

/**
 * Per-tenant evaluation job. Carries `tenant_id` so the inherited
 * `TenantAwareJob` machinery sets RLS context before any DB read.
 */
export const REPORTS_ALERT_EVALUATE_TENANT_JOB = 'reports:alert-evaluate-tenant';

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface ReportsAlertEvaluateTickPayload extends TenantJobPayload {}
export interface ReportsAlertEvaluateTenantPayload extends TenantJobPayload {}

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Report Alerts handler. The shared `REPORTS` queue uses the
 * queue-dispatcher pattern (one `@Processor` in
 * `reports-export-batch.processor.ts` routes by `job.name`); this
 * class is an `@Injectable()` invoked by that dispatcher for two job
 * names:
 *
 *  1. `reports:alert-evaluate` — cross-tenant tick. Iterates active
 *     tenants and enqueues one `reports:alert-evaluate-tenant` per
 *     tenant.
 *  2. `reports:alert-evaluate-tenant` — runs the per-tenant evaluator
 *     inside a `TenantAwareJob` transaction so RLS is enforced for
 *     every read and every `report_alert_runs` insert.
 *
 * Splitting the work this way keeps the cron tick fast (one tenant
 * stuck on a slow query never blocks the others) and gives each
 * tenant its own retry budget.
 */
@Injectable()
export class ReportAlertsHandler {
  private readonly logger = new Logger(ReportAlertsHandler.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.REPORTS) private readonly reportsQueue: Queue,
  ) {}

  async process(job: Job): Promise<void> {
    if (job.name === REPORTS_ALERT_EVALUATE_JOB) {
      await this.dispatchTick();
      return;
    }
    if (job.name === REPORTS_ALERT_EVALUATE_TENANT_JOB) {
      await this.evaluateTenantJob(job as Job<ReportsAlertEvaluateTenantPayload>);
      return;
    }
    this.logger.warn(`Unexpected job name routed to ReportAlertsHandler: "${job.name}"`);
  }

  private async dispatchTick(): Promise<void> {
    this.logger.log(`Dispatching ${REPORTS_ALERT_EVALUATE_JOB} — scanning active tenants`);
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });
    let enqueued = 0;
    for (const tenant of tenants) {
      try {
        await this.reportsQueue.add(REPORTS_ALERT_EVALUATE_TENANT_JOB, {
          tenant_id: tenant.id,
        } satisfies ReportsAlertEvaluateTenantPayload);
        enqueued++;
      } catch (err: unknown) {
        this.logger.error(
          `[dispatchTick] failed to enqueue per-tenant job tenant=${tenant.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    this.logger.log(
      `Dispatched ${REPORTS_ALERT_EVALUATE_TENANT_JOB} for ${enqueued}/${tenants.length} tenant(s)`,
    );
  }

  private async evaluateTenantJob(
    job: Job<ReportsAlertEvaluateTenantPayload>,
  ): Promise<void> {
    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error(
        'Job rejected: missing tenant_id in reports:alert-evaluate-tenant payload',
      );
    }
    this.logger.log(
      `Processing ${REPORTS_ALERT_EVALUATE_TENANT_JOB} — tenant=${tenant_id}`,
    );
    const work = new ReportAlertsTenantWork(this.prisma);
    const result = await work.run(job.data);
    this.logger.log(
      `Tenant evaluation complete: tenant=${tenant_id} evaluated=${result.evaluated} fired=${result.fired} errored=${result.errored}`,
    );
  }
}

// ─── Worker class ────────────────────────────────────────────────────────────

export class ReportAlertsTenantWork extends TenantAwareJob<ReportsAlertEvaluateTenantPayload> {
  public lastResult: EvaluateTenantResult | null = null;

  protected async processJob(
    data: ReportsAlertEvaluateTenantPayload,
    tx: PrismaClient,
  ): Promise<void> {
    this.lastResult = await evaluateTenant(tx, data.tenant_id);
  }

  async run(data: ReportsAlertEvaluateTenantPayload): Promise<EvaluateTenantResult> {
    await this.execute(data);
    if (!this.lastResult) {
      return { tenant_id: data.tenant_id, evaluated: 0, fired: 0, errored: 0 };
    }
    return this.lastResult;
  }
}
