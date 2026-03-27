import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { MembershipStatus, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface SurveyOpenNotifyPayload extends TenantJobPayload {
  survey_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const SURVEY_OPEN_NOTIFY_JOB = 'wellbeing:survey-open-notify';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.WELLBEING)
export class SurveyOpenNotifyProcessor extends WorkerHost {
  private readonly logger = new Logger(SurveyOpenNotifyProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<SurveyOpenNotifyPayload>): Promise<void> {
    if (job.name !== SURVEY_OPEN_NOTIFY_JOB) return;

    const { tenant_id, survey_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${SURVEY_OPEN_NOTIFY_JOB} — survey ${survey_id}, tenant ${tenant_id}`,
    );

    const notifyJob = new SurveyOpenNotifyJob(this.prisma);
    await notifyJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

export class SurveyOpenNotifyJob extends TenantAwareJob<SurveyOpenNotifyPayload> {
  private readonly logger = new Logger(SurveyOpenNotifyJob.name);

  protected async processJob(
    data: SurveyOpenNotifyPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, survey_id } = data;

    // 1. Query all active tenant memberships
    const members = await tx.tenantMembership.findMany({
      where: { tenant_id, membership_status: MembershipStatus.active },
      select: { user_id: true },
    });

    if (members.length === 0) {
      this.logger.log(
        `No active members for tenant ${tenant_id} — skipping notifications for survey ${survey_id}`,
      );
      return;
    }

    // 2. Create in-app notifications for each active member
    const now = new Date();

    await tx.notification.createMany({
      data: members.map((m) => ({
        tenant_id,
        recipient_user_id: m.user_id,
        channel: 'in_app',
        template_key: null,
        locale: 'en',
        status: 'delivered',
        delivered_at: now,
        payload_json: {
          title: 'Wellbeing Survey Available',
          body: 'A new staff wellbeing survey is available.',
          link: '/wellbeing/survey',
        },
        source_entity_type: 'staff_survey',
        source_entity_id: survey_id,
      })),
    });

    this.logger.log(
      `Created ${members.length} in-app notification(s) for survey ${survey_id}`,
    );
  }
}
