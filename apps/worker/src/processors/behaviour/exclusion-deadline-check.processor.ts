import { Inject, Injectable, Logger } from '@nestjs/common';
import { $Enums, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export type BehaviourExclusionDeadlineCheckPayload = TenantJobPayload;

// ─── Job name ────────────────────────────────────────────────────────────────

export const BEHAVIOUR_EXCLUSION_DEADLINE_CHECK_JOB = 'behaviour:exclusion-deadline-check';

// ─── Timeline step shape ─────────────────────────────────────────────────────

interface TimelineStep {
  step: string;
  required_by: string | null;
  completed_at: string | null;
  status: string;
}

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Scans non-terminal exclusion cases and raises breach signals:
 *   - creates a `behaviour_task` of type `appeal_review` for each new breach
 *   - writes an in-app notification row for the case's decided_by_id if set,
 *     otherwise for every unique assigned_to_id on the case's existing tasks.
 *
 * Runs every 6 hours per tenant via the cron scheduler.
 */
@Injectable()
export class BehaviourExclusionDeadlineCheckProcessor {
  private readonly logger = new Logger(BehaviourExclusionDeadlineCheckProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async process(job: Job<BehaviourExclusionDeadlineCheckPayload>): Promise<void> {
    if (job.name !== BEHAVIOUR_EXCLUSION_DEADLINE_CHECK_JOB) {
      return;
    }

    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(`Processing ${BEHAVIOUR_EXCLUSION_DEADLINE_CHECK_JOB} — tenant ${tenant_id}`);

    const checkerJob = new BehaviourExclusionDeadlineCheckJob(this.prisma);
    await checkerJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class BehaviourExclusionDeadlineCheckJob extends TenantAwareJob<BehaviourExclusionDeadlineCheckPayload> {
  private readonly logger = new Logger(BehaviourExclusionDeadlineCheckJob.name);

  protected async processJob(
    data: BehaviourExclusionDeadlineCheckPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id } = data;
    const now = new Date();

    const cases = await tx.behaviourExclusionCase.findMany({
      where: {
        tenant_id,
        status: { notIn: ['finalised', 'overturned'] },
      },
      select: {
        id: true,
        case_number: true,
        student_id: true,
        statutory_timeline: true,
        status: true,
        decided_by_id: true,
      },
    });

    let breachCount = 0;

    for (const exclusionCase of cases) {
      const timeline = (exclusionCase.statutory_timeline ?? []) as unknown as TimelineStep[];
      if (!Array.isArray(timeline)) continue;

      const breachedSteps = timeline.filter(
        (step) => !step.completed_at && step.required_by && new Date(step.required_by) < now,
      );

      if (breachedSteps.length === 0) continue;

      for (const step of breachedSteps) {
        // Idempotency: avoid duplicate task per (case, step)
        const existingTask = await tx.behaviourTask.findFirst({
          where: {
            tenant_id,
            entity_type: 'exclusion_case' as $Enums.BehaviourTaskEntityType,
            entity_id: exclusionCase.id,
            title: { contains: step.step },
            status: { in: ['pending', 'overdue'] },
          },
          select: { id: true },
        });
        if (existingTask) continue;

        const assigneeId = exclusionCase.decided_by_id ?? exclusionCase.student_id;
        const createdTask = await tx.behaviourTask.create({
          data: {
            tenant_id,
            task_type: 'appeal_review',
            entity_type: 'exclusion_case' as $Enums.BehaviourTaskEntityType,
            entity_id: exclusionCase.id,
            title: `Exclusion ${exclusionCase.case_number} — ${step.step} overdue`,
            assigned_to_id: assigneeId,
            created_by_id: assigneeId,
            priority: 'critical' as $Enums.TaskPriority,
            status: 'overdue',
            due_date: new Date(step.required_by ?? now),
            overdue_notified_at: now,
          },
          select: { id: true, assigned_to_id: true, title: true },
        });

        if (createdTask.assigned_to_id) {
          await tx.notification.create({
            data: {
              tenant_id,
              recipient_user_id: createdTask.assigned_to_id,
              channel: 'in_app',
              template_key: 'wellbeing_sla_breach',
              locale: 'en',
              status: 'delivered',
              payload_json: {
                event: 'sla.breach',
                entity_type: 'behaviour_exclusion_case',
                entity_id: exclusionCase.id,
                case_number: exclusionCase.case_number,
                step_name: step.step,
                required_by: step.required_by,
              },
              source_entity_type: 'behaviour_exclusion_case',
              source_entity_id: exclusionCase.id,
              delivered_at: now,
            },
          });
        }

        breachCount++;
      }
    }

    this.logger.log(
      `Exclusion deadline check complete for tenant ${tenant_id}: ${cases.length} cases scanned, ${breachCount} breach signal(s) raised`,
    );
  }
}
