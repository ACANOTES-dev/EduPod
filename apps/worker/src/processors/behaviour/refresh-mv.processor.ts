import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import type { TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job constants ──────────────────────────────────────────────────────────

export const REFRESH_MV_STUDENT_SUMMARY_JOB = 'behaviour:refresh-mv-student-summary';
export const REFRESH_MV_BENCHMARKS_JOB = 'behaviour:refresh-mv-benchmarks';
export const REFRESH_MV_EXPOSURE_RATES_JOB = 'behaviour:refresh-mv-exposure-rates';

export type RefreshMVPayload = TenantJobPayload;

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR)
export class RefreshMVProcessor extends WorkerHost {
  private readonly logger = new Logger(RefreshMVProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<RefreshMVPayload>): Promise<void> {
    switch (job.name) {
      case REFRESH_MV_STUDENT_SUMMARY_JOB:
        return this.refreshStudentSummary();
      case REFRESH_MV_BENCHMARKS_JOB:
        return this.refreshBenchmarks();
      case REFRESH_MV_EXPOSURE_RATES_JOB:
        return this.refreshExposureRates();
      default:
        // Not our job — ignore
        return;
    }
  }

  private async refreshStudentSummary(): Promise<void> {
    this.logger.log('Refreshing mv_student_behaviour_summary...');
    const start = Date.now();

    try {
      await this.prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_student_behaviour_summary',
      );
      this.logger.log(
        `mv_student_behaviour_summary refreshed in ${Date.now() - start}ms`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to refresh mv_student_behaviour_summary: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async refreshBenchmarks(): Promise<void> {
    this.logger.log('Refreshing mv_behaviour_benchmarks...');
    const start = Date.now();

    try {
      await this.prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_behaviour_benchmarks',
      );
      this.logger.log(
        `mv_behaviour_benchmarks refreshed in ${Date.now() - start}ms`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to refresh mv_behaviour_benchmarks: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async refreshExposureRates(): Promise<void> {
    this.logger.log('Refreshing mv_behaviour_exposure_rates...');
    const start = Date.now();

    try {
      await this.prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_behaviour_exposure_rates',
      );
      this.logger.log(
        `mv_behaviour_exposure_rates refreshed in ${Date.now() - start}ms`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to refresh mv_behaviour_exposure_rates: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
