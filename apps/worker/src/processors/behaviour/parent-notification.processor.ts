import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { $Enums, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface BehaviourParentNotificationPayload extends TenantJobPayload {
  incident_id: string;
  student_ids: string[];
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const BEHAVIOUR_PARENT_NOTIFICATION_JOB =
  'behaviour:parent-notification';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class BehaviourParentNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(
    BehaviourParentNotificationProcessor.name,
  );

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<BehaviourParentNotificationPayload>): Promise<void> {
    if (job.name !== BEHAVIOUR_PARENT_NOTIFICATION_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${BEHAVIOUR_PARENT_NOTIFICATION_JOB} — incident ${job.data.incident_id}, ${job.data.student_ids.length} student(s)`,
    );

    const notifJob = new BehaviourParentNotificationJob(this.prisma);
    await notifJob.execute(job.data);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map preferred_contact_channels JSON to valid NotificationChannel values */
const VALID_EXTRA_CHANNELS = new Set(['email', 'whatsapp', 'sms']);

function resolveChannels(preferredRaw: unknown): $Enums.NotificationChannel[] {
  const channels: $Enums.NotificationChannel[] = ['in_app'];

  if (Array.isArray(preferredRaw)) {
    for (const ch of preferredRaw) {
      if (typeof ch === 'string' && VALID_EXTRA_CHANNELS.has(ch)) {
        channels.push(ch as $Enums.NotificationChannel);
      }
    }
  }

  return channels;
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class BehaviourParentNotificationJob extends TenantAwareJob<BehaviourParentNotificationPayload> {
  private readonly logger = new Logger(BehaviourParentNotificationJob.name);

  protected async processJob(
    data: BehaviourParentNotificationPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, incident_id, student_ids } = data;

    // 1. Load incident with category
    const incident = await tx.behaviourIncident.findFirst({
      where: { id: incident_id, tenant_id },
      include: { category: true },
    });

    if (!incident) {
      this.logger.warn(
        `Incident ${incident_id} not found for tenant ${tenant_id} — skipping`,
      );
      return;
    }

    // 2. Load tenant behaviour settings
    const tenantSettings = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });

    const settings =
      (tenantSettings?.settings as Record<string, unknown>) ?? {};
    const behaviourSettings =
      (settings?.behaviour as Record<string, unknown>) ?? {};
    const sendGateSeverity =
      (behaviourSettings?.parent_notification_send_gate_severity as
        | number
        | undefined) ?? null;
    const autoLockOnSend =
      (behaviourSettings?.parent_description_auto_lock_on_send as
        | boolean
        | undefined) ?? false;

    const now = new Date();
    let anyBlocked = false;

    // 3. Process each student
    for (const studentId of student_ids) {
      // 3a. Check send-gate for negative incidents
      if (
        incident.polarity === 'negative' &&
        sendGateSeverity !== null &&
        incident.severity >= sendGateSeverity
      ) {
        // Verify parent_description exists before sending
        if (
          !incident.parent_description ||
          incident.parent_description.trim() === ''
        ) {
          this.logger.log(
            `Send-gate blocked: incident ${incident_id} severity ${incident.severity} >= gate ${sendGateSeverity} but no parent_description — skipping student ${studentId}`,
          );
          anyBlocked = true;
          continue;
        }
      }

      // 3b. Load student's parents via join table
      const studentParents = await tx.studentParent.findMany({
        where: { student_id: studentId, tenant_id },
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

      if (studentParents.length === 0) {
        this.logger.log(
          `No parents found for student ${studentId} — skipping`,
        );
        continue;
      }

      // 3c. Create acknowledgement records and notifications for each parent
      for (const sp of studentParents) {
        if (sp.parent.status !== 'active') {
          continue;
        }

        // Create acknowledgement record
        await tx.behaviourParentAcknowledgement.create({
          data: {
            tenant_id,
            incident_id,
            parent_id: sp.parent.id,
            sent_at: now,
          },
        });

        // Create notifications per preferred channel if parent has a user account
        if (sp.parent.user_id) {
          const channels = resolveChannels(sp.parent.preferred_contact_channels);

          for (const channel of channels) {
            const isInApp = channel === 'in_app';

            await tx.notification.create({
              data: {
                tenant_id,
                recipient_user_id: sp.parent.user_id,
                channel,
                template_key: 'behaviour.incident_notification',
                locale: 'en',
                status: isInApp ? 'delivered' : 'queued',
                payload_json: {
                  incident_id,
                  incident_number: incident.incident_number,
                  category_name: incident.category.name,
                  polarity: incident.polarity,
                  severity: incident.severity,
                  student_id: studentId,
                },
                source_entity_type: 'behaviour_incident',
                source_entity_id: incident_id,
                delivered_at: isInApp ? now : undefined,
              },
            });
          }
        }

        this.logger.log(
          `Created acknowledgement for parent ${sp.parent.id} on incident ${incident_id}`,
        );
      }
    }

    // 4. Lock parent_description if configured
    if (autoLockOnSend && !anyBlocked && !incident.parent_description_locked) {
      await tx.behaviourIncident.update({
        where: { id: incident_id },
        data: { parent_description_locked: true },
      });
      this.logger.log(
        `Auto-locked parent_description on incident ${incident_id}`,
      );
    }

    // 5. Update incident parent_notification_status
    if (!anyBlocked) {
      await tx.behaviourIncident.update({
        where: { id: incident_id },
        data: { parent_notification_status: 'sent' },
      });
      this.logger.log(
        `Updated incident ${incident_id} parent_notification_status to sent`,
      );
    } else {
      this.logger.log(
        `Incident ${incident_id} has blocked students — parent_notification_status remains pending`,
      );
    }
  }
}
