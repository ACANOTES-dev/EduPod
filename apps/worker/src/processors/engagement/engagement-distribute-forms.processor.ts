import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job Name ──────────────────────────────────────────────────────────────────

export const DISTRIBUTE_FORMS_JOB = 'engagement:distribute-forms';

// ─── Payload ───────────────────────────────────────────────────────────────────

export interface DistributeFormsPayload extends TenantJobPayload {
  form_template_id: string;
  target_type: 'whole_school' | 'year_group' | 'class_group' | 'custom';
  target_ids?: string[];
  deadline?: string;
  event_id?: string;
}

// ─── Processor ─────────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.ENGAGEMENT, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class EngagementDistributeFormsProcessor extends WorkerHost {
  private readonly logger = new Logger(EngagementDistributeFormsProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<DistributeFormsPayload>): Promise<void> {
    if (job.name !== DISTRIBUTE_FORMS_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) throw new Error('Job rejected: missing tenant_id');

    this.logger.log(`Processing ${DISTRIBUTE_FORMS_JOB} — tenant=${tenant_id}`);

    const distributeJob = new DistributeFormsJob(this.prisma);
    await distributeJob.execute(job.data);
  }
}

// ─── TenantAwareJob Implementation ────────────────────────────────────────────

class DistributeFormsJob extends TenantAwareJob<DistributeFormsPayload> {
  private readonly logger = new Logger(DistributeFormsJob.name);

  protected async processJob(data: DistributeFormsPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, form_template_id, target_type, target_ids, event_id } = data;

    // 1. Validate the form template exists and is published
    const template = await tx.engagementFormTemplate.findFirst({
      where: { tenant_id, id: form_template_id },
      select: { id: true, status: true },
    });

    if (!template) {
      throw new Error(`Form template "${form_template_id}" not found for tenant ${tenant_id}`);
    }

    if (template.status !== 'published') {
      throw new Error(
        `Form template "${form_template_id}" is not published (status: ${template.status})`,
      );
    }

    // 2. Resolve target students based on target_type
    let studentIds: string[];

    switch (target_type) {
      case 'whole_school': {
        const students = await tx.student.findMany({
          where: { tenant_id, status: 'active' },
          select: { id: true },
        });
        studentIds = students.map((s) => s.id);
        break;
      }

      case 'year_group': {
        if (!target_ids?.length) {
          throw new Error('target_ids required for year_group distribution');
        }
        const students = await tx.student.findMany({
          where: {
            tenant_id,
            status: 'active',
            year_group_id: { in: target_ids },
          },
          select: { id: true },
        });
        studentIds = students.map((s) => s.id);
        break;
      }

      case 'class_group': {
        if (!target_ids?.length) {
          throw new Error('target_ids required for class_group distribution');
        }
        const enrolments = await tx.classEnrolment.findMany({
          where: {
            tenant_id,
            class_id: { in: target_ids },
            status: 'active',
          },
          select: { student_id: true },
        });
        // Deduplicate — a student may be enrolled in multiple classes
        studentIds = [...new Set(enrolments.map((e) => e.student_id))];
        break;
      }

      case 'custom': {
        studentIds = target_ids ?? [];
        break;
      }

      default: {
        throw new Error(`Unknown target_type: ${target_type as string}`);
      }
    }

    if (studentIds.length === 0) {
      this.logger.warn(
        `No students resolved for template ${form_template_id} (target_type=${target_type}), skipping`,
      );
      return;
    }

    // 3. Resolve current academic year
    const academicYear = await tx.academicYear.findFirst({
      where: { tenant_id, status: 'active' },
      select: { id: true },
    });

    if (!academicYear) {
      throw new Error(`No current academic year found for tenant ${tenant_id}`);
    }

    // 4. Create submissions in batches of 100
    const BATCH_SIZE = 100;
    let totalCreated = 0;

    for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
      const batch = studentIds.slice(i, i + BATCH_SIZE);
      const result = await tx.engagementFormSubmission.createMany({
        data: batch.map((studentId) => ({
          tenant_id,
          form_template_id,
          event_id: event_id ?? null,
          student_id: studentId,
          responses_json: {},
          status: 'pending',
          academic_year_id: academicYear.id,
        })),
      });
      totalCreated += result.count;
    }

    this.logger.log(
      `Distributed form "${form_template_id}" — ${totalCreated} submissions created for tenant ${tenant_id}`,
    );

    // ─── 5. Notify parents (grouped: one notification per parent) ─────────────

    await this.notifyParents(tx, tenant_id, form_template_id, studentIds);
  }

  // ─── Parent Notification ──────────────────────────────────────────────────────

  /**
   * Groups distributed submissions by parent and creates one in-app notification
   * per parent listing the form name and their children with pending forms.
   */
  private async notifyParents(
    tx: PrismaClient,
    tenantId: string,
    formTemplateId: string,
    studentIds: string[],
  ): Promise<void> {
    if (studentIds.length === 0) return;

    // 5a. Load form template name for the notification message
    const formTemplate = await tx.engagementFormTemplate.findFirst({
      where: { tenant_id: tenantId, id: formTemplateId },
      select: { name: true },
    });

    const formName = formTemplate?.name ?? 'Form';

    // 5b. Resolve each student's household parents with user accounts
    const students = await tx.student.findMany({
      where: { tenant_id: tenantId, id: { in: studentIds } },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        household: {
          select: {
            household_parents: {
              select: {
                parent: {
                  select: { user_id: true },
                },
              },
            },
          },
        },
      },
    });

    // 5c. Group students by parent user_id
    const parentStudentMap = new Map<string, { student_id: string; student_name: string }[]>();

    for (const student of students) {
      const parentUserIds =
        student.household?.household_parents
          ?.map((hp) => hp.parent?.user_id)
          .filter((uid): uid is string => uid != null) ?? [];

      const studentName = `${student.first_name} ${student.last_name}`;

      for (const parentUserId of parentUserIds) {
        const existing = parentStudentMap.get(parentUserId);
        if (existing) {
          existing.push({ student_id: student.id, student_name: studentName });
        } else {
          parentStudentMap.set(parentUserId, [
            { student_id: student.id, student_name: studentName },
          ]);
        }
      }
    }

    // 5d. Create one notification per parent
    let notificationCount = 0;

    for (const [recipientUserId, children] of parentStudentMap) {
      const childNames = children.map((c) => c.student_name);
      const studentIdsForParent = children.map((c) => c.student_id);

      await tx.notification.create({
        data: {
          tenant_id: tenantId,
          recipient_user_id: recipientUserId,
          channel: 'in_app',
          template_key: 'engagement_form_distributed',
          locale: 'en',
          status: 'queued',
          payload_json: {
            form_template_id: formTemplateId,
            form_name: formName,
            child_count: children.length,
            child_names: childNames,
            student_ids: studentIdsForParent,
          },
          source_entity_type: 'engagement_form_template',
          source_entity_id: formTemplateId,
        },
      });

      notificationCount++;
    }

    if (notificationCount > 0) {
      this.logger.log(
        `Notified ${notificationCount} parent(s) about form "${formName}" for tenant ${tenantId}`,
      );
    }
  }
}
