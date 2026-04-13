import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Payload & job name ──────────────────────────────────────────────────────

export interface AdmissionsApplicationWithdrawnPayload {
  tenant_id: string;
  application_id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  submitted_by_parent_id: string | null;
}

// Matches the constant exported from the API's
// application-state-machine.service.ts; the state machine enqueues this job
// on the `notifications` queue whenever an application transitions to
// `withdrawn`.
export const ADMISSIONS_APPLICATION_WITHDRAWN_JOB =
  'notifications:admissions-application-withdrawn';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Creates a queued notification row for the submitting parent when an
 * application is withdrawn (ADM-041). The dispatch pipeline picks up the
 * row, resolves the `admissions_application_withdrawn` template, renders
 * it with Handlebars, and sends via the tenant's configured channel.
 *
 * Runs on the shared `notifications` queue — same as the other admissions
 * notification processors.
 */
@Processor(QUEUE_NAMES.NOTIFICATIONS, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class AdmissionsApplicationWithdrawnProcessor extends WorkerHost {
  private readonly logger = new Logger(AdmissionsApplicationWithdrawnProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<AdmissionsApplicationWithdrawnPayload>): Promise<void> {
    if (job.name !== ADMISSIONS_APPLICATION_WITHDRAWN_JOB) {
      return;
    }

    const {
      tenant_id,
      application_id,
      application_number,
      student_first_name,
      student_last_name,
      submitted_by_parent_id,
    } = job.data;

    if (!tenant_id || !application_id) {
      throw new Error(
        `Job rejected: missing tenant_id or application_id for ${ADMISSIONS_APPLICATION_WITHDRAWN_JOB}`,
      );
    }

    this.logger.log(
      `Processing ${ADMISSIONS_APPLICATION_WITHDRAWN_JOB} — tenant ${tenant_id} application ${application_id}`,
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
        `Application ${application_id} has no reachable parent user account — withdrawal confirmation not emailed`,
      );
      return;
    }

    // Resolve school name for the template context
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenant_id },
      select: { name: true },
    });
    const schoolName = tenant?.name ?? 'the school';

    // Idempotency: one withdrawal notification per application
    const idempotencyKey = `admissions:withdrawn:${application_id}`.slice(0, 64);

    await this.prisma.notification.create({
      data: {
        tenant_id,
        recipient_user_id: recipientUserId,
        channel: 'email',
        template_key: 'admissions_application_withdrawn',
        locale: 'en',
        status: 'queued',
        idempotency_key: idempotencyKey,
        source_entity_type: 'application',
        source_entity_id: application_id,
        payload_json: {
          application_id,
          application_number,
          student_name: `${student_first_name} ${student_last_name}`,
          student_first_name,
          student_last_name,
          school_name: schoolName,
        },
      },
    });

    this.logger.log(
      `Queued withdrawal confirmation notification for application ${application_id} (parent user ${recipientUserId})`,
    );
  }
}
