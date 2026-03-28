# Phase D — Worker Jobs & Action Layer

> **Depends on:** Phase A (schema, enums, types, queue constant), Phase B (5 signal collectors), Phase C (scoring engine)

## What This Builds

Three worker processors (daily cron, intraday single-student, weekly digest), two action-layer services (routing + trigger), cron registration, and integration hooks into three existing processors that trigger intraday recomputation.

---

## Files to Create

| # | File | Purpose |
|---|------|---------|
| 1 | `apps/worker/src/processors/early-warning/early-warning-compute.processor.ts` | Daily cross-tenant cron processor |
| 2 | `apps/worker/src/processors/early-warning/early-warning-compute-student.processor.ts` | Single-student intraday processor |
| 3 | `apps/worker/src/processors/early-warning/early-warning-digest.processor.ts` | Weekly digest email processor |
| 4 | `apps/api/src/modules/early-warning/early-warning-routing.service.ts` | Resolves notification recipients from routing rules |
| 5 | `apps/api/src/modules/early-warning/early-warning-routing.service.spec.ts` | Tests for routing service |
| 6 | `apps/api/src/modules/early-warning/early-warning-trigger.service.ts` | Exported service for intraday trigger dispatch |
| 7 | `apps/api/src/modules/early-warning/early-warning-trigger.service.spec.ts` | Tests for trigger service |

## Files to Modify

| # | File | Change |
|---|------|--------|
| 8 | `apps/worker/src/base/queue.constants.ts` | Add `EARLY_WARNING: 'early-warning'` |
| 9 | `apps/worker/src/cron/cron-scheduler.service.ts` | Add 2 cron registrations + queue injection |
| 10 | `apps/worker/src/worker.module.ts` | Register queue + 3 processors |
| 11 | `apps/worker/src/processors/behaviour/evaluate-policy.processor.ts` | Enqueue early-warning:compute-student after exclusion-related policy actions |
| 12 | `apps/worker/src/processors/pastoral/notify-concern.processor.ts` | Enqueue early-warning:compute-student after critical incident concern |
| 13 | `apps/worker/src/processors/attendance-pattern-detection.processor.ts` | Enqueue early-warning:compute-student after consecutive absence detection |
| 14 | `apps/api/src/modules/early-warning/early-warning.module.ts` | Export trigger service, register routing service |

---

## Implementation Steps

### Step 1 — Add EARLY_WARNING Queue Constant

**File:** `apps/worker/src/base/queue.constants.ts`

Add to the `QUEUE_NAMES` object:

```typescript
// Before:
export const QUEUE_NAMES = {
  ADMISSIONS: 'admissions',
  ATTENDANCE: 'attendance',
  BEHAVIOUR: 'behaviour',
  COMPLIANCE: 'compliance',
  // ... existing entries ...
  WELLBEING: 'wellbeing',
} as const;

// After — add alphabetically:
export const QUEUE_NAMES = {
  ADMISSIONS: 'admissions',
  ATTENDANCE: 'attendance',
  BEHAVIOUR: 'behaviour',
  COMPLIANCE: 'compliance',
  EARLY_WARNING: 'early-warning',     // <── NEW
  FINANCE: 'finance',
  GRADEBOOK: 'gradebook',
  IMPORTS: 'imports',
  NOTIFICATIONS: 'notifications',
  PASTORAL: 'pastoral',
  PAYROLL: 'payroll',
  REPORTS: 'reports',
  SCHEDULING: 'scheduling',
  SEARCH_SYNC: 'search-sync',
  SECURITY: 'security',
  WELLBEING: 'wellbeing',
} as const;
```

---

### Step 2 — Register Queue in Worker Module

**File:** `apps/worker/src/worker.module.ts`

**2a.** Add import for the three new processors:

```typescript
import { EarlyWarningComputeProcessor } from './processors/early-warning/early-warning-compute.processor';
import { EarlyWarningComputeStudentProcessor } from './processors/early-warning/early-warning-compute-student.processor';
import { EarlyWarningDigestProcessor } from './processors/early-warning/early-warning-digest.processor';
```

**2b.** Add the queue registration inside `BullModule.registerQueue(...)`:

```typescript
{
  name: QUEUE_NAMES.EARLY_WARNING,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
},
```

**2c.** Add the three processors to the `providers` array:

```typescript
// Early Warning queue processors
EarlyWarningComputeProcessor,
EarlyWarningComputeStudentProcessor,
EarlyWarningDigestProcessor,
```

---

### Step 3 — Daily Compute Processor

**File:** `apps/worker/src/processors/early-warning/early-warning-compute.processor.ts`

**Pattern:** Follows `gradebook-risk-detection.processor.ts` exactly.

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const EARLY_WARNING_COMPUTE_DAILY_JOB = 'early-warning:compute-daily';

// ─── Payload ──────────────────────────────────────────────────────────────────

export type EarlyWarningComputeDailyPayload = TenantJobPayload;

// ─── Processor ────────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.EARLY_WARNING)
export class EarlyWarningComputeProcessor extends WorkerHost {
  private readonly logger = new Logger(EarlyWarningComputeProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<EarlyWarningComputeDailyPayload>): Promise<void> {
    if (job.name !== EARLY_WARNING_COMPUTE_DAILY_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (tenant_id) {
      // Per-tenant mode: dispatched explicitly for a single tenant
      this.logger.log(
        `Processing ${EARLY_WARNING_COMPUTE_DAILY_JOB} — tenant ${tenant_id}`,
      );
      const innerJob = new ComputeDailyJob(this.prisma);
      await innerJob.execute(job.data);
      return;
    }

    // Cross-tenant cron mode: iterate all active tenants with early_warning enabled
    this.logger.log(
      `Processing ${EARLY_WARNING_COMPUTE_DAILY_JOB} — cross-tenant cron run`,
    );

    const enabledTenantIds = await this.getEnabledTenantIds();

    let successCount = 0;
    for (const tenantId of enabledTenantIds) {
      const innerJob = new ComputeDailyJob(this.prisma);
      try {
        await innerJob.execute({ tenant_id: tenantId });
        successCount++;
      } catch (err: unknown) {
        this.logger.error(
          `Early warning compute failed for tenant ${tenantId}: ${String(err)}`,
        );
      }
    }

    this.logger.log(
      `${EARLY_WARNING_COMPUTE_DAILY_JOB} cron complete: ${successCount}/${enabledTenantIds.length} tenants processed`,
    );
  }

  /**
   * Returns IDs of active tenants that have early_warning enabled.
   * Queries early_warning_configs joined against active tenants.
   */
  private async getEnabledTenantIds(): Promise<string[]> {
    const configs = await this.prisma.earlyWarningConfig.findMany({
      where: {
        is_enabled: true,
        tenant: { status: 'active' },
      },
      select: { tenant_id: true },
    });
    return configs.map((c) => c.tenant_id);
  }
}

// ─── TenantAwareJob implementation ────────────────────────────────────────────

class ComputeDailyJob extends TenantAwareJob<EarlyWarningComputeDailyPayload> {
  private readonly logger = new Logger(ComputeDailyJob.name);

  protected async processJob(
    data: EarlyWarningComputeDailyPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id } = data;

    // 1. Load tenant config
    const config = await tx.earlyWarningConfig.findFirst({
      where: { tenant_id },
    });

    if (!config || !config.is_enabled) {
      this.logger.log(`Early warning disabled for tenant ${tenant_id}, skipping.`);
      return;
    }

    // 2. Resolve current academic year
    const academicYear = await tx.academicYear.findFirst({
      where: { tenant_id, is_current: true },
      select: { id: true },
    });

    if (!academicYear) {
      this.logger.warn(`No current academic year for tenant ${tenant_id}, skipping.`);
      return;
    }

    // 3. Get all active students
    const students = await tx.student.findMany({
      where: { tenant_id, status: 'active' },
      select: { id: true },
    });

    this.logger.log(
      `Tenant ${tenant_id}: computing early warning for ${students.length} students`,
    );

    // 4. Parse config JSONB fields (with defaults from Zod schemas created in Phase A)
    //    weightsJson, thresholdsJson, hysteresisBuffer are typed by Phase A Zod schemas.
    //    The scoring engine (Phase C) accepts these as arguments.
    //
    //    IMPORT NOTE: The actual signal collector classes and scoring engine are
    //    instantiated here. They are created in Phases B and C. The exact imports are:
    //
    //    import { AttendanceSignalCollector } from '@/modules/early-warning/collectors/attendance-signal.collector';
    //    import { GradesSignalCollector } from '@/modules/early-warning/collectors/grades-signal.collector';
    //    import { BehaviourSignalCollector } from '@/modules/early-warning/collectors/behaviour-signal.collector';
    //    import { WellbeingSignalCollector } from '@/modules/early-warning/collectors/wellbeing-signal.collector';
    //    import { EngagementSignalCollector } from '@/modules/early-warning/collectors/engagement-signal.collector';
    //    import { computeRiskAssessment } from '@/modules/early-warning/engine/scoring.engine';
    //
    //    However, these are API-side classes (PrismaService-based). In the worker,
    //    collectors must be instantiated with the tx PrismaClient directly. Each
    //    collector has a method signature:
    //      collect(tx: PrismaClient, tenantId: string, studentId: string, academicYearId: string): Promise<SignalResult>
    //
    //    The scoring engine is pure computation:
    //      computeRiskAssessment(signals: SignalResult[], config: ScoringConfig, previousProfile: PreviousProfile | null): RiskAssessment

