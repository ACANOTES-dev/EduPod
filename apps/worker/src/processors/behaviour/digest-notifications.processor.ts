import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { $Enums, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface DigestNotificationsPayload extends TenantJobPayload {
  tenant_id: string;
}

// ─── Job name ────────────────────────────────────────────────────────────────

export const BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB = 'behaviour:digest-notifications';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class DigestNotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(DigestNotificationsProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<DigestNotificationsPayload>): Promise<void> {
    if (job.name !== BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB} for tenant ${tenant_id}`,
    );

    const digestJob = new DigestNotificationsJob(this.prisma);
    await digestJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class DigestNotificationsJob extends TenantAwareJob<DigestNotificationsPayload> {
  private readonly logger = new Logger(DigestNotificationsJob.name);

  protected async processJob(
    data: DigestNotificationsPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id } = data;
    const now = new Date();
    const twentyFourHoursAgo = new Date(now);
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // 1. Load parents with pending behaviour notifications
    // parent_visible is on BehaviourCategory, not BehaviourIncident
    const rawPendingIncidents = await tx.behaviourIncident.findMany({
      where: {
        tenant_id,
        parent_notification_status: 'pending' as $Enums.ParentNotifStatus,
        category: { parent_visible: true },
        retention_status: 'active' as $Enums.RetentionStatus,
        occurred_at: { gte: twentyFourHoursAgo },
      },
      include: {
        category: true,
        participants: {
          where: { role: 'subject' },
          select: { student_id: true },
        },
      },
    });
    const pendingIncidents = rawPendingIncidents as Array<
      typeof rawPendingIncidents[0] & {
        category: { name: string } | null;
        participants: Array<{ student_id: string }>;
      }
    >;

    if (pendingIncidents.length === 0) {
      this.logger.log(`No pending notifications for tenant ${tenant_id} — done`);
      return;
    }

    // Collect unique student IDs
    const studentIds = new Set<string>();
    for (const inc of pendingIncidents) {
      for (const p of inc.participants) {
        studentIds.add(p.student_id);
      }
    }

    // 2. For each student, find their parents
    const studentParentLinks = await tx.studentParent.findMany({
      where: {
        tenant_id,
        student_id: { in: [...studentIds] },
      },
      include: {
        parent: {
          select: {
            id: true,
            user_id: true,
            preferred_contact_channels: true,
            status: true,
          },
        },
      },
    });

    // Group parents by student
    const parentsByStudent = new Map<string, Array<{ parent_id: string; user_id: string | null }>>();
    for (const sp of studentParentLinks) {
      if (sp.parent.status !== 'active') continue;
      const existing = parentsByStudent.get(sp.student_id) ?? [];
      existing.push({ parent_id: sp.parent.id, user_id: sp.parent.user_id });
      parentsByStudent.set(sp.student_id, existing);
    }

    let parentsNotified = 0;
    let notificationsSent = 0;

    // 3. Process each parent
    const processedParentStudents = new Set<string>();

    for (const incident of pendingIncidents) {
      for (const participant of incident.participants) {
        const parents = parentsByStudent.get(participant.student_id) ?? [];

        for (const parentInfo of parents) {
          const key = `${parentInfo.parent_id}:${participant.student_id}`;
          if (processedParentStudents.has(key)) continue;

          try {
            // 3a. Guardian restriction check
            const restricted = await tx.behaviourGuardianRestriction.findFirst({
              where: {
                tenant_id,
                student_id: participant.student_id,
                parent_id: parentInfo.parent_id,
                restriction_type: {
                  in: ['no_behaviour_visibility', 'no_behaviour_notifications'] as $Enums.RestrictionType[],
                },
                status: 'active_restriction' as $Enums.RestrictionStatus,
                effective_from: { lte: now },
                OR: [
                  { effective_until: null },
                  { effective_until: { gte: now } },
                ],
              },
            });

            if (restricted) {
              this.logger.log(
                `Guardian restriction active for parent ${parentInfo.parent_id} / student ${participant.student_id} — skipping`,
              );
              continue;
            }

            // 3b. Dedup check — already sent today?
            const existingAck = await tx.behaviourParentAcknowledgement.findFirst({
              where: {
                tenant_id,
                incident_id: incident.id,
                parent_id: parentInfo.parent_id,
                sent_at: { gte: twentyFourHoursAgo },
              },
            });

            if (existingAck) {
              continue;
            }

            // 3c. Create acknowledgement record
            await tx.behaviourParentAcknowledgement.create({
              data: {
                tenant_id,
                incident_id: incident.id,
                parent_id: parentInfo.parent_id,
                channel: 'in_app' as $Enums.AcknowledgementChannel,
                sent_at: now,
              },
            });

            // 3d. Create in-app notification if parent has a user account
            if (parentInfo.user_id) {
              await tx.notification.create({
                data: {
                  tenant_id,
                  recipient_user_id: parentInfo.user_id,
                  channel: 'in_app',
                  template_key: 'behaviour.digest_notification',
                  locale: 'en',
                  status: 'delivered',
                  payload_json: {
                    incident_id: incident.id,
                    incident_number: incident.incident_number,
                    category_name: incident.category?.name,
                    polarity: incident.polarity,
                    severity: incident.severity,
                    student_id: participant.student_id,
                    is_digest: true,
                  },
                  source_entity_type: 'behaviour_incident',
                  source_entity_id: incident.id,
                  delivered_at: now,
                },
              });
              notificationsSent++;
            }

            processedParentStudents.add(key);
            parentsNotified++;
          } catch (err) {
            this.logger.error(
              `Failed to process digest for parent ${parentInfo.parent_id}: ${(err as Error).message}`,
            );
            // Continue processing other parents
          }
        }
      }

      // 4. Update incident notification status
      await tx.behaviourIncident.update({
        where: { id: incident.id },
        data: { parent_notification_status: 'sent' as $Enums.ParentNotifStatus },
      });
    }

    this.logger.log(
      `Digest complete for tenant ${tenant_id}: ${parentsNotified} parents notified, ${notificationsSent} notifications sent, ${pendingIncidents.length} incidents processed`,
    );
  }
}
