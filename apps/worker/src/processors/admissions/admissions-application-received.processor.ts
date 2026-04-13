import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Payload & job name ──────────────────────────────────────────────────────

export interface AdmissionsApplicationReceivedStudent {
  application_id: string;
  application_number: string;
  name: string;
  status: string;
}

export interface AdmissionsApplicationReceivedPayload {
  tenant_id: string;
  submitted_by_parent_id: string | null;
  students: AdmissionsApplicationReceivedStudent[];
}

// Matches the constant exported from the API's
// application-state-machine.service.ts; the state machine enqueues this job
// on the `notifications` queue after application submission.
export const ADMISSIONS_APPLICATION_RECEIVED_JOB = 'notifications:admissions-application-received';

// ─── Status labels ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  ready_to_admit: 'Submitted (ready to admit)',
  waiting_list: 'Submitted (waiting list)',
  submitted: 'Submitted',
  conditional_approval: 'Conditional Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

function humanizeStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Creates a queued notification row for the submitting parent when one or
 * more applications are submitted (ADM-028). The payload includes a
 * `students` array so sibling-batch submissions list each student's name
 * and queue-placement status in a single email.
 *
 * The dispatch pipeline picks up the row, resolves the
 * `admissions_application_received` template, renders it with Handlebars
 * `{{#each students}}`, and sends via the tenant's configured channel.
 *
 * Runs on the shared `notifications` queue — same as the other admissions
 * notification processors.
 */
@Processor(QUEUE_NAMES.NOTIFICATIONS, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class AdmissionsApplicationReceivedProcessor extends WorkerHost {
  private readonly logger = new Logger(AdmissionsApplicationReceivedProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<AdmissionsApplicationReceivedPayload>): Promise<void> {
    if (job.name !== ADMISSIONS_APPLICATION_RECEIVED_JOB) {
      return;
    }

    const { tenant_id, submitted_by_parent_id, students } = job.data;

    if (!tenant_id) {
      throw new Error(`Job rejected: missing tenant_id for ${ADMISSIONS_APPLICATION_RECEIVED_JOB}`);
    }

    if (!students || students.length === 0) {
      this.logger.warn(`Job for tenant ${tenant_id} has no students in payload — skipping`);
      return;
    }

    this.logger.log(
      `Processing ${ADMISSIONS_APPLICATION_RECEIVED_JOB} — tenant ${tenant_id}, ${students.length} student(s)`,
    );

    // Resolve the parent's user account to send the notification
    let recipientUserId: string | null = null;

    if (submitted_by_parent_id) {
      const parent = await this.prisma.parent.findFirst({
        where: { id: submitted_by_parent_id, tenant_id },
        select: { user_id: true },
      });
      recipientUserId = parent?.user_id ?? null;
    }

    if (!recipientUserId) {
      this.logger.warn(
        `Application batch has no reachable parent user account — application-received notification not emailed`,
      );
      return;
    }

    // Resolve school name for the template context
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenant_id },
      select: { name: true },
    });
    const schoolName = tenant?.name ?? 'the school';

    // Build the students array with human-readable status labels
    const studentsForTemplate = students.map((s) => ({
      name: s.name,
      status: humanizeStatus(s.status),
      application_number: s.application_number,
    }));

    // Idempotency key: hash the sorted application ids so a retry does not
    // create a duplicate notification row. For single-app submissions the
    // key is deterministic from the application_id; for batches it combines
    // all ids in the batch.
    const sortedIds = students
      .map((s) => s.application_id)
      .sort()
      .join(',');
    const idempotencyKey = `admissions:received:${sortedIds}`.slice(0, 64);

    // Use the first application_id as the source entity for single-student
    // submissions; for batches, still point to the first for traceability.
    const sourceEntityId = students[0]?.application_id ?? null;

    await this.prisma.notification.create({
      data: {
        tenant_id,
        recipient_user_id: recipientUserId,
        channel: 'email',
        template_key: 'admissions_application_received',
        locale: 'en',
        status: 'queued',
        idempotency_key: idempotencyKey,
        source_entity_type: 'application',
        source_entity_id: sourceEntityId,
        payload_json: {
          school_name: schoolName,
          students: studentsForTemplate,
        },
      },
    });

    this.logger.log(
      `Queued application-received notification for ${students.length} student(s) (parent user ${recipientUserId})`,
    );
  }
}
