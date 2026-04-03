import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  type RiskTier,
  type SignalResult,
  type TrendJson,
  EARLY_WARNING_COMPUTE_DAILY_JOB,
} from '@school/shared/early-warning';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

import {
  computeRiskAssessment,
  getActiveAcademicYear,
  loadTenantConfig,
  logTierTransition,
  upsertRiskProfile,
  writeSignalAuditTrail,
} from './early-warning-action.utils';
import { collectAllSignals } from './signal-collection.utils';

// ─── Payload ────────────────────────────────────────────────────────────────

export interface ComputeDailyPayload extends TenantJobPayload {
  tenant_id: string;
}

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.EARLY_WARNING, {
  lockDuration: 300_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class ComputeDailyProcessor extends WorkerHost {
  private readonly logger = new Logger(ComputeDailyProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<ComputeDailyPayload>): Promise<void> {
    if (job.name !== EARLY_WARNING_COMPUTE_DAILY_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (tenant_id) {
      // Per-tenant mode
      this.logger.log(`Processing ${EARLY_WARNING_COMPUTE_DAILY_JOB} — tenant ${tenant_id}`);
      const innerJob = new ComputeDailyJob(this.prisma);
      await innerJob.execute(job.data);
      return;
    }

    // Cross-tenant cron mode: iterate all active tenants
    this.logger.log(`Processing ${EARLY_WARNING_COMPUTE_DAILY_JOB} — cross-tenant cron run`);

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    let successCount = 0;
    for (const tenant of tenants) {
      const innerJob = new ComputeDailyJob(this.prisma);
      try {
        await innerJob.execute({ tenant_id: tenant.id });
        successCount++;
      } catch (err: unknown) {
        this.logger.error(`Daily compute failed for tenant ${tenant.id}: ${String(err)}`);
      }
    }

    this.logger.log(
      `${EARLY_WARNING_COMPUTE_DAILY_JOB} cron complete: ${successCount}/${tenants.length} tenants processed`,
    );
  }
}

// ─── TenantAwareJob Implementation ──────────────────────────────────────────

class ComputeDailyJob extends TenantAwareJob<ComputeDailyPayload> {
  private readonly logger = new Logger(ComputeDailyJob.name);

  protected async processJob(data: ComputeDailyPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id } = data;

    // 1. Load tenant config — skip if early warning is disabled
    const config = await loadTenantConfig(tx, tenant_id);
    if (!config.isEnabled) {
      this.logger.log(`Early warning disabled for tenant ${tenant_id}, skipping.`);
      return;
    }

    // 2. Get active academic year
    const academicYear = await getActiveAcademicYear(tx, tenant_id);
    if (!academicYear) {
      this.logger.log(`No active academic year for tenant ${tenant_id}, skipping.`);
      return;
    }

    // 3. Get all active students
    const students = await tx.student.findMany({
      where: { tenant_id, status: 'active' },
      select: { id: true },
    });

    this.logger.log(`Tenant ${tenant_id}: computing risk for ${students.length} active students`);

    let profilesUpdated = 0;
    let tierTransitions = 0;

    // 4. Process each student
    for (const student of students) {
      try {
        // 4a. Collect signals from all 5 domains
        const signals: SignalResult[] = await collectAllSignals(
          tx,
          tenant_id,
          student.id,
          academicYear.id,
        );

        // 4b. Load existing profile for hysteresis
        const existingProfile = await tx.studentRiskProfile.findUnique({
          where: {
            uq_risk_profile_tenant_student_year: {
              tenant_id,
              student_id: student.id,
              academic_year_id: academicYear.id,
            },
          },
          select: {
            risk_tier: true,
            trend_json: true,
          },
        });

        const previousTier: RiskTier | null = existingProfile
          ? (existingProfile.risk_tier as RiskTier)
          : null;
        const trendHistory: number[] = existingProfile?.trend_json
          ? ((existingProfile.trend_json as unknown as TrendJson).dailyScores ?? [])
          : [];

        // 4c. Compute risk assessment
        const assessment = computeRiskAssessment(
          signals,
          config.weights,
          config.thresholds,
          config.hysteresisBuffer,
          previousTier,
          trendHistory,
        );

        // 4d. Upsert risk profile
        const profileId = await upsertRiskProfile(
          tx,
          tenant_id,
          student.id,
          academicYear.id,
          assessment,
        );

        profilesUpdated++;

        // 4e. Write signal audit trail
        await writeSignalAuditTrail(tx, tenant_id, student.id, academicYear.id, assessment.signals);

        // 4f. Log tier transition if changed
        if (assessment.tierChanged) {
          await logTierTransition(
            tx,
            tenant_id,
            student.id,
            profileId,
            assessment,
            config.routingRules,
          );
          tierTransitions++;
        }
      } catch (err: unknown) {
        this.logger.error(`Failed to compute risk for student ${student.id}: ${String(err)}`);
        // Continue processing other students
      }
    }

    this.logger.log(
      `Tenant ${tenant_id}: daily compute complete — ${profilesUpdated} profiles updated, ${tierTransitions} tier transitions`,
    );
  }
}
