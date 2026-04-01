import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { addSchoolDays, type ClosureChecker } from '@school/shared';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export type SuspensionReturnPayload = TenantJobPayload;

// ─── Job name ─────────────────────────────────────────────────────────────────

export const BEHAVIOUR_SUSPENSION_RETURN_JOB = 'behaviour:suspension-return';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR)
export class BehaviourSuspensionReturnProcessor extends WorkerHost {
  private readonly logger = new Logger(BehaviourSuspensionReturnProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<SuspensionReturnPayload>): Promise<void> {
    if (job.name !== BEHAVIOUR_SUSPENSION_RETURN_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(`Processing ${BEHAVIOUR_SUSPENSION_RETURN_JOB} — tenant ${tenant_id}`);

    const suspensionReturnJob = new SuspensionReturnJob(this.prisma);
    await suspensionReturnJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class SuspensionReturnJob extends TenantAwareJob<SuspensionReturnPayload> {
  private readonly logger = new Logger(SuspensionReturnJob.name);

  protected async processJob(data: SuspensionReturnPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id } = data;
    const now = new Date();

    // Build closure checker for school day calculations
    const closureChecker: ClosureChecker = async (date: Date) => {
      const dateOnly = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const closure = await tx.schoolClosure.findFirst({
        where: {
          tenant_id,
          closure_date: dateOnly,
        },
      });
      return !!closure;
    };

    // Compute target date: 3 school days from today
    const targetDate = await addSchoolDays(now, 3, closureChecker);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    // Find suspensions ending on the target date
    const sanctions = await tx.behaviourSanction.findMany({
      where: {
        tenant_id,
        status: { in: ['scheduled', 'not_served_absent'] },
        type: { in: ['suspension_internal', 'suspension_external'] },
        suspension_end_date: new Date(`${targetDateStr}T00:00:00.000Z`),
        retention_status: 'active',
      },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });

    this.logger.log(
      `Found ${sanctions.length} suspensions ending on ${targetDateStr} in tenant ${tenant_id}`,
    );

    let tasksCreated = 0;

    for (const sanction of sanctions) {
      // Idempotency check: skip if return_check_in task already exists
      const existingTask = await tx.behaviourTask.findFirst({
        where: {
          tenant_id,
          entity_type: 'sanction',
          entity_id: sanction.id,
          task_type: 'return_check_in',
          status: { not: 'cancelled' },
        },
      });

      if (existingTask) {
        this.logger.debug(`Skipping sanction ${sanction.id} — return_check_in task already exists`);
        continue;
      }

      // Resolve assignee: supervised_by_id → pastoral lead → principal
      const assigneeId = await this.resolveAssignee(
        tx,
        tenant_id,
        sanction.supervised_by_id,
        sanction.student_id,
      );

      const studentName = `${sanction.student.first_name} ${sanction.student.last_name}`;
      const endDate = sanction.suspension_end_date
        ? new Date(sanction.suspension_end_date).toISOString().split('T')[0]
        : 'unknown';

      await tx.behaviourTask.create({
        data: {
          tenant_id,
          task_type: 'return_check_in',
          entity_type: 'sanction',
          entity_id: sanction.id,
          title: `Return check-in: ${studentName} returns on ${endDate}`,
          description: 'Student is returning from suspension. Verify return conditions are met.',
          assigned_to_id: assigneeId,
          priority: 'high',
          due_date: sanction.suspension_end_date ?? new Date(),
          status: 'pending',
          created_by_id: assigneeId,
        },
      });

      tasksCreated++;
    }

    this.logger.log(
      `Suspension return check complete for tenant ${tenant_id}: ${tasksCreated} tasks created`,
    );
  }

  private async resolveAssignee(
    tx: PrismaClient,
    tenantId: string,
    supervisedById: string | null,
    studentId: string,
  ): Promise<string> {
    // 1. Try supervised_by_id
    if (supervisedById) return supervisedById;

    // 2. Try pastoral lead for the student's year group
    const _student = await tx.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { year_group_id: true },
    });

    // YearGroup doesn't have head_of_year_id — skip pastoral lead lookup

    // 3. Fall back to principal (school_owner role)
    const principalMembership = await tx.tenantMembership.findFirst({
      where: {
        tenant_id: tenantId,
        membership_status: 'active',
        membership_roles: {
          some: {
            role: { role_key: 'school_owner' },
          },
        },
      },
      select: { user_id: true },
    });

    if (principalMembership) {
      return principalMembership.user_id;
    }

    // Last resort: use the student ID itself (should never happen in practice)
    this.logger.warn(
      `Could not resolve assignee for student ${studentId} — using student ID as fallback`,
    );
    return studentId;
  }
}
