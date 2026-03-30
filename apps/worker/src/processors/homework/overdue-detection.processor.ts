import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { homeworkSettingsSchema } from '@school/shared';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const HOMEWORK_OVERDUE_DETECTION_JOB = 'homework:overdue-detection';

// ─── Processor ────────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.HOMEWORK)
export class HomeworkOverdueDetectionProcessor extends WorkerHost {
  private readonly logger = new Logger(HomeworkOverdueDetectionProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== HOMEWORK_OVERDUE_DETECTION_JOB) return;

    this.logger.log(
      `Processing ${HOMEWORK_OVERDUE_DETECTION_JOB} — cross-tenant cron run`,
    );

    const tenants = await this.prisma.tenant.findMany({
      where: {
        status: 'active',
        modules: { some: { module_key: 'homework', is_enabled: true } },
      },
      select: { id: true },
    });

    let successCount = 0;
    for (const tenant of tenants) {
      try {
        const innerJob = new HomeworkOverdueDetectionJob(this.prisma);
        await innerJob.execute({ tenant_id: tenant.id });
        successCount++;
      } catch (err: unknown) {
        this.logger.error(
          `Overdue detection failed for tenant ${tenant.id}: ${String(err)}`,
        );
      }
    }

    this.logger.log(
      `${HOMEWORK_OVERDUE_DETECTION_JOB} cron complete: ${successCount}/${tenants.length} tenants processed`,
    );
  }
}

// ─── TenantAwareJob implementation ────────────────────────────────────────────

class HomeworkOverdueDetectionJob extends TenantAwareJob<TenantJobPayload> {
  private readonly logger = new Logger(HomeworkOverdueDetectionJob.name);

  protected async processJob(
    data: TenantJobPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id } = data;

    // ─── 1. Read homework settings ──────────────────────────────────────────

    const tenantSettings = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });

    const rawSettings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
    const hwRaw = (rawSettings.homework as Record<string, unknown>) ?? {};
    const hwSettings = homeworkSettingsSchema.parse(hwRaw);

    if (!hwSettings.overdue_notification_enabled) {
      this.logger.log(
        `Tenant ${tenant_id}: overdue notifications disabled, skipping.`,
      );
      return;
    }

    // ─── 2. Find published assignments past due date ────────────────────────

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueAssignments = await tx.homeworkAssignment.findMany({
      where: {
        tenant_id,
        status: 'published',
        due_date: { lt: today },
      },
      select: {
        id: true,
        title: true,
        due_date: true,
        class_entity: { select: { id: true, name: true } },
      },
    });

    if (overdueAssignments.length === 0) {
      this.logger.log(
        `Tenant ${tenant_id}: no overdue assignments found.`,
      );
      return;
    }

    let studentsOverdue = 0;
    let parentsNotified = 0;

    // ─── 3. Process each overdue assignment ─────────────────────────────────

    for (const assignment of overdueAssignments) {
      // Find students who have not completed this assignment
      const incompleteCompletions = await tx.homeworkCompletion.findMany({
        where: {
          tenant_id,
          homework_assignment_id: assignment.id,
          status: { in: ['not_started', 'in_progress'] },
        },
        select: {
          student_id: true,
          student: {
            select: {
              id: true,
              full_name: true,
              student_parents: {
                select: {
                  parent: {
                    select: {
                      id: true,
                      user_id: true,
                      status: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      studentsOverdue += incompleteCompletions.length;

      // ─── 4. For each student, check idempotency and notify parents ──────

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      for (const completion of incompleteCompletions) {
        const student = completion.student;
        const activeParents = student.student_parents
          .map((sp) => sp.parent)
          .filter((p) => p.status === 'active' && p.user_id !== null);

        if (activeParents.length === 0) continue;

        for (const parent of activeParents) {
          // Idempotency: check if a notification was already sent for this
          // assignment + parent in the last 24 hours
          const existingNotification = await tx.notification.findFirst({
            where: {
              tenant_id,
              template_key: 'homework_overdue',
              source_entity_type: 'homework_assignment',
              source_entity_id: assignment.id,
              recipient_user_id: parent.user_id!,
              created_at: { gte: twentyFourHoursAgo },
            },
            select: { id: true },
          });

          if (existingNotification) continue;

          // Create notification
          await tx.notification.create({
            data: {
              tenant_id,
              recipient_user_id: parent.user_id!,
              channel: 'in_app',
              template_key: 'homework_overdue',
              locale: 'en',
              status: 'delivered',
              payload_json: {
                student_name: student.full_name,
                assignment_title: assignment.title,
                due_date: assignment.due_date.toISOString().split('T')[0],
                class_name: assignment.class_entity.name,
              },
              source_entity_type: 'homework_assignment',
              source_entity_id: assignment.id,
              delivered_at: new Date(),
            },
          });

          parentsNotified++;
        }
      }
    }

    // ─── 5. Log summary ─────────────────────────────────────────────────────

    this.logger.log(
      `Tenant ${tenant_id}: overdue detection complete — ` +
        `${overdueAssignments.length} assignments checked, ` +
        `${studentsOverdue} students overdue, ` +
        `${parentsNotified} parent notifications sent`,
    );
  }
}
