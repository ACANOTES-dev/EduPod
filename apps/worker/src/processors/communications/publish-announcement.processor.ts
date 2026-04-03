import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface PublishAnnouncementPayload extends TenantJobPayload {
  announcement_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const PUBLISH_ANNOUNCEMENT_JOB = 'communications:publish-announcement';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.NOTIFICATIONS, {
  lockDuration: 30_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class PublishAnnouncementProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishAnnouncementProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<PublishAnnouncementPayload>): Promise<void> {
    if (job.name !== PUBLISH_ANNOUNCEMENT_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${PUBLISH_ANNOUNCEMENT_JOB} — announcement ${job.data.announcement_id} for tenant ${tenant_id}`,
    );

    const publishJob = new PublishAnnouncementJob(this.prisma);
    await publishJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class PublishAnnouncementJob extends TenantAwareJob<PublishAnnouncementPayload> {
  private readonly logger = new Logger(PublishAnnouncementJob.name);

  protected async processJob(data: PublishAnnouncementPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, announcement_id } = data;

    const announcement = await tx.announcement.findFirst({
      where: { id: announcement_id, tenant_id },
    });

    if (!announcement) {
      this.logger.warn(`Announcement ${announcement_id} not found for tenant ${tenant_id}`);
      return;
    }

    if (announcement.status !== 'scheduled' && announcement.status !== 'draft') {
      this.logger.warn(
        `Announcement ${announcement_id} is in status '${announcement.status}', skipping publish`,
      );
      return;
    }

    // Mark as published
    await tx.announcement.update({
      where: { id: announcement_id },
      data: { status: 'published', published_at: new Date() },
    });

    // Resolve audience based on scope
    const targetPayload = announcement.target_payload as Record<string, unknown>;
    const recipientUserIds = await this.resolveAudience(
      tx,
      tenant_id,
      announcement.scope,
      targetPayload,
    );

    if (recipientUserIds.length === 0) {
      this.logger.log(`No audience resolved for announcement ${announcement_id}`);
      return;
    }

    // Create in_app notification records in batches of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < recipientUserIds.length; i += BATCH_SIZE) {
      const batch = recipientUserIds.slice(i, i + BATCH_SIZE);
      await tx.notification.createMany({
        data: batch.map((userId) => ({
          tenant_id,
          recipient_user_id: userId,
          channel: 'in_app' as const,
          template_key: 'announcement.published',
          locale: 'en',
          status: 'delivered' as const,
          payload_json: {
            announcement_id,
            announcement_title: announcement.title,
          },
          source_entity_type: 'announcement',
          source_entity_id: announcement_id,
          delivered_at: new Date(),
        })),
      });
    }

    this.logger.log(
      `Published announcement ${announcement_id}, created notifications for ${recipientUserIds.length} users`,
    );
  }

  private async resolveAudience(
    tx: PrismaClient,
    tenantId: string,
    scope: string,
    targetPayload: Record<string, unknown>,
  ): Promise<string[]> {
    switch (scope) {
      case 'school': {
        const parents = await tx.parent.findMany({
          where: { tenant_id: tenantId, user_id: { not: null }, status: 'active' },
          select: { user_id: true },
        });
        return parents.map((p: { user_id: string | null }) => p.user_id!).filter(Boolean);
      }

      case 'year_group': {
        const yearGroupIds = (targetPayload.year_group_ids as string[]) ?? [];
        const students = await tx.student.findMany({
          where: { tenant_id: tenantId, year_group_id: { in: yearGroupIds }, status: 'active' },
          select: { id: true },
        });
        return this.getParentUserIds(
          tx,
          tenantId,
          students.map((s: { id: string }) => s.id),
        );
      }

      case 'class': {
        const classIds = (targetPayload.class_ids as string[]) ?? [];
        const enrolments = await tx.classEnrolment.findMany({
          where: { tenant_id: tenantId, class_id: { in: classIds }, status: 'active' },
          select: { student_id: true },
        });
        const studentIds: string[] = Array.from(
          new Set(enrolments.map((e: { student_id: string }) => e.student_id)),
        );
        return this.getParentUserIds(tx, tenantId, studentIds);
      }

      case 'household': {
        const householdIds = (targetPayload.household_ids as string[]) ?? [];
        const hp = await tx.householdParent.findMany({
          where: { tenant_id: tenantId, household_id: { in: householdIds } },
          select: { parent_id: true },
        });
        const parentIds = [...new Set(hp.map((h: { parent_id: string }) => h.parent_id))];
        const parents = await tx.parent.findMany({
          where: { id: { in: parentIds }, tenant_id: tenantId, user_id: { not: null } },
          select: { user_id: true },
        });
        return parents.map((p: { user_id: string | null }) => p.user_id!).filter(Boolean);
      }

      case 'custom': {
        return (targetPayload.user_ids as string[]) ?? [];
      }

      default:
        this.logger.warn(`Unknown announcement scope '${scope}'`);
        return [];
    }
  }

  private async getParentUserIds(
    tx: PrismaClient,
    tenantId: string,
    studentIds: string[],
  ): Promise<string[]> {
    if (studentIds.length === 0) return [];

    const sp = await tx.studentParent.findMany({
      where: { tenant_id: tenantId, student_id: { in: studentIds } },
      select: { parent_id: true },
    });
    const parentIds = [...new Set(sp.map((s: { parent_id: string }) => s.parent_id))];

    const parents = await tx.parent.findMany({
      where: { id: { in: parentIds }, tenant_id: tenantId, user_id: { not: null } },
      select: { user_id: true },
    });
    return Array.from(
      new Set(parents.map((p: { user_id: string | null }) => p.user_id!).filter(Boolean)),
    );
  }
}
