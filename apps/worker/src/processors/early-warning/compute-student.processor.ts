import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import type { RiskTier, SignalResult, TrendJson } from '@school/shared';
import { EARLY_WARNING_COMPUTE_STUDENT_JOB } from '@school/shared';

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

// ─── Payload ──────���─────────────────────────────────────────────────────────

export interface ComputeStudentPayload extends TenantJobPayload {
  tenant_id: string;
  student_id: string;
  trigger_event: string;
}

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.EARLY_WARNING, { lockDuration: 300_000 })
export class ComputeStudentProcessor extends WorkerHost {
  private readonly logger = new Logger(ComputeStudentProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<ComputeStudentPayload>): Promise<void> {
    if (job.name !== EARLY_WARNING_COMPUTE_STUDENT_JOB) {
      return;
    }

    const { tenant_id, student_id, trigger_event } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }
    if (!student_id) {
      throw new Error('Job rejected: missing student_id in payload.');
    }

    this.logger.log(
      `Processing ${EARLY_WARNING_COMPUTE_STUDENT_JOB} — tenant ${tenant_id}, student ${student_id}, trigger ${trigger_event}`,
    );

    const innerJob = new ComputeStudentJob(this.prisma);
    await innerJob.execute(job.data);
  }
}

// ─── TenantAwareJob Implementation ──────────────────────────────────────────

class ComputeStudentJob extends TenantAwareJob<ComputeStudentPayload> {
  private readonly logger = new Logger(ComputeStudentJob.name);

  protected async processJob(data: ComputeStudentPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, student_id, trigger_event } = data;

    // 1. Load tenant config — skip if early warning is disabled
    const config = await loadTenantConfig(tx, tenant_id);
    if (!config.isEnabled) {
      this.logger.log(`Early warning disabled for tenant ${tenant_id}, skipping.`);
      return;
    }

    // 2. Verify student exists and is active
    const student = await tx.student.findFirst({
      where: { id: student_id, tenant_id, status: 'active' },
      select: { id: true },
    });

    if (!student) {
      this.logger.log(
        `Student ${student_id} not found or not active for tenant ${tenant_id}, skipping.`,
      );
      return;
    }

    // 3. Get active academic year
    const academicYear = await getActiveAcademicYear(tx, tenant_id);
    if (!academicYear) {
      this.logger.log(`No active academic year for tenant ${tenant_id}, skipping.`);
      return;
    }

    // 4. Collect signals from all 5 domains
    const signals: SignalResult[] = await collectAllSignals(
      tx,
      tenant_id,
      student_id,
      academicYear.id,
    );

    // 5. Load existing profile for hysteresis
    const existingProfile = await tx.studentRiskProfile.findUnique({
      where: {
        uq_risk_profile_tenant_student_year: {
          tenant_id,
          student_id,
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

    // 6. Compute risk assessment
    const assessment = computeRiskAssessment(
      signals,
      config.weights,
      config.thresholds,
      config.hysteresisBuffer,
      previousTier,
      trendHistory,
    );

    // 7. Upsert risk profile
    const profileId = await upsertRiskProfile(
      tx,
      tenant_id,
      student_id,
      academicYear.id,
      assessment,
    );

    // 8. Write signal audit trail
    await writeSignalAuditTrail(tx, tenant_id, student_id, academicYear.id, assessment.signals);

    // 9. Log tier transition if changed
    if (assessment.tierChanged) {
      await logTierTransition(
        tx,
        tenant_id,
        student_id,
        profileId,
        assessment,
        config.routingRules,
      );

      this.logger.log(
        `Student ${student_id} tier transition: ${assessment.previousTier ?? 'none'} -> ${assessment.riskTier} (trigger: ${trigger_event})`,
      );
    }

    this.logger.log(
      `Student ${student_id} risk recomputed: score ${assessment.compositeScore}, tier ${assessment.riskTier} (trigger: ${trigger_event})`,
    );
  }
}
