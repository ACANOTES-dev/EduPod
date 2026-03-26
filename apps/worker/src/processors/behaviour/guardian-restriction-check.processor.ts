import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { $Enums, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export type BehaviourGuardianRestrictionCheckPayload = TenantJobPayload;

// ─── Job name ─────────────────────────────────────────────────────────────────

export const BEHAVIOUR_GUARDIAN_RESTRICTION_CHECK_JOB =
  'behaviour:guardian-restriction-check';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR)
export class BehaviourGuardianRestrictionCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(
    BehaviourGuardianRestrictionCheckProcessor.name,
  );

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(
    job: Job<BehaviourGuardianRestrictionCheckPayload>,
  ): Promise<void> {
    if (job.name !== BEHAVIOUR_GUARDIAN_RESTRICTION_CHECK_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${BEHAVIOUR_GUARDIAN_RESTRICTION_CHECK_JOB} — tenant ${tenant_id}`,
    );

    const checkJob = new BehaviourGuardianRestrictionCheckJob(this.prisma);
    await checkJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class BehaviourGuardianRestrictionCheckJob extends TenantAwareJob<BehaviourGuardianRestrictionCheckPayload> {
  private readonly logger = new Logger(
    BehaviourGuardianRestrictionCheckJob.name,
  );

  protected async processJob(
    data: BehaviourGuardianRestrictionCheckPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id } = data;
    const today = new Date();
    const todayDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );

    // ─── Step 1: Expire ended restrictions ──────────────────────────────────

    const expiredRestrictions =
      await tx.behaviourGuardianRestriction.findMany({
        where: {
          tenant_id,
          status:
            'active_restriction' as $Enums.RestrictionStatus,
          effective_until: { not: null, lt: todayDate },
        },
        select: { id: true, student_id: true, parent_id: true },
      });

    this.logger.log(
      `Found ${expiredRestrictions.length} restrictions to expire in tenant ${tenant_id}`,
    );

    for (const restriction of expiredRestrictions) {
      await tx.behaviourGuardianRestriction.update({
        where: { id: restriction.id },
        data: {
          status: 'expired' as $Enums.RestrictionStatus,
        },
      });

      // Record history
      await tx.behaviourEntityHistory.create({
        data: {
          tenant_id,
          entity_type:
            'guardian_restriction' as $Enums.BehaviourEntityType,
          entity_id: restriction.id,
          changed_by_id: restriction.parent_id, // System action, use parent as reference
          change_type: 'status_changed',
          previous_values: { status: 'active' },
          new_values: { status: 'expired' },
          reason: 'Auto-expired: effective_until date has passed',
        },
      });
    }

    // ─── Step 2: Create review reminder tasks ───────────────────────────────

    const fourteenDaysFromNow = new Date(todayDate);
    fourteenDaysFromNow.setUTCDate(fourteenDaysFromNow.getUTCDate() + 14);

    const upcomingReviews =
      await tx.behaviourGuardianRestriction.findMany({
        where: {
          tenant_id,
          status:
            'active_restriction' as $Enums.RestrictionStatus,
          review_date: { not: null, lte: fourteenDaysFromNow },
        },
        include: {
          student: {
            select: { first_name: true, last_name: true },
          },
        },
      });

    this.logger.log(
      `Found ${upcomingReviews.length} restrictions with upcoming review dates in tenant ${tenant_id}`,
    );

    for (const restriction of upcomingReviews) {
      if (!restriction.review_date) continue;

      // Check if an open review task already exists
      const existingTask = await tx.behaviourTask.findFirst({
        where: {
          tenant_id,
          entity_type:
            'guardian_restriction' as $Enums.BehaviourTaskEntityType,
          entity_id: restriction.id,
          task_type:
            'guardian_restriction_review' as $Enums.BehaviourTaskType,
          status: {
            in: [
              'pending' as $Enums.BehaviourTaskStatus,
              'in_progress' as $Enums.BehaviourTaskStatus,
            ],
          },
        },
      });

      if (existingTask) {
        continue;
      }

      // Calculate priority based on proximity to review date
      const reviewDate = new Date(restriction.review_date);
      const daysUntilReview = Math.ceil(
        (reviewDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const priority: $Enums.TaskPriority =
        daysUntilReview <= 3
          ? ('high' as $Enums.TaskPriority)
          : ('medium' as $Enums.TaskPriority);

      const studentName = `${restriction.student.first_name} ${restriction.student.last_name}`;

      await tx.behaviourTask.create({
        data: {
          tenant_id,
          task_type:
            'guardian_restriction_review' as $Enums.BehaviourTaskType,
          entity_type:
            'guardian_restriction' as $Enums.BehaviourTaskEntityType,
          entity_id: restriction.id,
          title: `Guardian restriction review due: ${studentName}`,
          description: `Review the guardian restriction for ${studentName}. Review date: ${restriction.review_date.toISOString().split('T')[0]}.`,
          assigned_to_id: restriction.set_by_id,
          created_by_id: restriction.set_by_id,
          priority,
          due_date: restriction.review_date,
          status: 'pending' as $Enums.BehaviourTaskStatus,
        },
      });

      this.logger.log(
        `Created review task for restriction ${restriction.id} (${studentName}), priority: ${priority}`,
      );
    }

    this.logger.log(
      `Guardian restriction check complete for tenant ${tenant_id}: ${expiredRestrictions.length} expired, ${upcomingReviews.length} checked for review tasks`,
    );
  }
}
