import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { type RiskTier, EARLY_WARNING_WEEKLY_DIGEST_JOB } from '@school/shared/early-warning';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

import { getActiveAcademicYear, loadTenantConfig } from './early-warning-action.utils';

// ─── Payload ────────────────────────────────────────────────────────────────

export interface WeeklyDigestPayload extends TenantJobPayload {
  tenant_id: string;
}

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.EARLY_WARNING, {
  lockDuration: 300_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class WeeklyDigestProcessor extends WorkerHost {
  private readonly logger = new Logger(WeeklyDigestProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<WeeklyDigestPayload>): Promise<void> {
    if (job.name !== EARLY_WARNING_WEEKLY_DIGEST_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (tenant_id) {
      // Per-tenant mode
      this.logger.log(`Processing ${EARLY_WARNING_WEEKLY_DIGEST_JOB} — tenant ${tenant_id}`);
      const innerJob = new WeeklyDigestJob(this.prisma);
      await innerJob.execute(job.data);
      return;
    }

    // Cross-tenant cron mode: iterate all active tenants
    this.logger.log(`Processing ${EARLY_WARNING_WEEKLY_DIGEST_JOB} — cross-tenant cron run`);

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    let successCount = 0;
    for (const tenant of tenants) {
      const innerJob = new WeeklyDigestJob(this.prisma);
      try {
        await innerJob.execute({ tenant_id: tenant.id });
        successCount++;
      } catch (err: unknown) {
        this.logger.error(`Weekly digest failed for tenant ${tenant.id}: ${String(err)}`);
      }
    }

    this.logger.log(
      `${EARLY_WARNING_WEEKLY_DIGEST_JOB} cron complete: ${successCount}/${tenants.length} tenants processed`,
    );
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface TierDistribution {
  green: number;
  yellow: number;
  amber: number;
  red: number;
}

interface DigestStudentEntry {
  student_id: string;
  student_name: string;
  risk_tier: RiskTier;
  composite_score: number;
  tier_changed_this_week: boolean;
  previous_tier: RiskTier | null;
  summary_text: string;
}

// ─── TenantAwareJob Implementation ──────────────────────────────────────────

class WeeklyDigestJob extends TenantAwareJob<WeeklyDigestPayload> {
  private readonly logger = new Logger(WeeklyDigestJob.name);

  protected async processJob(data: WeeklyDigestPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id } = data;

    // 1. Load config — skip if disabled
    const config = await loadTenantConfig(tx, tenant_id);
    if (!config.isEnabled) {
      this.logger.log(`Early warning disabled for tenant ${tenant_id}, skipping digest.`);
      return;
    }

    // 2. Check if today matches the configured digest day
    const today = new Date();
    const todayDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    if (todayDayOfWeek !== config.digestDay) {
      this.logger.log(
        `Today is day ${todayDayOfWeek}, digest day is ${config.digestDay} for tenant ${tenant_id}, skipping.`,
      );
      return;
    }

    // 3. Get active academic year
    const academicYear = await getActiveAcademicYear(tx, tenant_id);
    if (!academicYear) {
      this.logger.log(`No active academic year for tenant ${tenant_id}, skipping digest.`);
      return;
    }

    // 4. Determine recipients
    const recipientUserIds = config.digestRecipients;
    if (recipientUserIds.length === 0) {
      this.logger.log(`No digest recipients configured for tenant ${tenant_id}, skipping.`);
      return;
    }

    // 5. Load all risk profiles for this academic year
    const profiles = await tx.studentRiskProfile.findMany({
      where: {
        tenant_id,
        academic_year_id: academicYear.id,
      },
      include: {
        student: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
      orderBy: { composite_score: 'desc' },
    });

    if (profiles.length === 0) {
      this.logger.log(`No risk profiles found for tenant ${tenant_id}, skipping digest.`);
      return;
    }

    // 6. Compute tier distribution
    const distribution: TierDistribution = { green: 0, yellow: 0, amber: 0, red: 0 };
    for (const profile of profiles) {
      const tier = profile.risk_tier as RiskTier;
      distribution[tier]++;
    }

    // 7. Load tier transitions from the past 7 days to identify changes
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentTransitions = await tx.earlyWarningTierTransition.findMany({
      where: {
        tenant_id,
        transitioned_at: { gte: sevenDaysAgo },
      },
      select: {
        student_id: true,
        from_tier: true,
        to_tier: true,
      },
    });

    // Build a map: student_id -> { from_tier, to_tier } (most recent transition)
    const transitionMap = new Map<string, { from_tier: string | null; to_tier: string }>();
    for (const t of recentTransitions) {
      transitionMap.set(t.student_id, {
        from_tier: t.from_tier,
        to_tier: t.to_tier,
      });
    }

    // 8. Build student entries for the digest — highlight non-green and changed
    const digestEntries: DigestStudentEntry[] = [];

    for (const profile of profiles) {
      const tier = profile.risk_tier as RiskTier;
      if (tier === 'green' && !transitionMap.has(profile.student_id)) {
        // Skip green students that haven't changed tier this week
        continue;
      }

      const transition = transitionMap.get(profile.student_id);
      const signalSummary = profile.signal_summary_json as { summaryText?: string } | null;

      digestEntries.push({
        student_id: profile.student_id,
        student_name: `${profile.student.first_name} ${profile.student.last_name}`,
        risk_tier: tier,
        composite_score: Number(profile.composite_score),
        tier_changed_this_week: !!transition,
        previous_tier: (transition?.from_tier as RiskTier | null) ?? null,
        summary_text: signalSummary?.summaryText ?? '',
      });
    }

    // 9. Build digest payload
    const digestPayload = {
      academic_year_id: academicYear.id,
      generated_at: today.toISOString(),
      total_students: profiles.length,
      distribution,
      students_at_risk: digestEntries.length,
      tier_changes_this_week: recentTransitions.length,
      entries: digestEntries.slice(0, 50), // Cap at 50 for readability
    };

    // 10. Send notifications to each recipient
    let notificationsSent = 0;
    for (const userId of recipientUserIds) {
      try {
        await tx.notification.create({
          data: {
            tenant_id,
            recipient_user_id: userId,
            channel: 'in_app',
            template_key: 'early_warning_weekly_digest',
            locale: 'en',
            status: 'delivered',
            payload_json: digestPayload as unknown as Prisma.InputJsonValue,
            source_entity_type: 'early_warning_digest',
            source_entity_id: tenant_id,
            delivered_at: today,
          },
        });
        notificationsSent++;
      } catch (err: unknown) {
        this.logger.error(`Failed to send digest notification to user ${userId}: ${String(err)}`);
      }
    }

    this.logger.log(
      `Tenant ${tenant_id}: weekly digest sent to ${notificationsSent}/${recipientUserIds.length} recipients. ` +
        `Distribution: green=${distribution.green}, yellow=${distribution.yellow}, amber=${distribution.amber}, red=${distribution.red}. ` +
        `${recentTransitions.length} tier changes this week.`,
    );
  }
}