    const weightsJson = config.weights_json as Record<string, number>;
    const thresholdsJson = config.thresholds_json as Record<string, number>;
    const hysteresisBuffer = config.hysteresis_buffer;

    // 5. Instantiate collectors (worker-side: pass tx as PrismaClient)
    const attendanceCollector = new AttendanceSignalCollector();
    const gradesCollector = new GradesSignalCollector();
    const behaviourCollector = new BehaviourSignalCollector();
    const wellbeingCollector = new WellbeingSignalCollector();
    const engagementCollector = new EngagementSignalCollector();

    let profilesUpdated = 0;
    let tierTransitions = 0;

    // 6. Process each student
    for (const student of students) {
      try {
        // 6a. Run all 5 collectors
        const [attendance, grades, behaviour, wellbeing, engagement] =
          await Promise.all([
            attendanceCollector.collect(tx, tenant_id, student.id, academicYear.id),
            gradesCollector.collect(tx, tenant_id, student.id, academicYear.id),
            behaviourCollector.collect(tx, tenant_id, student.id, academicYear.id),
            wellbeingCollector.collect(tx, tenant_id, student.id, academicYear.id),
            engagementCollector.collect(tx, tenant_id, student.id, academicYear.id),
          ]);

        // 6b. Load previous profile for hysteresis comparison
        const previousProfile = await tx.studentRiskProfile.findFirst({
          where: {
            tenant_id,
            student_id: student.id,
            academic_year_id: academicYear.id,
          },
          select: {
            id: true,
            composite_score: true,
            risk_tier: true,
            tier_entered_at: true,
            trend_json: true,
          },
        });

        // 6c. Compute risk assessment (pure function from Phase C)
        const assessment = computeRiskAssessment(
          [attendance, grades, behaviour, wellbeing, engagement],
          {
            weights: weightsJson,
            thresholds: thresholdsJson,
            hysteresisBuffer,
            crossDomainThreshold: 40,
          },
          previousProfile
            ? {
                compositeScore: Number(previousProfile.composite_score),
                riskTier: previousProfile.risk_tier as 'green' | 'yellow' | 'amber' | 'red',
                tierEnteredAt: previousProfile.tier_entered_at,
                trendData: (previousProfile.trend_json as number[]) ?? [],
              }
            : null,
        );

        // 6d. Persist all detected signals to student_risk_signals (append-only)
        if (assessment.signals.length > 0) {
          await tx.studentRiskSignal.createMany({
            data: assessment.signals.map((signal) => ({
              tenant_id,
              student_id: student.id,
              academic_year_id: academicYear.id,
              domain: signal.domain,
              signal_type: signal.signalType,
              severity: signal.severity,
              score_contribution: signal.scoreContribution,
              details_json: signal.details as Record<string, unknown>,
              source_entity_type: signal.sourceEntityType,
              source_entity_id: signal.sourceEntityId,
              detected_at: new Date(),
            })),
          });
        }

        // 6e. Upsert student_risk_profiles
        const now = new Date();
        const profileData = {
          composite_score: assessment.compositeScore,
          risk_tier: assessment.riskTier,
          tier_entered_at: assessment.tierChanged ? now : (previousProfile?.tier_entered_at ?? now),
          attendance_score: assessment.domainScores.attendance,
          grades_score: assessment.domainScores.grades,
          behaviour_score: assessment.domainScores.behaviour,
          wellbeing_score: assessment.domainScores.wellbeing,
          engagement_score: assessment.domainScores.engagement,
          signal_summary_json: {
            text: assessment.summaryText,
            topSignals: assessment.signals.slice(0, 5).map((s) => ({
              type: s.signalType,
              domain: s.domain,
              contribution: s.scoreContribution,
              summary: s.summaryFragment,
            })),
          },
          trend_json: assessment.trendData,
          last_computed_at: now,
        };

        let profileId: string;

        if (previousProfile) {
          await tx.studentRiskProfile.update({
            where: { id: previousProfile.id },
            data: profileData,
          });
          profileId = previousProfile.id;
        } else {
          const created = await tx.studentRiskProfile.create({
            data: {
              tenant_id,
              student_id: student.id,
              academic_year_id: academicYear.id,
              ...profileData,
            },
          });
          profileId = created.id;
        }

        profilesUpdated++;

        // 6f. Log tier transition if tier changed
        if (assessment.tierChanged) {
          await tx.earlyWarningTierTransition.create({
            data: {
              tenant_id,
              student_id: student.id,
              profile_id: profileId,
              from_tier: assessment.previousTier,
              to_tier: assessment.riskTier,
              composite_score: assessment.compositeScore,
              trigger_signals_json: assessment.signals.slice(0, 5).map((s) => ({
                type: s.signalType,
                domain: s.domain,
                contribution: s.scoreContribution,
              })),
              transitioned_at: now,
            },
          });

          tierTransitions++;

          // 6g. Action layer: route notification for tier change
          //     This calls the routing evaluator and creates notifications.
          //     In the worker context, we create notifications directly via Prisma
          //     (not through the API NotificationsService, which requires PrismaService).
          await this.handleTierTransition(
            tx,
            tenant_id,
            student.id,
            profileId,
            assessment,
            config,
          );
        }
      } catch (err: unknown) {
        this.logger.error(
          `Failed to compute risk for student ${student.id}: ${String(err)}`,
        );
        // Continue processing remaining students — don't let one failure abort the batch
      }
    }

    this.logger.log(
      `Tenant ${tenant_id}: early warning complete — ${profilesUpdated} profiles updated, ${tierTransitions} tier transition(s)`,
    );
  }

  // ─── Action layer: tier transition handling ─────────────────────────────────

