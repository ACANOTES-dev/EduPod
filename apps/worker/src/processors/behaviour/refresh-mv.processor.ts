import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { CrossTenantSystemJob } from '../../base/cross-tenant-system-job';
import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job constants ──────────────────────────────────────────────────────────

export const REFRESH_MV_STUDENT_SUMMARY_JOB = 'behaviour:refresh-mv-student-summary';
export const REFRESH_MV_BENCHMARKS_JOB = 'behaviour:refresh-mv-benchmarks';
export const REFRESH_MV_EXPOSURE_RATES_JOB = 'behaviour:refresh-mv-exposure-rates';

// ─── Jobs ───────────────────────────────────────────────────────────────────
//
// Materialised view refresh is a cross-tenant DB-level operation.
// Extends CrossTenantSystemJob: intentionally no RLS context.
//
// The MVs are owned by `edupod_admin` (BYPASSRLS). The worker connects as
// `edupod_app` (RLS-enforced, not MV owner) — so calling `REFRESH MATERIALIZED
// VIEW` directly hits two failures:
//   1. ERROR: must be owner of materialized view ...
//   2. ERROR: unrecognized configuration parameter "app.current_tenant_id"
//      (RLS policies on underlying tables require it to be set)
//
// We delegate to SECURITY DEFINER functions owned by edupod_admin — see the
// 20260417120000_fix_mv_refresh_ownership migration. The function runs as
// edupod_admin inside, satisfying both the ownership and BYPASSRLS checks.

class RefreshStudentSummaryJob extends CrossTenantSystemJob {
  constructor(prisma: PrismaClient) {
    super(prisma, RefreshStudentSummaryJob.name);
  }

  protected async runSystemJob(): Promise<void> {
    this.logger.log('Refreshing mv_student_behaviour_summary...');
    const start = Date.now();

    try {
      await this.prisma.$executeRaw(Prisma.sql`SELECT refresh_mv_student_behaviour_summary()`);
      this.logger.log(`mv_student_behaviour_summary refreshed in ${Date.now() - start}ms`);
    } catch (error) {
      this.logger.error(
        `Failed to refresh mv_student_behaviour_summary: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}

class RefreshBenchmarksJob extends CrossTenantSystemJob {
  constructor(prisma: PrismaClient) {
    super(prisma, RefreshBenchmarksJob.name);
  }

  protected async runSystemJob(): Promise<void> {
    this.logger.log('Refreshing mv_behaviour_benchmarks...');
    const start = Date.now();

    try {
      await this.prisma.$executeRaw(Prisma.sql`SELECT refresh_mv_behaviour_benchmarks()`);
      this.logger.log(`mv_behaviour_benchmarks refreshed in ${Date.now() - start}ms`);
    } catch (error) {
      this.logger.error(
        `Failed to refresh mv_behaviour_benchmarks: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}

class RefreshExposureRatesJob extends CrossTenantSystemJob {
  constructor(prisma: PrismaClient) {
    super(prisma, RefreshExposureRatesJob.name);
  }

  protected async runSystemJob(): Promise<void> {
    this.logger.log('Refreshing mv_behaviour_exposure_rates...');
    const start = Date.now();

    try {
      await this.prisma.$executeRaw(Prisma.sql`SELECT refresh_mv_behaviour_exposure_rates()`);
      this.logger.log(`mv_behaviour_exposure_rates refreshed in ${Date.now() - start}ms`);
    } catch (error) {
      this.logger.error(
        `Failed to refresh mv_behaviour_exposure_rates: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR, {
  lockDuration: 300_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class RefreshMVProcessor extends WorkerHost {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case REFRESH_MV_STUDENT_SUMMARY_JOB:
        return new RefreshStudentSummaryJob(this.prisma).execute();
      case REFRESH_MV_BENCHMARKS_JOB:
        return new RefreshBenchmarksJob(this.prisma).execute();
      case REFRESH_MV_EXPOSURE_RATES_JOB:
        return new RefreshExposureRatesJob(this.prisma).execute();
      default:
        // Not our job — ignore
        return;
    }
  }
}
