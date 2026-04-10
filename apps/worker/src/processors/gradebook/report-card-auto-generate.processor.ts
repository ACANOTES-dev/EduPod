import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const REPORT_CARD_AUTO_GENERATE_JOB = 'report-cards:auto-generate';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Cross-tenant daily cron processor — does NOT use TenantAwareJob.
 * Iterates over all active tenants and checks if any academic periods ended
 * within the last 24 hours. For each such period, creates draft report cards
 * for all enrolled students who do not already have one.
 */
@Processor(QUEUE_NAMES.GRADEBOOK, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class ReportCardAutoGenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportCardAutoGenerateProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== REPORT_CARD_AUTO_GENERATE_JOB) {
      return;
    }

    this.logger.log('Running report card auto-generate across all tenants...');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, default_locale: true },
    });

    let totalGenerated = 0;

    for (const tenant of tenants) {
      const generated = await this.processForTenant(tenant.id, tenant.default_locale);
      totalGenerated += generated;
    }

    this.logger.log(
      `Report card auto-generate complete: ${totalGenerated} draft(s) created across ${tenants.length} tenants`,
    );
  }

  private async processForTenant(tenantId: string, locale: string): Promise<number> {
    // Find academic periods that ended within the last 24 hours
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentlyEndedPeriods = await this.prisma.academicPeriod.findMany({
      where: {
        tenant_id: tenantId,
        end_date: {
          gte: since,
          lte: now,
        },
        status: { in: ['active', 'closed'] },
      },
      select: { id: true, name: true, academic_year_id: true },
    });

    if (recentlyEndedPeriods.length === 0) {
      return 0;
    }

    let created = 0;

    for (const period of recentlyEndedPeriods) {
      // Find all distinct students enrolled in classes within this period's academic year
      const enrolments = await this.prisma.classEnrolment.findMany({
        where: {
          tenant_id: tenantId,
          class_entity: {
            academic_year: {
              periods: {
                some: { id: period.id },
              },
            },
          },
          status: 'active',
        },
        select: { student_id: true },
        distinct: ['student_id'],
      });

      const studentIds = enrolments.map((e: { student_id: string }) => e.student_id);

      if (studentIds.length === 0) {
        this.logger.log(
          `Tenant ${tenantId}: period "${period.name}" has no enrolled students, skipping.`,
        );
        continue;
      }

      // Find students who already have a report card for this period
      const existing = await this.prisma.reportCard.findMany({
        where: {
          tenant_id: tenantId,
          academic_period_id: period.id,
          student_id: { in: studentIds },
        },
        select: { student_id: true },
      });
      const existingStudentIds = new Set(existing.map((r: { student_id: string }) => r.student_id));

      const missing = studentIds.filter((id: string) => !existingStudentIds.has(id));

      if (missing.length === 0) {
        this.logger.log(
          `Tenant ${tenantId}: period "${period.name}" — all students already have report cards.`,
        );
        continue;
      }

      // Batch-create draft report cards for missing students
      await this.prisma.reportCard.createMany({
        data: missing.map((studentId: string) => ({
          tenant_id: tenantId,
          student_id: studentId,
          academic_period_id: period.id,
          academic_year_id: period.academic_year_id,
          status: 'draft' as const,
          template_locale: locale,
          snapshot_payload_json: {},
        })),
        skipDuplicates: true,
      });

      created += missing.length;

      this.logger.log(
        `Tenant ${tenantId}: period "${period.name}" — created ${missing.length} draft report card(s)`,
      );
    }

    return created;
  }
}