  /**
   * When a student's tier changes, resolve recipients per routing rules and
   * create notification records + tier transition log entry.
   *
   * Routing logic:
   * - green: no notification (improving)
   * - yellow: homeroom teacher (class_enrolments -> classes -> class_staff)
   * - amber: year head (students -> year_groups -> membership role)
   * - red: principal + pastoral lead (tenant role assignments) + create draft intervention
   */
  private async handleTierTransition(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
    profileId: string,
    assessment: RiskAssessment,
    config: EarlyWarningConfigRow,
  ): Promise<void> {
    // Skip notifications when transitioning DOWN to green
    if (assessment.riskTier === 'green') {
      return;
    }

    // Resolve recipients based on the new tier
    const recipientUserIds = await this.resolveRecipients(
      tx,
      tenantId,
      studentId,
      assessment.riskTier,
      config,
    );

    if (recipientUserIds.length === 0) {
      this.logger.warn(
        `No recipients resolved for ${assessment.riskTier} tier change — student ${studentId}`,
      );
      return;
    }

    // Load student name for notification payload
    const student = await tx.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { first_name: true, last_name: true },
    });

    const studentName = student
      ? `${student.first_name} ${student.last_name}`
      : 'Unknown Student';

    // Find the transition record we just created
    const transition = await tx.earlyWarningTierTransition.findFirst({
      where: { profile_id: profileId, student_id: studentId, tenant_id: tenantId },
      orderBy: { transitioned_at: 'desc' },
      select: { id: true },
    });

    const now = new Date();

    // Create notification records for each recipient
    for (const userId of recipientUserIds) {
      const notification = await tx.notification.create({
        data: {
          tenant_id: tenantId,
          recipient_user_id: userId,
          channel: 'in_app',
          template_key: 'early_warning_tier_change',
          locale: 'en',
          status: 'delivered',
          payload_json: {
            student_id: studentId,
            student_name: studentName,
            new_tier: assessment.riskTier,
            previous_tier: assessment.previousTier,
            composite_score: assessment.compositeScore,
            top_signals: assessment.signals.slice(0, 3).map((s) => ({
              type: s.signalType,
              domain: s.domain,
              summary: s.summaryFragment,
            })),
            summary_text: assessment.summaryText,
          },
          source_entity_type: 'EarlyWarningTierTransition',
          source_entity_id: transition?.id ?? null,
          delivered_at: now,
        },
      });

      // Update transition record with notification_id and routed_to_user_id
      if (transition) {
        await tx.earlyWarningTierTransition.update({
          where: { id: transition.id },
          data: {
            routed_to_user_id: userId,
            notification_id: notification.id,
          },
        });
      }
    }

    // Assign the first recipient as the profile owner
    await tx.studentRiskProfile.update({
      where: { id: profileId },
      data: {
        assigned_to_user_id: recipientUserIds[0],
        assigned_at: now,
      },
    });

    // RED tier only: create a draft pastoral intervention
    if (assessment.riskTier === 'red') {
      await this.createDraftIntervention(
        tx,
        tenantId,
        studentId,
        assessment,
      );
    }
  }

  // ─── Recipient resolution ───────────────────────────────────────────────────

  /**
   * Resolves recipient user IDs based on the new risk tier and routing rules.
   *
   * Routing rules come from early_warning_configs.routing_rules_json:
   * {
   *   yellow: { role: 'homeroom_teacher' },
   *   amber: { role: 'year_head' },
   *   red: { roles: ['principal', 'pastoral_lead'] }
   * }
   *
   * Resolution strategies:
   * - homeroom_teacher: class_enrolments -> classes -> class_staff (primary_teacher or homeroom role)
   * - year_head: students.year_group_id -> membershipRole with year_head role_key
   * - principal / pastoral_lead: membershipRole with matching role_key
   */
  private async resolveRecipients(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
    tier: 'yellow' | 'amber' | 'red',
    config: EarlyWarningConfigRow,
  ): Promise<string[]> {
    const routingRules = (config.routing_rules_json ?? {}) as Record<string, unknown>;
    const tierRule = routingRules[tier] as Record<string, unknown> | undefined;

    // Determine which roles to resolve
    let roleKeys: string[] = [];

    if (tierRule) {
      if (typeof tierRule.role === 'string') {
        roleKeys = [tierRule.role];
      } else if (Array.isArray(tierRule.roles)) {
        roleKeys = tierRule.roles.filter((r): r is string => typeof r === 'string');
      }
    }

    // Fallback defaults if no routing rules configured
    if (roleKeys.length === 0) {
      switch (tier) {
        case 'yellow':
          roleKeys = ['homeroom_teacher'];
          break;
        case 'amber':
          roleKeys = ['year_head'];
          break;
        case 'red':
          roleKeys = ['principal', 'pastoral_lead'];
          break;
      }
    }

    const userIds: string[] = [];

    for (const roleKey of roleKeys) {
      if (roleKey === 'homeroom_teacher') {
        const ids = await this.resolveHomeroomTeacher(tx, tenantId, studentId);
        userIds.push(...ids);
      } else if (roleKey === 'year_head') {
        const ids = await this.resolveYearHead(tx, tenantId, studentId);
        userIds.push(...ids);
      } else {
        // Generic role resolution via MembershipRole -> TenantMembership
        const ids = await this.resolveByRole(tx, tenantId, roleKey);
        userIds.push(...ids);
      }
    }

    // Deduplicate
    return [...new Set(userIds)];
  }

  /**
   * Resolves the homeroom teacher for a student.
   * Path: class_enrolments -> classes -> class_staff (primary_teacher = true)
   */
  private async resolveHomeroomTeacher(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
  ): Promise<string[]> {
    // Find student's current class enrolment
    const enrolment = await tx.classEnrolment.findFirst({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: 'active',
      },
      select: { class_id: true },
    });

    if (!enrolment) return [];

    // Find the primary teacher / homeroom teacher for this class
    const classStaff = await tx.classStaff.findMany({
      where: {
        tenant_id: tenantId,
        class_id: enrolment.class_id,
        OR: [
          { is_primary: true },
          { role: 'homeroom_teacher' },
        ],
      },
      select: { staff_id: true },
    });

    if (classStaff.length === 0) return [];

    // Resolve staff -> user IDs via staff records
    const staffIds = classStaff.map((cs) => cs.staff_id);
    const staffMembers = await tx.staff.findMany({
      where: { id: { in: staffIds }, tenant_id: tenantId },
      select: { user_id: true },
    });

    return staffMembers
      .filter((s) => s.user_id !== null)
      .map((s) => s.user_id as string);
  }

  /**
   * Resolves year head for a student's year group.
   * Path: students.year_group_id -> membershipRole with year_head role_key
   */
  private async resolveYearHead(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
  ): Promise<string[]> {
    const student = await tx.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { year_group_id: true },
    });

    if (!student?.year_group_id) return [];

    const memberships = await tx.membershipRole.findMany({
      where: {
        tenant_id: tenantId,
        role: { role_key: 'year_head' },
        membership: { membership_status: 'active' },
      },
      select: {
        membership: { select: { user_id: true } },
      },
    });

    return memberships.map((mr) => mr.membership.user_id);
  }

  /**
   * Generic role resolution via MembershipRole -> TenantMembership -> user_id.
   */
  private async resolveByRole(
    tx: PrismaClient,
    tenantId: string,
    roleKey: string,
  ): Promise<string[]> {
    const memberships = await tx.membershipRole.findMany({
      where: {
        tenant_id: tenantId,
        role: { role_key: roleKey },
        membership: { membership_status: 'active' },
      },
      select: {
        membership: { select: { user_id: true } },
      },
    });

    return memberships.map((mr) => mr.membership.user_id);
  }

  // ─── Red tier: draft pastoral intervention ──────────────────────────────────

  /**
   * On red tier entry: create a draft PastoralIntervention linked to the student.
   * The intervention is created as 'draft' — staff must review and activate.
   */
  private async createDraftIntervention(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
    assessment: RiskAssessment,
  ): Promise<void> {
    // Check if a pastoral case exists for this student; if not, skip.
    // Interventions require a parent case in the pastoral module.
    const openCase = await tx.pastoralCase.findFirst({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: { in: ['open', 'active'] },
      },
      select: { id: true },
    });

    if (!openCase) {
      this.logger.log(
        `No open pastoral case for student ${studentId} — skipping draft intervention`,
      );
      return;
    }

    // Check for existing early_warning_referral intervention to avoid duplicates
    const existing = await tx.pastoralIntervention.findFirst({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        intervention_type: 'early_warning_referral',
        status: { notIn: ['achieved', 'not_achieved', 'withdrawn'] },
      },
      select: { id: true },
    });

    if (existing) {
      this.logger.log(
        `Existing early_warning_referral intervention found for student ${studentId} — skipping`,
      );
      return;
    }

    const objectives = assessment.signals.slice(0, 5).map((s) => ({
      domain: s.domain,
      signal: s.signalType,
      target: `Address ${s.summaryFragment}`,
    }));

    await tx.pastoralIntervention.create({
      data: {
        tenant_id: tenantId,
        case_id: openCase.id,
        student_id: studentId,
        intervention_type: 'early_warning_referral',
        continuum_level: 3,
        target_outcomes: objectives,
        review_cycle_weeks: 2,
        next_review_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        parent_informed: false,
        status: 'draft',
        created_by_user_id: '00000000-0000-0000-0000-000000000000', // SYSTEM_USER_SENTINEL
      },
    });

    this.logger.log(
      `Created draft early_warning_referral intervention for student ${studentId}`,
    );
  }
}

// ─── Type references (from Phase A shared types + Phase C scoring engine) ─────

// These types are defined in:
//   packages/shared/src/early-warning/types.ts (Phase A)
//   apps/api/src/modules/early-warning/engine/types.ts (Phase C)
//
// The actual imports at the top of the file will be:
//
// import type { RiskAssessment, SignalResult } from '../../types/early-warning';
// import { computeRiskAssessment } from '../../engine/early-warning/scoring.engine';
// import { AttendanceSignalCollector } from '../../collectors/early-warning/attendance-signal.collector';
// ... etc
//
// NOTE: The collectors and engine are created in Phases B and C respectively.
// The worker needs thin adapter wrappers that accept PrismaClient (not PrismaService).
// Phase B collectors should expose a static/standalone `collect()` method that takes
// a PrismaClient transaction client, not depend on NestJS DI.
//
// Exact import paths will be resolved when Phases B and C are implemented.
// The TYPE shapes are:
//
// interface RiskAssessment — see spec
// interface SignalResult — see spec
// interface DetectedSignal — see spec
// interface EarlyWarningConfigRow — Prisma generated type for early_warning_configs

type RiskAssessment = import('@school/shared').RiskAssessment;
type SignalResult = import('@school/shared').SignalResult;
type EarlyWarningConfigRow = {
  routing_rules_json: unknown;
  weights_json: unknown;
  thresholds_json: unknown;
  hysteresis_buffer: number;
  high_severity_events_json: unknown;
  digest_day: number;
  digest_recipients_json: unknown;
};

// Placeholder class references — replaced by actual imports from Phase B/C
declare class AttendanceSignalCollector {
  collect(tx: PrismaClient, tenantId: string, studentId: string, academicYearId: string): Promise<SignalResult>;
}
declare class GradesSignalCollector {
  collect(tx: PrismaClient, tenantId: string, studentId: string, academicYearId: string): Promise<SignalResult>;
}
declare class BehaviourSignalCollector {
  collect(tx: PrismaClient, tenantId: string, studentId: string, academicYearId: string): Promise<SignalResult>;
}
declare class WellbeingSignalCollector {
  collect(tx: PrismaClient, tenantId: string, studentId: string, academicYearId: string): Promise<SignalResult>;
}
declare class EngagementSignalCollector {
  collect(tx: PrismaClient, tenantId: string, studentId: string, academicYearId: string): Promise<SignalResult>;
}
declare function computeRiskAssessment(
  signals: SignalResult[],
  config: {
    weights: Record<string, number>;
    thresholds: Record<string, number>;
    hysteresisBuffer: number;
    crossDomainThreshold: number;
  },
  previousProfile: {
    compositeScore: number;
    riskTier: 'green' | 'yellow' | 'amber' | 'red';
    tierEnteredAt: Date | null;
    trendData: number[];
  } | null,
): RiskAssessment;
```

**Key design decisions:**
- Collectors are instantiated per-run (not injected via DI) because the worker has no NestJS service container for API modules
- Each collector exposes a `collect(tx, tenantId, studentId, academicYearId)` method that works with a raw `PrismaClient` transaction
- Errors per-student are caught and logged; processing continues for remaining students
- The `declare` blocks at the bottom are documentation — they will be replaced by actual imports once Phases B and C are implemented

---

### Step 4 — Single-Student Compute Processor (Intraday)

**File:** `apps/worker/src/processors/early-warning/early-warning-compute-student.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const EARLY_WARNING_COMPUTE_STUDENT_JOB = 'early-warning:compute-student';

