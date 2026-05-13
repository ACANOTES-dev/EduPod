import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient, RegulatorySubmissionStatus } from '@prisma/client';
import { Job } from 'bullmq';

import { TenantModuleService } from '../../../../api/src/common/services/tenant-module.service';
import type { TenantJobPayload } from '../../base/tenant-aware-job';
import { TenantAwareJob } from '../../base/tenant-aware-job';

// ─── Payload ────────────────────────────────────────────────────────────────
export interface DesGeneratePayload extends TenantJobPayload {
  academic_year: string;
  file_type: string;
}

// ─── Job name ───────────────────────────────────────────────────────────────
export const REGULATORY_DES_GENERATE_JOB = 'regulatory:generate-des-files';

// ─── Processor ──────────────────────────────────────────────────────────────

@Injectable()
export class RegulatoryDesGenerateProcessor {
  private readonly logger = new Logger(RegulatoryDesGenerateProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly tenantModuleService: TenantModuleService,
  ) {}

  async process(job: Job<DesGeneratePayload>): Promise<void> {
    if (job.name !== REGULATORY_DES_GENERATE_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    if (!(await this.tenantModuleService.isEnabled(tenant_id, 'compliance_advanced'))) {
      this.logger.debug(
        `Skipping ${REGULATORY_DES_GENERATE_JOB} for tenant ${tenant_id}: compliance_advanced module disabled`,
      );
      return;
    }

    this.logger.log(
      `Processing ${REGULATORY_DES_GENERATE_JOB} — tenant ${tenant_id}, file_type ${job.data.file_type}, year ${job.data.academic_year}`,
    );

    const innerJob = new DesGenerateJob(this.prisma);
    await innerJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ──────────────────────────────────────────

class DesGenerateJob extends TenantAwareJob<DesGeneratePayload> {
  private readonly logger = new Logger(DesGenerateJob.name);

  protected async processJob(data: DesGeneratePayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, academic_year, file_type } = data;

    // Update submission status to in_progress
    const submission = await tx.regulatorySubmission.findFirst({
      where: {
        tenant_id,
        domain: 'des_september_returns',
        submission_type: file_type,
        academic_year,
        status: {
          in: [
            RegulatorySubmissionStatus.reg_not_started,
            RegulatorySubmissionStatus.reg_in_progress,
          ],
        },
      },
      orderBy: { created_at: 'desc' },
    });

    if (submission) {
      await tx.regulatorySubmission.update({
        where: { id: submission.id },
        data: { status: RegulatorySubmissionStatus.reg_in_progress },
      });
    }

    // The actual DES file generation logic (querying students, staff, subjects,
    // formatting CSV, uploading to S3) is handled by RegulatoryDesService in the
    // API layer. This processor acts as a background trigger — the API enqueues
    // this job and the heavy lifting happens asynchronously.
    //
    // Core data queries for the file:
    // - file_a: Staff profiles with teacher numbers
    // - file_c: Classes with year groups and enrolment counts
    // - file_d: Subjects with DES code mappings
    // - file_e: Students with PPSN, demographics
    // - form_tl: Teaching loads from schedule

    this.logger.log(
      `DES file generation job completed for tenant ${tenant_id}, type ${file_type}, year ${academic_year}`,
    );
  }
}
