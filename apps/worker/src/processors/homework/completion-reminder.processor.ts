import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { homeworkSettingsSchema } from '@school/shared';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface HomeworkCompletionReminderPayload extends TenantJobPayload {
  tenant_id: string;
}

// ─── Job name ────────────────────────────────────────────────────────────────

export const HOMEWORK_COMPLETION_REMINDER_JOB = 'homework:completion-reminder';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.HOMEWORK)
export class HomeworkCompletionReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(HomeworkCompletionReminderProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<HomeworkCompletionReminderPayload>): Promise<void> {
    if (job.name !== HOMEWORK_COMPLETION_REMINDER_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(`Processing ${HOMEWORK_COMPLETION_REMINDER_JOB} for tenant ${tenant_id}`);

    const reminderJob = new HomeworkCompletionReminderJob(this.prisma);
    await reminderJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ──────────────────────────────────────────

class HomeworkCompletionReminderJob extends TenantAwareJob<HomeworkCompletionReminderPayload> {
  private readonly logger = new Logger(HomeworkCompletionReminderJob.name);

  protected async processJob(
    data: HomeworkCompletionReminderPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id } = data;

    // ─── 1. Parse tenant homework settings ──────────────────────────────────
    const tenantSetting = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });

    const rawSettings = (tenantSetting?.settings as Record<string, unknown>) ?? {};
    const homeworkSettings = homeworkSettingsSchema.parse(rawSettings.homework ?? {});

    if (!homeworkSettings.completion_reminder_enabled) {
      this.logger.log(`Completion reminders disabled for tenant ${tenant_id} — skipping`);
      return;
    }

    // ─── 2. Get tomorrow's date ─────────────────────────────────────────────
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    // ─── 3. Find published assignments due tomorrow ─────────────────────────
    const assignments = await tx.homeworkAssignment.findMany({
      where: {
        tenant_id,
        status: 'published',
        due_date: { gte: tomorrow, lte: tomorrowEnd },
      },
      include: {
        class_entity: { select: { id: true, name: true } },
      },
    });

    if (assignments.length === 0) {
      this.logger.log(`No assignments due tomorrow for tenant ${tenant_id} — skipping`);
      return;
    }

    // ─── 4. For each assignment, find students with incomplete status ───────
    const twentyFourHoursAgo = new Date(now);
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    let totalReminders = 0;

    for (const assignment of assignments) {
      // Get enrolled students for this assignment's class
      const enrolments = await tx.classEnrolment.findMany({
        where: {
          tenant_id,
          class_id: assignment.class_id,
          status: 'active',
        },
        select: {
          student_id: true,
          student: { select: { id: true, first_name: true, last_name: true, full_name: true } },
        },
      });

      if (enrolments.length === 0) continue;

      // Get existing completions for this assignment
      const completions = await tx.homeworkCompletion.findMany({
        where: {
          tenant_id,
          homework_assignment_id: assignment.id,
        },
        select: { student_id: true, status: true },
      });

      // Build set of students who have completed
      const completedStudentIds = new Set<string>(
        completions
          .filter((c: { status: string }) => c.status === 'completed')
          .map((c: { student_id: string }) => c.student_id),
      );

      // Students with no completion entry OR not_started/in_progress are "incomplete"
      const incompleteEnrolments = enrolments.filter(
        (e: { student_id: string }) => !completedStudentIds.has(e.student_id),
      );

      if (incompleteEnrolments.length === 0) continue;

      // ─── 5. Find active parents for incomplete students ─────────────────
      const incompleteStudentIds = incompleteEnrolments.map(
        (e: { student_id: string }) => e.student_id,
      );

      const studentParentLinks = await tx.studentParent.findMany({
        where: {
          tenant_id,
          student_id: { in: incompleteStudentIds },
        },
        include: {
          parent: {
            select: {
              id: true,
              user_id: true,
              status: true,
            },
          },
        },
      });

      // Build student name lookup
      const studentNameMap = new Map<string, string>();
      for (const enrolment of incompleteEnrolments) {
        const student = enrolment.student;
        const name = student.full_name ?? `${student.first_name} ${student.last_name}`;
        studentNameMap.set(student.id, name);
      }

      // ─── 6. Create notification for each parent ─────────────────────────
      for (const sp of studentParentLinks) {
        if (sp.parent.status !== 'active' || !sp.parent.user_id) continue;

        const studentName = studentNameMap.get(sp.student_id) ?? 'Student';

        // ─── 7. Idempotency check ──────────────────────────────────────────
        const existingNotification = await tx.notification.findFirst({
          where: {
            tenant_id,
            template_key: 'homework_completion_reminder',
            source_entity_id: assignment.id,
            recipient_user_id: sp.parent.user_id,
            created_at: { gte: twentyFourHoursAgo },
          },
        });

        if (existingNotification) continue;

        try {
          await tx.notification.create({
            data: {
              tenant_id,
              recipient_user_id: sp.parent.user_id,
              channel: 'in_app',
              template_key: 'homework_completion_reminder',
              locale: 'en',
              status: 'delivered',
              payload_json: {
                student_name: studentName,
                assignment_title: assignment.title,
                due_date: assignment.due_date.toISOString().split('T')[0],
                class_name: assignment.class_entity.name,
              } as Prisma.InputJsonValue,
              source_entity_type: 'homework_assignment',
              source_entity_id: assignment.id,
              delivered_at: now,
            },
          });
          totalReminders++;
        } catch (err) {
          this.logger.error(
            `Failed to create completion reminder for user ${sp.parent.user_id}, assignment ${assignment.id}: ${(err as Error).message}`,
          );
        }
      }
    }

    // ─── 8. Log summary ────────────────────────────────────────────────────
    this.logger.log(
      `Completion reminders complete for tenant ${tenant_id}: ${totalReminders} reminders sent for ${assignments.length} assignments due tomorrow`,
    );
  }
}