// ─── Payload ──────────────────────────────────────────────────────────────────

export interface EarlyWarningComputeStudentPayload extends TenantJobPayload {
  student_id: string;
  trigger_event: string; // e.g. 'suspension', 'critical_incident', 'third_consecutive_absence'
}

// ─── Processor ────────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.EARLY_WARNING)
export class EarlyWarningComputeStudentProcessor extends WorkerHost {
  private readonly logger = new Logger(EarlyWarningComputeStudentProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<EarlyWarningComputeStudentPayload>): Promise<void> {
    if (job.name !== EARLY_WARNING_COMPUTE_STUDENT_JOB) {
      return;
    }

    const { tenant_id, student_id, trigger_event } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${EARLY_WARNING_COMPUTE_STUDENT_JOB} — student ${student_id}, trigger: ${trigger_event}`,
    );

    const innerJob = new ComputeStudentJob(this.prisma);
    await innerJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ────────────────────────────────────────────

class ComputeStudentJob extends TenantAwareJob<EarlyWarningComputeStudentPayload> {
  private readonly logger = new Logger(ComputeStudentJob.name);

  protected async processJob(
    data: EarlyWarningComputeStudentPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, student_id, trigger_event } = data;

    // 1. Load tenant config — verify enabled
    const config = await tx.earlyWarningConfig.findFirst({
      where: { tenant_id },
    });

    if (!config || !config.is_enabled) {
      this.logger.log(`Early warning disabled for tenant ${tenant_id}, skipping.`);
      return;
    }

    // 2. Verify the trigger event is in the high-severity events list
    const highSeverityEvents = (config.high_severity_events_json ?? []) as string[];
    if (!highSeverityEvents.includes(trigger_event)) {
      this.logger.log(
        `Trigger event '${trigger_event}' is not in high_severity_events for tenant ${tenant_id}, skipping.`,
      );
      return;
    }

    // 3. Verify student exists and is active
    const student = await tx.student.findFirst({
      where: { id: student_id, tenant_id, status: 'active' },
      select: { id: true },
    });

    if (!student) {
      this.logger.warn(`Student ${student_id} not found or inactive for tenant ${tenant_id}, skipping.`);
      return;
    }

    // 4. Resolve current academic year
    const academicYear = await tx.academicYear.findFirst({
      where: { tenant_id, is_current: true },
      select: { id: true },
    });

    if (!academicYear) {
      this.logger.warn(`No current academic year for tenant ${tenant_id}, skipping.`);
      return;
    }

    // 5. Run the same pipeline as daily compute, but for a single student
    //    This is identical to the per-student loop body in ComputeDailyJob.
    //    The code is intentionally duplicated (not extracted to a shared class)
    //    because the daily job runs inside a single RLS transaction per tenant
    //    while this job is a standalone transaction for one student.

    const weightsJson = config.weights_json as Record<string, number>;
    const thresholdsJson = config.thresholds_json as Record<string, number>;
    const hysteresisBuffer = config.hysteresis_buffer;

    // Instantiate collectors
    const attendanceCollector = new AttendanceSignalCollector();
    const gradesCollector = new GradesSignalCollector();
    const behaviourCollector = new BehaviourSignalCollector();
    const wellbeingCollector = new WellbeingSignalCollector();
    const engagementCollector = new EngagementSignalCollector();

    // Run all 5 collectors in parallel
    const [attendance, grades, behaviour, wellbeing, engagement] =
      await Promise.all([
        attendanceCollector.collect(tx, tenant_id, student_id, academicYear.id),
        gradesCollector.collect(tx, tenant_id, student_id, academicYear.id),
        behaviourCollector.collect(tx, tenant_id, student_id, academicYear.id),
        wellbeingCollector.collect(tx, tenant_id, student_id, academicYear.id),
        engagementCollector.collect(tx, tenant_id, student_id, academicYear.id),
      ]);

    // Load previous profile
    const previousProfile = await tx.studentRiskProfile.findFirst({
      where: {
        tenant_id,
        student_id,
        academic_year_id: academicYear.id,
      },
      select: {
        id: true,
        composite_score: true,
        risk_tier: true,
        tier_entered_at: true,
        trend_json: true,
      },
    });

    // Compute risk assessment
    const assessment = computeRiskAssessment(
      [attendance, grades, behaviour, wellbeing, engagement],
      {
        weights: weightsJson,
        thresholds: thresholdsJson,
        hysteresisBuffer,
        crossDomainThreshold: 40,
      },
      previousProfile
        ? {
            compositeScore: Number(previousProfile.composite_score),
            riskTier: previousProfile.risk_tier as 'green' | 'yellow' | 'amber' | 'red',
            tierEnteredAt: previousProfile.tier_entered_at,
            trendData: (previousProfile.trend_json as number[]) ?? [],
          }
        : null,
    );

    // Persist signals
    if (assessment.signals.length > 0) {
      await tx.studentRiskSignal.createMany({
        data: assessment.signals.map((signal) => ({
          tenant_id,
          student_id,
          academic_year_id: academicYear.id,
          domain: signal.domain,
          signal_type: signal.signalType,
          severity: signal.severity,
          score_contribution: signal.scoreContribution,
          details_json: signal.details as Record<string, unknown>,
          source_entity_type: signal.sourceEntityType,
          source_entity_id: signal.sourceEntityId,
          detected_at: new Date(),
        })),
      });
    }

    // Upsert profile
    const now = new Date();
    const profileData = {
      composite_score: assessment.compositeScore,
      risk_tier: assessment.riskTier,
      tier_entered_at: assessment.tierChanged ? now : (previousProfile?.tier_entered_at ?? now),
      attendance_score: assessment.domainScores.attendance,
      grades_score: assessment.domainScores.grades,
      behaviour_score: assessment.domainScores.behaviour,
      wellbeing_score: assessment.domainScores.wellbeing,
      engagement_score: assessment.domainScores.engagement,
      signal_summary_json: {
        text: assessment.summaryText,
        topSignals: assessment.signals.slice(0, 5).map((s) => ({
          type: s.signalType,
          domain: s.domain,
          contribution: s.scoreContribution,
          summary: s.summaryFragment,
        })),
      },
      trend_json: assessment.trendData,
      last_computed_at: now,
    };

    let profileId: string;

    if (previousProfile) {
      await tx.studentRiskProfile.update({
        where: { id: previousProfile.id },
        data: profileData,
      });
      profileId = previousProfile.id;
    } else {
      const created = await tx.studentRiskProfile.create({
        data: {
          tenant_id,
          student_id,
          academic_year_id: academicYear.id,
          ...profileData,
        },
      });
      profileId = created.id;
    }

    // Log tier transition
    if (assessment.tierChanged) {
      await tx.earlyWarningTierTransition.create({
        data: {
          tenant_id,
          student_id,
          profile_id: profileId,
          from_tier: assessment.previousTier,
          to_tier: assessment.riskTier,
          composite_score: assessment.compositeScore,
          trigger_signals_json: assessment.signals.slice(0, 5).map((s) => ({
            type: s.signalType,
            domain: s.domain,
            contribution: s.scoreContribution,
          })),
          transitioned_at: now,
        },
      });

      this.logger.log(
        `Student ${student_id} tier changed: ${assessment.previousTier ?? 'none'} -> ${assessment.riskTier} (trigger: ${trigger_event})`,
      );

      // NOTE: Action layer routing for intraday triggers is handled identically
      // to the daily compute. The handleTierTransition method is duplicated here
      // from ComputeDailyJob. When extracting to a shared utility, move both to
      // a shared function in a separate file.
      //
      // For the implementation plan, the same routing logic from Step 3
      // (resolveRecipients, handleTierTransition, createDraftIntervention)
      // must be present in this class. The implementer should extract a shared
      // utility module:
      //
      //   apps/worker/src/processors/early-warning/early-warning-action.utils.ts
      //
      // that exports:
      //   - handleTierTransition(tx, tenantId, studentId, profileId, assessment, config)
      //   - resolveRecipients(tx, tenantId, studentId, tier, config)
      //   - resolveHomeroomTeacher(tx, tenantId, studentId)
      //   - resolveYearHead(tx, tenantId, studentId)
      //   - resolveByRole(tx, tenantId, roleKey)
      //   - createDraftIntervention(tx, tenantId, studentId, assessment)
      //
      // Both ComputeDailyJob and ComputeStudentJob import from this shared utility.
    }

    this.logger.log(
      `Intraday recompute complete for student ${student_id} (trigger: ${trigger_event})`,
    );
  }
}

// ─── Type references (same as daily processor) ───────────────────────────────
// See Step 3 for full type/import declarations.
// These are resolved at implementation time from Phases A, B, C.
```

**Key design decision:** The per-student pipeline is identical to the daily pipeline but scoped to one student. Rather than duplicating all action-layer methods, the implementer should extract shared utility functions into `early-warning-action.utils.ts`.

---

### Step 5 — Weekly Digest Processor

**File:** `apps/worker/src/processors/early-warning/early-warning-digest.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const EARLY_WARNING_WEEKLY_DIGEST_JOB = 'early-warning:weekly-digest';

// ─── Payload ──────────────────────────────────────────────────────────────────

export type EarlyWarningWeeklyDigestPayload = TenantJobPayload;

// ─── Processor ────────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.EARLY_WARNING)
export class EarlyWarningDigestProcessor extends WorkerHost {
  private readonly logger = new Logger(EarlyWarningDigestProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<EarlyWarningWeeklyDigestPayload>): Promise<void> {
    if (job.name !== EARLY_WARNING_WEEKLY_DIGEST_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (tenant_id) {
      this.logger.log(
        `Processing ${EARLY_WARNING_WEEKLY_DIGEST_JOB} — tenant ${tenant_id}`,
      );
      const innerJob = new WeeklyDigestJob(this.prisma);
      await innerJob.execute(job.data);
      return;
    }

    // Cross-tenant cron mode
    this.logger.log(
      `Processing ${EARLY_WARNING_WEEKLY_DIGEST_JOB} — cross-tenant cron run`,
    );

    // Only process tenants where today matches their configured digest_day
    const today = new Date().getDay(); // 0=Sunday, 1=Monday, ...

    const configs = await this.prisma.earlyWarningConfig.findMany({
      where: {
        is_enabled: true,
        digest_day: today,
        tenant: { status: 'active' },
      },
      select: { tenant_id: true },
    });

    let successCount = 0;
    for (const config of configs) {
      const innerJob = new WeeklyDigestJob(this.prisma);
      try {
        await innerJob.execute({ tenant_id: config.tenant_id });
        successCount++;
      } catch (err: unknown) {
        this.logger.error(
          `Weekly digest failed for tenant ${config.tenant_id}: ${String(err)}`,
        );
      }
    }

    this.logger.log(
      `${EARLY_WARNING_WEEKLY_DIGEST_JOB} cron complete: ${successCount}/${configs.length} tenants processed`,
    );
  }
}

// ─── TenantAwareJob implementation ────────────────────────────────────────────

class WeeklyDigestJob extends TenantAwareJob<EarlyWarningWeeklyDigestPayload> {
  private readonly logger = new Logger(WeeklyDigestJob.name);

  protected async processJob(
    data: EarlyWarningWeeklyDigestPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id } = data;

    // 1. Load config
    const config = await tx.earlyWarningConfig.findFirst({
      where: { tenant_id },
    });

    if (!config || !config.is_enabled) {
      this.logger.log(`Early warning disabled for tenant ${tenant_id}, skipping digest.`);
      return;
    }

    // 2. Get current academic year
    const academicYear = await tx.academicYear.findFirst({
      where: { tenant_id, is_current: true },
      select: { id: true },
    });

    if (!academicYear) return;

    // 3. Query tier distribution
    const profiles = await tx.studentRiskProfile.findMany({
      where: {
        tenant_id,
        academic_year_id: academicYear.id,
      },
      select: {
        student_id: true,
        composite_score: true,
        risk_tier: true,
        attendance_score: true,
        grades_score: true,
        behaviour_score: true,
        wellbeing_score: true,
        engagement_score: true,
        signal_summary_json: true,
        student: {
          select: { first_name: true, last_name: true },
        },
      },
      orderBy: { composite_score: 'desc' },
    });

    // 4. Build tier distribution
    const distribution: Record<string, number> = { green: 0, yellow: 0, amber: 0, red: 0 };
    for (const p of profiles) {
      const tier = p.risk_tier as string;
      distribution[tier] = (distribution[tier] ?? 0) + 1;
    }

    // 5. Get top N at-risk students (configurable, default 10)
    const topN = 10;
    const topAtRisk = profiles.slice(0, topN).map((p) => ({
      student_name: p.student
        ? `${p.student.first_name} ${p.student.last_name}`
        : 'Unknown',
      composite_score: Number(p.composite_score),
      risk_tier: p.risk_tier,
      top_domain: this.getTopDomain(p),
    }));

    // 6. Calculate week-over-week changes
    //    Compare current tier distribution against last week's transitions
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentTransitions = await tx.earlyWarningTierTransition.count({
      where: {
        tenant_id,
        transitioned_at: { gte: oneWeekAgo },
      },
    });

    const newRedEntries = await tx.earlyWarningTierTransition.count({
      where: {
        tenant_id,
        to_tier: 'red',
        transitioned_at: { gte: oneWeekAgo },
      },
    });

    // 7. Resolve digest recipients
    const digestRecipients = (config.digest_recipients_json ?? []) as string[];

    if (digestRecipients.length === 0) {
      this.logger.log(
        `No digest recipients configured for tenant ${tenant_id}, skipping.`,
      );
      return;
    }

    // 8. Create digest notification for each recipient
    const now = new Date();
    const digestPayload = {
      distribution,
      top_at_risk: topAtRisk,
      total_students: profiles.length,
      tier_transitions_this_week: recentTransitions,
      new_red_entries: newRedEntries,
      generated_at: now.toISOString(),
    };

    for (const userId of digestRecipients) {
      await tx.notification.create({
        data: {
          tenant_id,
          recipient_user_id: userId,
          channel: 'email',
          template_key: 'early_warning_weekly_digest',
          locale: 'en',
          status: 'queued',
          payload_json: digestPayload,
          source_entity_type: 'EarlyWarningDigest',
          source_entity_id: null,
        },
      });
    }

    this.logger.log(
      `Weekly digest sent for tenant ${tenant_id}: ${digestRecipients.length} recipients, ` +
        `${profiles.length} students (R:${distribution.red} A:${distribution.amber} Y:${distribution.yellow} G:${distribution.green})`,
    );
  }

  /**
   * Returns the domain name with the highest sub-score for a profile.
   */
  private getTopDomain(profile: {
    attendance_score: unknown;
    grades_score: unknown;
    behaviour_score: unknown;
    wellbeing_score: unknown;
    engagement_score: unknown;
  }): string {
    const domains: [string, number][] = [
      ['attendance', Number(profile.attendance_score)],
      ['grades', Number(profile.grades_score)],
      ['behaviour', Number(profile.behaviour_score)],
      ['wellbeing', Number(profile.wellbeing_score)],
      ['engagement', Number(profile.engagement_score)],
    ];
    domains.sort((a, b) => b[1] - a[1]);
    return domains[0]?.[0] ?? 'unknown';
  }
}
```

---

### Step 6 — Cron Registration

**File:** `apps/worker/src/cron/cron-scheduler.service.ts`

**6a.** Add import at the top:

```typescript
import { EARLY_WARNING_COMPUTE_DAILY_JOB } from '../processors/early-warning/early-warning-compute.processor';
import { EARLY_WARNING_WEEKLY_DIGEST_JOB } from '../processors/early-warning/early-warning-digest.processor';
```

**6b.** Add queue injection to the constructor:

```typescript
constructor(
  @InjectQueue(QUEUE_NAMES.BEHAVIOUR) private readonly behaviourQueue: Queue,
  @InjectQueue(QUEUE_NAMES.EARLY_WARNING) private readonly earlyWarningQueue: Queue,  // <── NEW
  @InjectQueue(QUEUE_NAMES.GRADEBOOK) private readonly gradebookQueue: Queue,
  @InjectQueue(QUEUE_NAMES.IMPORTS) private readonly importsQueue: Queue,
  @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
  @InjectQueue(QUEUE_NAMES.WELLBEING) private readonly wellbeingQueue: Queue,
) {}
```

**6c.** Add registration call in `onModuleInit`:

```typescript
async onModuleInit(): Promise<void> {
  await this.registerEarlyWarningCronJobs();   // <── NEW
  await this.registerGradebookCronJobs();
  await this.registerBehaviourCronJobs();
  await this.registerNotificationsCronJobs();
  await this.registerWellbeingCronJobs();
  await this.registerCleanupCronJobs();
}
```

**6d.** Add the registration method:

```typescript
private async registerEarlyWarningCronJobs(): Promise<void> {
  // ── early-warning:compute-daily ───────────────────────────────────────────
  // Runs daily at 01:00 UTC. Cross-tenant — no tenant_id in payload.
  // Iterates all tenants with early_warning enabled.
  // Runs BEFORE gradebook:detect-risks (02:00 UTC) so risk profiles are fresh.
  await this.earlyWarningQueue.add(
    EARLY_WARNING_COMPUTE_DAILY_JOB,
    {},
    {
      repeat: { pattern: '0 1 * * *' },
      jobId: `cron:${EARLY_WARNING_COMPUTE_DAILY_JOB}`,
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );
  this.logger.log(`Registered repeatable cron: ${EARLY_WARNING_COMPUTE_DAILY_JOB} (daily 01:00 UTC)`);

  // ── early-warning:weekly-digest ───────────────────────────────────────────
  // Runs daily at 07:00 UTC. Cross-tenant — no tenant_id in payload.
  // Each tenant configures its digest_day (default Monday=1).
  // The processor checks today's day-of-week against each tenant's digest_day
  // and only processes matching tenants.
  await this.earlyWarningQueue.add(
    EARLY_WARNING_WEEKLY_DIGEST_JOB,
    {},
    {
      repeat: { pattern: '0 7 * * *' },
      jobId: `cron:${EARLY_WARNING_WEEKLY_DIGEST_JOB}`,
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );
  this.logger.log(`Registered repeatable cron: ${EARLY_WARNING_WEEKLY_DIGEST_JOB} (daily 07:00 UTC, per-tenant digest_day filter)`);
}
```

**Why digest runs daily at 07:00 instead of weekly:** The digest_day is per-tenant configurable. Running the cron daily and filtering by `digest_day` inside the processor means each tenant gets their digest on their chosen day without needing per-tenant cron schedules.

---

### Step 7 — Integration: Existing Processors Enqueue Intraday Recompute

The trigger service lives in the API app (NestJS DI), NOT the worker. Worker processors enqueue the `early-warning:compute-student` job directly onto the EARLY_WARNING queue.

#### 7a. Evaluate Policy Processor (Behaviour Exclusion)

**File:** `apps/worker/src/processors/behaviour/evaluate-policy.processor.ts`

**Change:** Add `@InjectQueue(QUEUE_NAMES.EARLY_WARNING)` to the processor constructor and enqueue after exclusion-creating policy actions.

**Imports to add:**

```typescript
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';  // add InjectQueue
import { Queue } from 'bullmq';                                        // add Queue
import { EARLY_WARNING_COMPUTE_STUDENT_JOB } from '../early-warning/early-warning-compute-student.processor';
```

**Constructor change:**

```typescript
// Before:
constructor(
  @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
) {
  super();
}

// After:
constructor(
  @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  @InjectQueue(QUEUE_NAMES.EARLY_WARNING) private readonly earlyWarningQueue: Queue,
) {
  super();
}
```

**After the `process()` method's `evaluator.execute(job.data)` call, add:**

```typescript
async process(job: Job<EvaluatePolicyPayload>): Promise<void> {
  if (job.name !== EVALUATE_POLICY_JOB) {
    return;
  }

  // ... existing validation ...

  const evaluator = new EvaluatePolicyJob(this.prisma);
  await evaluator.execute(job.data);

  // ── Early warning intraday trigger ──────────────────────────────────────
  // If any participant received a sanction or exclusion-related action,
  // enqueue an early warning recompute for that student.
  // The evaluator tracks which students had exclusion-triggering actions.
  const affectedStudentIds = evaluator.exclusionAffectedStudentIds;
  for (const studentId of affectedStudentIds) {
    await this.earlyWarningQueue.add(
      EARLY_WARNING_COMPUTE_STUDENT_JOB,
      {
        tenant_id: job.data.tenant_id,
        student_id: studentId,
        trigger_event: 'suspension',
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    this.logger.log(
      `Enqueued early warning recompute for student ${studentId} (trigger: suspension)`,
    );
  }
}
```

**Inside EvaluatePolicyJob class, add tracking:**

```typescript
class EvaluatePolicyJob extends TenantAwareJob<EvaluatePolicyPayload> {
  // ... existing code ...

  /** Student IDs that received exclusion/suspension-related actions. Read after execute(). */
  public exclusionAffectedStudentIds: string[] = [];

  // Inside executeAction, for the relevant action types, track the student:
  // After the 'create_sanction' or suspension-related action cases, add:
  //   if (participant.student_id) {
  //     this.exclusionAffectedStudentIds.push(participant.student_id);
  //   }
}
```

**NOTE:** The exact integration point depends on which `action_type` values correspond to exclusions. The current evaluate-policy processor handles `require_parent_notification`, `require_approval`, `flag_for_review`, `create_task`, and `require_parent_meeting`. The `create_sanction` and `auto_escalate` types are listed in the default switch but not yet fully implemented. When they are implemented (or if an exclusion case is created by another mechanism), the student ID should be added to `exclusionAffectedStudentIds`. The implementer should check which action types result in suspensions/exclusions in the current codebase.

#### 7b. Notify Concern Processor (Critical Incident)

**File:** `apps/worker/src/processors/pastoral/notify-concern.processor.ts`

**Change:** Add `@InjectQueue(QUEUE_NAMES.EARLY_WARNING)` and enqueue after critical incident processing.

**Imports to add:**

```typescript
import { EARLY_WARNING_COMPUTE_STUDENT_JOB } from '../early-warning/early-warning-compute-student.processor';
```

**Constructor change:**

```typescript
// Before:
constructor(
  @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  @InjectQueue(QUEUE_NAMES.NOTIFICATIONS)
  private readonly notificationsQueue: Queue,
  @InjectQueue(QUEUE_NAMES.PASTORAL)
  private readonly pastoralQueue: Queue,
) {
  super();
}

// After:
constructor(
  @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  @InjectQueue(QUEUE_NAMES.EARLY_WARNING)
  private readonly earlyWarningQueue: Queue,
  @InjectQueue(QUEUE_NAMES.NOTIFICATIONS)
  private readonly notificationsQueue: Queue,
  @InjectQueue(QUEUE_NAMES.PASTORAL)
  private readonly pastoralQueue: Queue,
) {
  super();
}
```

**After the existing notification dispatch and escalation enqueue at the end of `process()`, add:**

```typescript
// ── Early warning intraday trigger for critical concerns ──────────────
if (
  job.data.severity === 'critical' &&
  job.data.student_id
) {
  await this.earlyWarningQueue.add(
    EARLY_WARNING_COMPUTE_STUDENT_JOB,
    {
      tenant_id: job.data.tenant_id,
      student_id: job.data.student_id,
      trigger_event: 'critical_incident',
    },
    { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
  );
  this.logger.log(
    `Enqueued early warning recompute for student ${job.data.student_id} (trigger: critical_incident)`,
  );
}
```

#### 7c. Attendance Pattern Detection Processor (Consecutive Absences)

**File:** `apps/worker/src/processors/attendance-pattern-detection.processor.ts`

**Change:** Add `@InjectQueue(QUEUE_NAMES.EARLY_WARNING)` and enqueue after excessive absence detection.

**Imports to add:**

```typescript
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';  // add InjectQueue
import { Queue } from 'bullmq';                                        // add Queue
import { EARLY_WARNING_COMPUTE_STUDENT_JOB } from './early-warning/early-warning-compute-student.processor';
```

Note the relative path from `apps/worker/src/processors/` to `apps/worker/src/processors/early-warning/`.

**Constructor change:**

```typescript
// Before:
constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
  super();
}

// After:
constructor(
  @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  @InjectQueue(QUEUE_NAMES.EARLY_WARNING) private readonly earlyWarningQueue: Queue,
) {
  super();
}
```

**Inside the `process()` method, after `innerJob.execute(job.data)`, add:**

```typescript
async process(job: Job<AttendancePatternDetectionPayload>): Promise<void> {
  // ... existing guard and validation ...

  const innerJob = new AttendancePatternDetectionJob(this.prisma);
  await innerJob.execute(job.data);

  // ── Early warning intraday trigger for excessive absences ──────────────
  // The inner job tracks student IDs that triggered excessive absence alerts.
  // Enqueue early warning recompute for each affected student.
  for (const studentId of innerJob.excessiveAbsenceStudentIds) {
    await this.earlyWarningQueue.add(
      EARLY_WARNING_COMPUTE_STUDENT_JOB,
      {
        tenant_id: job.data.tenant_id,
        student_id: studentId,
        trigger_event: 'third_consecutive_absence',
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    this.logger.log(
      `Enqueued early warning recompute for student ${studentId} (trigger: third_consecutive_absence)`,
    );
  }
}
```

**Inside AttendancePatternDetectionJob class, add tracking:**

```typescript
class AttendancePatternDetectionJob extends TenantAwareJob<AttendancePatternDetectionPayload> {
  // ... existing code ...

  /** Student IDs that triggered excessive absence alerts. Read after execute(). */
  public excessiveAbsenceStudentIds: string[] = [];

  // Inside checkExcessiveAbsences, after successful alert creation:
  private async checkExcessiveAbsences(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
    today: Date,
    config: PatternDetectionConfig,
  ): Promise<number> {
    // ... existing logic ...

    if (absenceCount >= config.excessiveAbsenceThreshold) {
      const created = await this.createAlertSafe(tx, { ... });
      if (created > 0) {
        this.excessiveAbsenceStudentIds.push(studentId);
      }
      return created;
    }

    return 0;
  }
}
```

---

### Step 8 — EarlyWarningRoutingService (API-Side)

**File:** `apps/api/src/modules/early-warning/early-warning-routing.service.ts`

This service is the API-side counterpart of the routing logic embedded in the worker processors. It is used by the API layer (Phase E) for manual re-routing, assignment, and testing. The worker processors contain their own routing implementation (see Step 3) because they operate with raw `PrismaClient`, not `PrismaService`.

```typescript
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RoutingResult {
  recipientUserIds: string[];
  routedRole: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class EarlyWarningRoutingService {
  private readonly logger = new Logger(EarlyWarningRoutingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves notification recipients for a tier change event.
   *
   * @param tenantId - Tenant context
   * @param studentId - Student whose tier changed
   * @param tier - The new risk tier
   * @param routingRulesJson - The routing_rules_json from early_warning_configs
   * @returns Array of user IDs to notify
   */
  async resolveRecipients(
    tenantId: string,
    studentId: string,
    tier: 'yellow' | 'amber' | 'red',
    routingRulesJson: Record<string, unknown>,
  ): Promise<RoutingResult> {
    const tierRule = routingRulesJson[tier] as Record<string, unknown> | undefined;

    let roleKeys: string[] = [];

    if (tierRule) {
      if (typeof tierRule.role === 'string') {
        roleKeys = [tierRule.role];
      } else if (Array.isArray(tierRule.roles)) {
        roleKeys = tierRule.roles.filter((r): r is string => typeof r === 'string');
      }
    }

    // Fallback defaults
    if (roleKeys.length === 0) {
      switch (tier) {
        case 'yellow':
          roleKeys = ['homeroom_teacher'];
          break;
        case 'amber':
          roleKeys = ['year_head'];
          break;
        case 'red':
          roleKeys = ['principal', 'pastoral_lead'];
          break;
      }
    }

    const userIds: string[] = [];

    for (const roleKey of roleKeys) {
      if (roleKey === 'homeroom_teacher') {
        const ids = await this.resolveHomeroomTeacher(tenantId, studentId);
        userIds.push(...ids);
      } else if (roleKey === 'year_head') {
        const ids = await this.resolveYearHead(tenantId, studentId);
        userIds.push(...ids);
      } else {
        const ids = await this.resolveByRole(tenantId, roleKey);
        userIds.push(...ids);
      }
    }

    return {
      recipientUserIds: [...new Set(userIds)],
      routedRole: roleKeys.join(', '),
    };
  }

  // ─── Resolution strategies ────────────────────────────────────────────────

  private async resolveHomeroomTeacher(
    tenantId: string,
    studentId: string,
  ): Promise<string[]> {
    const enrolment = await this.prisma.classEnrolment.findFirst({
      where: { tenant_id: tenantId, student_id: studentId, status: 'active' },
      select: { class_id: true },
    });

    if (!enrolment) return [];

    const classStaff = await this.prisma.classStaff.findMany({
      where: {
        tenant_id: tenantId,
        class_id: enrolment.class_id,
        OR: [{ is_primary: true }, { role: 'homeroom_teacher' }],
      },
      select: { staff_id: true },
    });

    if (classStaff.length === 0) return [];

    const staffIds = classStaff.map((cs) => cs.staff_id);
    const staffMembers = await this.prisma.staff.findMany({
      where: { id: { in: staffIds }, tenant_id: tenantId },
      select: { user_id: true },
    });

    return staffMembers
      .filter((s) => s.user_id !== null)
      .map((s) => s.user_id as string);
  }

  private async resolveYearHead(
    tenantId: string,
    studentId: string,
  ): Promise<string[]> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { year_group_id: true },
    });

    if (!student?.year_group_id) return [];

    const memberships = await this.prisma.membershipRole.findMany({
      where: {
        tenant_id: tenantId,
        role: { role_key: 'year_head' },
        membership: { membership_status: 'active' },
      },
      select: { membership: { select: { user_id: true } } },
    });

    return memberships.map((mr) => mr.membership.user_id);
  }

  private async resolveByRole(
    tenantId: string,
    roleKey: string,
  ): Promise<string[]> {
    const memberships = await this.prisma.membershipRole.findMany({
      where: {
        tenant_id: tenantId,
        role: { role_key: roleKey },
        membership: { membership_status: 'active' },
      },
      select: { membership: { select: { user_id: true } } },
    });

    return memberships.map((mr) => mr.membership.user_id);
  }
}
```

---

### Step 9 — EarlyWarningRoutingService Tests

**File:** `apps/api/src/modules/early-warning/early-warning-routing.service.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';

import { EarlyWarningRoutingService } from './early-warning-routing.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const TEACHER_USER_ID = '33333333-3333-3333-3333-333333333333';
const YEAR_HEAD_USER_ID = '44444444-4444-4444-4444-444444444444';
const PRINCIPAL_USER_ID = '55555555-5555-5555-5555-555555555555';
const CLASS_ID = '66666666-6666-6666-6666-666666666666';
const STAFF_ID = '77777777-7777-7777-7777-777777777777';

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    classEnrolment: {
      findFirst: jest.fn(),
    },
    classStaff: {
      findMany: jest.fn(),
    },
    staff: {
      findMany: jest.fn(),
    },
    student: {
      findFirst: jest.fn(),
    },
    membershipRole: {
      findMany: jest.fn(),
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EarlyWarningRoutingService', () => {
  let service: EarlyWarningRoutingService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarlyWarningRoutingService,
        { provide: 'PrismaService', useValue: mockPrisma },
      ],
    })
      .overrideProvider('PrismaService')
      .useValue(mockPrisma)
      .compile();

    service = module.get<EarlyWarningRoutingService>(EarlyWarningRoutingService);
    // Inject the mock directly since PrismaService is resolved by type
    (service as unknown as { prisma: typeof mockPrisma }).prisma = mockPrisma;
  });

  afterEach(() => jest.clearAllMocks());

  describe('resolveRecipients', () => {
    it('should resolve homeroom teacher for yellow tier', async () => {
      mockPrisma.classEnrolment.findFirst.mockResolvedValue({ class_id: CLASS_ID });
      mockPrisma.classStaff.findMany.mockResolvedValue([{ staff_id: STAFF_ID }]);
      mockPrisma.staff.findMany.mockResolvedValue([{ user_id: TEACHER_USER_ID }]);

      const result = await service.resolveRecipients(
        TENANT_ID,
        STUDENT_ID,
        'yellow',
        { yellow: { role: 'homeroom_teacher' } },
      );

      expect(result.recipientUserIds).toEqual([TEACHER_USER_ID]);
      expect(mockPrisma.classEnrolment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, student_id: STUDENT_ID, status: 'active' },
        }),
      );
    });

    it('should resolve year head for amber tier', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ year_group_id: 'yg-1' });
      mockPrisma.membershipRole.findMany.mockResolvedValue([
        { membership: { user_id: YEAR_HEAD_USER_ID } },
      ]);

      const result = await service.resolveRecipients(
        TENANT_ID,
        STUDENT_ID,
        'amber',
        { amber: { role: 'year_head' } },
      );

      expect(result.recipientUserIds).toEqual([YEAR_HEAD_USER_ID]);
    });

    it('should resolve multiple roles for red tier', async () => {
      mockPrisma.membershipRole.findMany
        .mockResolvedValueOnce([{ membership: { user_id: PRINCIPAL_USER_ID } }])
        .mockResolvedValueOnce([{ membership: { user_id: YEAR_HEAD_USER_ID } }]);

      const result = await service.resolveRecipients(
        TENANT_ID,
        STUDENT_ID,
        'red',
        { red: { roles: ['principal', 'pastoral_lead'] } },
      );

      expect(result.recipientUserIds).toHaveLength(2);
      expect(result.recipientUserIds).toContain(PRINCIPAL_USER_ID);
    });

    it('should use fallback defaults when no routing rules configured', async () => {
      mockPrisma.classEnrolment.findFirst.mockResolvedValue({ class_id: CLASS_ID });
      mockPrisma.classStaff.findMany.mockResolvedValue([{ staff_id: STAFF_ID }]);
      mockPrisma.staff.findMany.mockResolvedValue([{ user_id: TEACHER_USER_ID }]);

      const result = await service.resolveRecipients(
        TENANT_ID,
        STUDENT_ID,
        'yellow',
        {},   // empty routing rules
      );

      expect(result.recipientUserIds).toEqual([TEACHER_USER_ID]);
    });

    it('should deduplicate recipient user IDs', async () => {
      // Same user resolved through two different paths
      mockPrisma.membershipRole.findMany
        .mockResolvedValueOnce([{ membership: { user_id: PRINCIPAL_USER_ID } }])
        .mockResolvedValueOnce([{ membership: { user_id: PRINCIPAL_USER_ID } }]);

      const result = await service.resolveRecipients(
        TENANT_ID,
        STUDENT_ID,
        'red',
        { red: { roles: ['principal', 'pastoral_lead'] } },
      );

      expect(result.recipientUserIds).toEqual([PRINCIPAL_USER_ID]);
    });

    it('should return empty array when student has no class enrolment', async () => {
      mockPrisma.classEnrolment.findFirst.mockResolvedValue(null);

      const result = await service.resolveRecipients(
        TENANT_ID,
        STUDENT_ID,
        'yellow',
        {},
      );

      expect(result.recipientUserIds).toEqual([]);
    });

    it('should return empty array when student has no year group', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ year_group_id: null });

      const result = await service.resolveRecipients(
        TENANT_ID,
        STUDENT_ID,
        'amber',
        {},
      );

      expect(result.recipientUserIds).toEqual([]);
    });
  });
});
```

---

### Step 10 — EarlyWarningTriggerService (API-Side)

**File:** `apps/api/src/modules/early-warning/early-warning-trigger.service.ts`

This service is exported from the early-warning module for use by other API-side modules. It is the programmatic entry point for triggering intraday recomputation from within the API app (e.g., from API controllers or services that handle exclusion creation, critical incident creation, etc.).

**Note:** The worker-side integration (Step 7) enqueues directly onto the queue because worker processors do not have access to API-side services. This API-side trigger service is for cases where API-side code (not worker code) needs to trigger a recompute.

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';

// ─── Job constant ────────────────────────────────────────────────────────────

export const EARLY_WARNING_COMPUTE_STUDENT_JOB = 'early-warning:compute-student';

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class EarlyWarningTriggerService {
  private readonly logger = new Logger(EarlyWarningTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('early-warning') private readonly earlyWarningQueue: Queue,
  ) {}

  /**
   * Triggers an intraday risk recomputation for a single student.
   *
   * Checks:
   * 1. early_warning_configs.is_enabled for this tenant
   * 2. trigger_event is in high_severity_events_json
   *
   * If both pass, enqueues early-warning:compute-student job.
   * If either fails, this is a silent no-op (no error thrown).
   */
  async triggerStudentRecompute(
    tenantId: string,
    studentId: string,
    triggerEvent: string,
  ): Promise<void> {
    // 1. Check if early warning is enabled for this tenant
    const config = await this.prisma.earlyWarningConfig.findFirst({
      where: { tenant_id: tenantId },
      select: { is_enabled: true, high_severity_events_json: true },
    });

    if (!config || !config.is_enabled) {
      return; // Early warning not enabled — silent no-op
    }

    // 2. Check if this event type is in the high-severity events list
    const highSeverityEvents = (config.high_severity_events_json ?? []) as string[];
    if (!highSeverityEvents.includes(triggerEvent)) {
      return; // Event type not configured as high-severity — silent no-op
    }

    // 3. Enqueue the compute-student job
    await this.earlyWarningQueue.add(
      EARLY_WARNING_COMPUTE_STUDENT_JOB,
      {
        tenant_id: tenantId,
        student_id: studentId,
        trigger_event: triggerEvent,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    this.logger.log(
      `Enqueued early warning recompute for student ${studentId} (trigger: ${triggerEvent})`,
    );
  }
}
```

---

### Step 11 — EarlyWarningTriggerService Tests

**File:** `apps/api/src/modules/early-warning/early-warning-trigger.service.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';

import { EarlyWarningTriggerService, EARLY_WARNING_COMPUTE_STUDENT_JOB } from './early-warning-trigger.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';

// ─── Mocks ────────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    earlyWarningConfig: {
      findFirst: jest.fn(),
    },
  };
}

function buildMockQueue() {
  return {
    add: jest.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EarlyWarningTriggerService', () => {
  let service: EarlyWarningTriggerService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockQueue: ReturnType<typeof buildMockQueue>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockQueue = buildMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarlyWarningTriggerService,
        { provide: 'PrismaService', useValue: mockPrisma },
        { provide: getQueueToken('early-warning'), useValue: mockQueue },
      ],
    })
      .overrideProvider('PrismaService')
      .useValue(mockPrisma)
      .compile();

    service = module.get<EarlyWarningTriggerService>(EarlyWarningTriggerService);
    (service as unknown as { prisma: typeof mockPrisma }).prisma = mockPrisma;
  });

  afterEach(() => jest.clearAllMocks());

  describe('triggerStudentRecompute', () => {
    it('should enqueue compute-student job when enabled and event matches', async () => {
      mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue({
        is_enabled: true,
        high_severity_events_json: ['suspension', 'critical_incident', 'third_consecutive_absence'],
      });

      await service.triggerStudentRecompute(TENANT_ID, STUDENT_ID, 'suspension');

      expect(mockQueue.add).toHaveBeenCalledWith(
        EARLY_WARNING_COMPUTE_STUDENT_JOB,
        {
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          trigger_event: 'suspension',
        },
        expect.objectContaining({ attempts: 3 }),
      );
    });

    it('should be a no-op when early warning is disabled', async () => {
      mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue({
        is_enabled: false,
        high_severity_events_json: ['suspension'],
      });

      await service.triggerStudentRecompute(TENANT_ID, STUDENT_ID, 'suspension');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should be a no-op when no config exists', async () => {
      mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue(null);

      await service.triggerStudentRecompute(TENANT_ID, STUDENT_ID, 'suspension');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should be a no-op when trigger event is not in high_severity_events', async () => {
      mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue({
        is_enabled: true,
        high_severity_events_json: ['suspension'], // only suspension
      });

      await service.triggerStudentRecompute(TENANT_ID, STUDENT_ID, 'low_grade');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should handle empty high_severity_events_json', async () => {
      mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue({
        is_enabled: true,
        high_severity_events_json: null,
      });

      await service.triggerStudentRecompute(TENANT_ID, STUDENT_ID, 'suspension');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
```

---

### Step 12 — Update Early Warning Module

**File:** `apps/api/src/modules/early-warning/early-warning.module.ts`

This file is scaffolded in Phase A. The modification here adds the routing and trigger services and exports the trigger service for cross-module injection.

```typescript
// Phase A scaffold + Phase D additions

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { EarlyWarningRoutingService } from './early-warning-routing.service';
import { EarlyWarningTriggerService } from './early-warning-trigger.service';
// Phase E will add: EarlyWarningController, EarlyWarningService, etc.

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'early-warning' }),
  ],
  providers: [
    EarlyWarningRoutingService,
    EarlyWarningTriggerService,
    // Phase B will add: 5x signal collectors
    // Phase C will add: scoring engine
    // Phase E will add: EarlyWarningService, EarlyWarningConfigService, EarlyWarningCohortService
  ],
  controllers: [
    // Phase E will add: EarlyWarningController
  ],
  exports: [
    EarlyWarningTriggerService,       // Consumed by other modules' services for intraday triggers
    EarlyWarningRoutingService,       // Consumed by Phase E API layer
  ],
})
export class EarlyWarningModule {}
```

---

## Architecture Updates Required

After implementation, update these architecture files:

### `architecture/event-job-catalog.md`

Add three new entries:

| Job | Queue | Type | Schedule | Payload | Side Effects |
|-----|-------|------|----------|---------|--------------|
| `early-warning:compute-daily` | `EARLY_WARNING` | Cross-tenant cron | `0 1 * * *` | `{}` | Upserts student_risk_profiles, appends student_risk_signals, creates tier transitions, creates notifications, creates draft pastoral interventions (red tier) |
| `early-warning:compute-student` | `EARLY_WARNING` | Event-driven | On demand | `{ tenant_id, student_id, trigger_event }` | Same as daily, single student |
| `early-warning:weekly-digest` | `EARLY_WARNING` | Cross-tenant cron | `0 7 * * *` | `{}` | Creates email notifications for digest recipients |

### `architecture/module-blast-radius.md`

Add early-warning module entry:
- **Exports:** `EarlyWarningTriggerService`, `EarlyWarningRoutingService`
- **Consumed by:** behaviour (evaluate-policy processor), pastoral (notify-concern processor), attendance (pattern-detection processor)
- **Consumes:** PrismaService, BullMQ EARLY_WARNING queue, notifications table, pastoral intervention table

### `architecture/danger-zones.md`

Add entry:
- **DZ-XX: Early warning intraday triggers from worker processors.** Three worker processors (evaluate-policy, notify-concern, attendance-pattern-detection) enqueue early-warning:compute-student jobs. These are fire-and-forget — if the early warning queue is down, the original processor still completes. The early-warning processor validates config.is_enabled and high_severity_events_json before processing.

---

## Test Checklist

| Test | File | What It Verifies |
|------|------|-----------------|
| Routing: yellow -> homeroom teacher | `early-warning-routing.service.spec.ts` | classEnrolment -> classStaff -> staff -> userId chain |
| Routing: amber -> year head | `early-warning-routing.service.spec.ts` | student.year_group_id -> membershipRole resolution |
| Routing: red -> multiple roles | `early-warning-routing.service.spec.ts` | Multi-role resolution + deduplication |
| Routing: fallback defaults | `early-warning-routing.service.spec.ts` | Empty routing_rules_json uses hardcoded defaults |
| Routing: no class enrolment | `early-warning-routing.service.spec.ts` | Returns empty when student has no active class |
| Routing: no year group | `early-warning-routing.service.spec.ts` | Returns empty when student has no year_group_id |
| Trigger: enabled + matching event | `early-warning-trigger.service.spec.ts` | Enqueues compute-student job |
| Trigger: disabled | `early-warning-trigger.service.spec.ts` | No-op, no job enqueued |
| Trigger: no config | `early-warning-trigger.service.spec.ts` | No-op, no job enqueued |
| Trigger: non-matching event | `early-warning-trigger.service.spec.ts` | No-op, no job enqueued |
| Trigger: null high_severity_events | `early-warning-trigger.service.spec.ts` | No-op, no job enqueued |

---

## Execution Order

1. **Step 1** — Queue constant (prerequisite for everything)
2. **Steps 3-5** — Three processor files (can be written in parallel)
3. **Steps 8-11** — Routing + trigger services with tests (can be written in parallel with processors)
4. **Step 6** — Cron registration (needs processor imports)
5. **Step 2** — Worker module registration (needs processor imports)
6. **Step 7** — Integration into existing processors (needs compute-student import)
7. **Step 12** — Module update (needs routing + trigger service imports)
8. **Run `turbo test`** — Verify all existing tests still pass
9. **Run `turbo lint && turbo type-check`** — Verify no lint/type errors
