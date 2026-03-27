import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { $Enums, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export type BehaviourTaskRemindersPayload = TenantJobPayload;

// ─── Job name ─────────────────────────────────────────────────────────────────

export const BEHAVIOUR_TASK_REMINDERS_JOB = 'behaviour:task-reminders';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR)
export class BehaviourTaskRemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(BehaviourTaskRemindersProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<BehaviourTaskRemindersPayload>): Promise<void> {
    if (job.name !== BEHAVIOUR_TASK_REMINDERS_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${BEHAVIOUR_TASK_REMINDERS_JOB} — tenant ${tenant_id}`,
    );

    const reminderJob = new BehaviourTaskRemindersJob(this.prisma);
    await reminderJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class BehaviourTaskRemindersJob extends TenantAwareJob<BehaviourTaskRemindersPayload> {
  private readonly logger = new Logger(BehaviourTaskRemindersJob.name);

  protected async processJob(
    data: BehaviourTaskRemindersPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id } = data;
    const now = new Date();

    // Start of today (midnight UTC)
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    // Start of yesterday (midnight UTC)
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

    // 1. Find tasks due today or earlier that haven't had a reminder sent
    const dueForReminder = await tx.behaviourTask.findMany({
      where: {
        tenant_id,
        status: 'pending',
        due_date: { lte: todayStart },
        reminder_sent_at: null,
      },
      select: { id: true, title: true, assigned_to_id: true },
    });

    this.logger.log(
      `Found ${dueForReminder.length} tasks due for reminder in tenant ${tenant_id}`,
    );

    // 2. Mark reminder as sent for each
    for (const task of dueForReminder) {
      await tx.behaviourTask.update({
        where: { id: task.id },
        data: { reminder_sent_at: now },
      });

      // Staff-facing: in_app (delivered) + email (queued)
      const reminderChannels: Array<{ channel: $Enums.NotificationChannel; status: $Enums.NotificationStatus; delivered_at: Date | undefined }> = [
        { channel: 'in_app', status: 'delivered', delivered_at: now },
        { channel: 'email', status: 'queued', delivered_at: undefined },
      ];

      for (const ch of reminderChannels) {
        await tx.notification.create({
          data: {
            tenant_id,
            recipient_user_id: task.assigned_to_id,
            channel: ch.channel,
            template_key: 'behaviour.task_due_reminder',
            locale: 'en',
            status: ch.status,
            payload_json: {
              task_id: task.id,
              task_title: task.title,
            },
            source_entity_type: 'behaviour_task',
            source_entity_id: task.id,
            delivered_at: ch.delivered_at,
          },
        });
      }
    }

    // 3. Find tasks that are past due (before yesterday) and not yet overdue-notified
    const overdueForNotification = await tx.behaviourTask.findMany({
      where: {
        tenant_id,
        status: 'pending',
        due_date: { lt: yesterdayStart },
        overdue_notified_at: null,
      },
      select: { id: true, title: true, assigned_to_id: true, task_type: true, priority: true },
    });

    this.logger.log(
      `Found ${overdueForNotification.length} overdue tasks in tenant ${tenant_id}`,
    );

    // 4. Update status to overdue and set overdue_notified_at
    for (const task of overdueForNotification) {
      await tx.behaviourTask.update({
        where: { id: task.id },
        data: {
          status: 'overdue',
          overdue_notified_at: now,
        },
      });

      // SP3-3: Escalate priority for overdue intervention_review tasks
      if (task.task_type === 'intervention_review') {
        let escalatedPriority: $Enums.TaskPriority = task.priority;
        if (task.priority === 'low') escalatedPriority = 'medium';
        else if (task.priority === 'medium') escalatedPriority = 'high';
        else if (task.priority === 'high') escalatedPriority = 'urgent';

        if (escalatedPriority !== task.priority) {
          await tx.behaviourTask.update({
            where: { id: task.id },
            data: { priority: escalatedPriority },
          });
        }
      }

      // Staff-facing: in_app (delivered) + email (queued)
      const overdueChannels: Array<{ channel: $Enums.NotificationChannel; status: $Enums.NotificationStatus; delivered_at: Date | undefined }> = [
        { channel: 'in_app', status: 'delivered', delivered_at: now },
        { channel: 'email', status: 'queued', delivered_at: undefined },
      ];

      for (const ch of overdueChannels) {
        await tx.notification.create({
          data: {
            tenant_id,
            recipient_user_id: task.assigned_to_id,
            channel: ch.channel,
            template_key: 'behaviour.task_overdue',
            locale: 'en',
            status: ch.status,
            payload_json: {
              task_id: task.id,
              task_title: task.title,
            },
            source_entity_type: 'behaviour_task',
            source_entity_id: task.id,
            delivered_at: ch.delivered_at,
          },
        });
      }
    }

    this.logger.log(
      `Task reminders complete for tenant ${tenant_id}: ${dueForReminder.length} reminded, ${overdueForNotification.length} marked overdue`,
    );
  }
}
