import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { $Enums, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface BehaviourCheckAwardsPayload extends TenantJobPayload {
  incident_id: string;
  student_ids: string[];
  academic_year_id: string;
  academic_period_id: string | null;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const BEHAVIOUR_CHECK_AWARDS_JOB = 'behaviour:check-awards';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR)
export class BehaviourCheckAwardsProcessor extends WorkerHost {
  private readonly logger = new Logger(BehaviourCheckAwardsProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<BehaviourCheckAwardsPayload>): Promise<void> {
    if (job.name !== BEHAVIOUR_CHECK_AWARDS_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${BEHAVIOUR_CHECK_AWARDS_JOB} — incident ${job.data.incident_id}, ${job.data.student_ids.length} student(s)`,
    );

    const awardJob = new BehaviourCheckAwardsJob(this.prisma);
    await awardJob.execute(job.data);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map preferred_contact_channels JSON to valid NotificationChannel values */
const VALID_EXTRA_CHANNELS = new Set(['email', 'whatsapp', 'sms']);

function resolveChannels(preferredRaw: unknown): $Enums.NotificationChannel[] {
  const channels: $Enums.NotificationChannel[] = ['in_app'];

  if (Array.isArray(preferredRaw)) {
    for (const ch of preferredRaw) {
      if (typeof ch === 'string' && VALID_EXTRA_CHANNELS.has(ch)) {
        channels.push(ch as $Enums.NotificationChannel);
      }
    }
  }

  return channels;
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class BehaviourCheckAwardsJob extends TenantAwareJob<BehaviourCheckAwardsPayload> {
  private readonly logger = new Logger(BehaviourCheckAwardsJob.name);

  protected async processJob(
    data: BehaviourCheckAwardsPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const {
      tenant_id,
      incident_id,
      student_ids,
      academic_year_id,
      academic_period_id,
    } = data;

    // Load active award types with auto-trigger thresholds
    const awardTypes = await tx.behaviourAwardType.findMany({
      where: {
        tenant_id,
        is_active: true,
        points_threshold: { not: null },
      },
      orderBy: [
        { tier_level: { sort: 'desc', nulls: 'last' } },
        { points_threshold: 'desc' },
      ],
    });

    if (awardTypes.length === 0) {
      this.logger.log(`No active auto-award types for tenant ${tenant_id}`);
      return;
    }

    // Load tenant settings for recognition wall auto-populate
    const tenantSettings = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });
    const settings =
      (tenantSettings?.settings as Record<string, unknown>) ?? {};
    const behaviourSettings =
      (settings?.behaviour as Record<string, unknown>) ?? {};
    const autoPopulate =
      (behaviourSettings?.recognition_wall_auto_populate as boolean) ?? true;
    const requiresConsent =
      (behaviourSettings?.recognition_wall_requires_consent as boolean) ?? true;
    const requiresAdminApproval =
      (behaviourSettings?.recognition_wall_admin_approval_required as boolean) ?? true;

    // Get current academic period date range if needed
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    if (academic_period_id) {
      const period = await tx.academicPeriod.findUnique({
        where: { id: academic_period_id },
        select: { start_date: true, end_date: true },
      });
      if (period) {
        periodStart = period.start_date;
        periodEnd = period.end_date;
      }
    }

    for (const studentId of student_ids) {
      // Fresh points computation (no cache)
      const pointsResult = await tx.behaviourIncidentParticipant.aggregate({
        where: {
          tenant_id,
          student_id: studentId,
          incident: {
            status: {
              notIn: [
                'draft' as $Enums.IncidentStatus,
                'withdrawn' as $Enums.IncidentStatus,
              ],
            },
            retention_status: 'active' as $Enums.RetentionStatus,
          },
        },
        _sum: { points_awarded: true },
      });

      const totalPoints = pointsResult._sum.points_awarded ?? 0;

      this.logger.log(
        `Student ${studentId}: total points = ${totalPoints}`,
      );

      for (const awardType of awardTypes) {
        if (awardType.points_threshold === null) continue;
        if (totalPoints < awardType.points_threshold) continue;

        // Dedup guard: same incident + award type
        const existingForIncident =
          await tx.behaviourRecognitionAward.findFirst({
            where: {
              tenant_id,
              student_id: studentId,
              award_type_id: awardType.id,
              triggered_by_incident_id: incident_id,
            },
          });

        if (existingForIncident) {
          this.logger.log(
            `Dedup: award ${awardType.name} already exists for student ${studentId} via incident ${incident_id}`,
          );
          continue;
        }

        // Repeat mode check
        const eligible = await this.checkRepeatEligibility(
          tx,
          tenant_id,
          studentId,
          awardType,
          academic_year_id,
          periodStart,
          periodEnd,
        );

        if (!eligible) {
          this.logger.log(
            `Repeat check failed: ${awardType.name} for student ${studentId}`,
          );
          continue;
        }

        // Create award
        const award = await tx.behaviourRecognitionAward.create({
          data: {
            tenant_id,
            student_id: studentId,
            award_type_id: awardType.id,
            points_at_award: totalPoints,
            awarded_by_id: (
              await tx.behaviourIncident.findUnique({
                where: { id: incident_id },
                select: { reported_by_id: true },
              })
            )?.reported_by_id ?? studentId,
            awarded_at: new Date(),
            academic_year_id,
            triggered_by_incident_id: incident_id,
          },
        });

        this.logger.log(
          `Created auto-award ${awardType.name} (${award.id}) for student ${studentId}`,
        );

        // Tier supersession
        if (
          awardType.supersedes_lower_tiers &&
          awardType.tier_group &&
          awardType.tier_level !== null
        ) {
          await this.handleTierSupersession(
            tx,
            tenant_id,
            studentId,
            awardType.tier_group,
            awardType.tier_level,
            award.id,
          );
        }

        // Enqueue parent notification
        // Note: This creates in-app notification directly since we're in a worker
        // The parent notification processor handles the actual dispatch
        const studentParents = await tx.studentParent.findMany({
          where: { student_id: studentId, tenant_id },
          include: {
            parent: {
              select: { id: true, user_id: true, preferred_contact_channels: true, status: true },
            },
          },
        });

        for (const sp of studentParents) {
          if (sp.parent.status !== 'active' || !sp.parent.user_id) continue;

          // Check guardian restrictions before sending notification
          const hasRestriction =
            await tx.behaviourGuardianRestriction.findFirst({
              where: {
                tenant_id,
                student_id: studentId,
                parent_id: sp.parent.id,
                restriction_type: {
                  in: [
                    'no_behaviour_notifications' as $Enums.RestrictionType,
                    'no_communications' as $Enums.RestrictionType,
                  ],
                },
                status:
                  'active_restriction' as $Enums.RestrictionStatus,
                effective_from: { lte: new Date() },
                OR: [
                  { effective_until: null },
                  { effective_until: { gte: new Date() } },
                ],
              },
            });

          if (hasRestriction) {
            this.logger.log(
              `Guardian restriction blocks notification for parent ${sp.parent.id} on student ${studentId}`,
            );
            continue;
          }

          const channels = resolveChannels(sp.parent.preferred_contact_channels);

          for (const channel of channels) {
            const isInApp = channel === 'in_app';

            await tx.notification.create({
              data: {
                tenant_id,
                recipient_user_id: sp.parent.user_id,
                channel,
                template_key: 'behaviour_award_parent',
                locale: 'en',
                status: isInApp ? 'delivered' : 'queued',
                payload_json: {
                  award_id: award.id,
                  award_name: awardType.name,
                  student_id: studentId,
                  points_at_award: totalPoints,
                },
                source_entity_type: 'behaviour_recognition_award',
                source_entity_id: award.id,
                delivered_at: isInApp ? new Date() : undefined,
              },
            });
          }
        }

        // Auto-populate recognition wall if enabled
        if (autoPopulate) {
          const consentStatus = requiresConsent
            ? ('not_requested' as $Enums.ParentConsentStatus)
            : ('granted' as $Enums.ParentConsentStatus);
          const adminApproved = !requiresAdminApproval;
          const bothGatesPass = !requiresConsent && !requiresAdminApproval;

          await tx.behaviourPublicationApproval.create({
            data: {
              tenant_id,
              publication_type:
                'recognition_wall_website' as $Enums.PublicationType,
              entity_type: 'award' as $Enums.PublicationEntityType,
              entity_id: award.id,
              student_id: studentId,
              requires_parent_consent: requiresConsent,
              parent_consent_status: consentStatus,
              admin_approved: adminApproved,
              published_at: bothGatesPass ? new Date() : null,
            },
          });
        }
      }
    }
  }

  private async checkRepeatEligibility(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
    awardType: {
      id: string;
      repeat_mode: string;
      repeat_max_per_year: number | null;
    },
    academicYearId: string,
    periodStart: Date | null,
    periodEnd: Date | null,
  ): Promise<boolean> {
    switch (awardType.repeat_mode) {
      case 'once_ever': {
        const existing = await tx.behaviourRecognitionAward.findFirst({
          where: { tenant_id: tenantId, student_id: studentId, award_type_id: awardType.id },
        });
        return !existing;
      }

      case 'once_per_year': {
        const existing = await tx.behaviourRecognitionAward.findFirst({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            award_type_id: awardType.id,
            academic_year_id: academicYearId,
          },
        });
        if (existing) return false;
        break;
      }

      case 'once_per_period': {
        if (!periodStart || !periodEnd) return true;
        const existing = await tx.behaviourRecognitionAward.findFirst({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            award_type_id: awardType.id,
            awarded_at: { gte: periodStart, lte: periodEnd },
          },
        });
        if (existing) return false;
        break;
      }

      case 'unlimited':
        break;

      default:
        return false;
    }

    // Check repeat_max_per_year
    if (awardType.repeat_max_per_year !== null) {
      const countThisYear = await tx.behaviourRecognitionAward.count({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          award_type_id: awardType.id,
          academic_year_id: academicYearId,
        },
      });
      if (countThisYear >= awardType.repeat_max_per_year) return false;
    }

    return true;
  }

  private async handleTierSupersession(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
    tierGroup: string,
    tierLevel: number,
    newAwardId: string,
  ): Promise<void> {
    // Find all lower-tier award types in the same group
    const lowerTierTypes = await tx.behaviourAwardType.findMany({
      where: {
        tenant_id: tenantId,
        tier_group: tierGroup,
        tier_level: { lt: tierLevel },
      },
      select: { id: true },
    });

    if (lowerTierTypes.length === 0) return;

    const lowerTypeIds = lowerTierTypes.map((t) => t.id);

    // Update existing unsuperseded awards for this student
    await tx.behaviourRecognitionAward.updateMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        award_type_id: { in: lowerTypeIds },
        superseded_by_id: null,
      },
      data: { superseded_by_id: newAwardId },
    });

    this.logger.log(
      `Superseded lower-tier awards in group "${tierGroup}" for student ${studentId}`,
    );
  }
}
