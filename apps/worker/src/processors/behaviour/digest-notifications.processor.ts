import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { $Enums, Prisma, PrismaClient } from '@prisma/client';
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface DigestEntry {
  incident_id: string;
  incident_number: string;
  rendered_description: string;
  category_name: string;
  polarity: string;
  severity: number;
  occurred_at: string;
  student_id: string;
}

interface ParentInfo {
  parent_id: string;
  user_id: string | null;
  channels: $Enums.NotificationChannel[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parent-safe rendering priority chain:
 * 1. parent_description (if non-empty)
 * 2. context_snapshot.description_template_text (if present)
 * 3. category.name + " — " + formatted date
 */
function renderForParent(incident: {
  parent_description: string | null;
  context_snapshot: unknown;
  category: { name: string } | null;
  occurred_at: Date;
}): string {
  if (incident.parent_description?.trim()) {
    return incident.parent_description.trim();
  }

  const snapshot = incident.context_snapshot as Record<string, unknown> | null;
  if (snapshot?.description_template_text) {
    return snapshot.description_template_text as string;
  }

  const catName = incident.category?.name ?? 'Incident';
  return `${catName} — ${incident.occurred_at.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

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

    // 1. Load pending incidents with parent-visible categories
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

    // 2. Collect unique student IDs from all incidents
    const studentIds = new Set<string>();
    for (const inc of pendingIncidents) {
      for (const p of inc.participants) {
        studentIds.add(p.student_id);
      }
    }

    // 3. Load student-parent links with parent info (including preferred channels)
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

    // Build parentsByStudent map — includes preferred channels
    const parentsByStudent = new Map<string, ParentInfo[]>();
    for (const sp of studentParentLinks) {
      if (sp.parent.status !== 'active') continue;
      const existing = parentsByStudent.get(sp.student_id) ?? [];
      existing.push({
        parent_id: sp.parent.id,
        user_id: sp.parent.user_id,
        channels: resolveChannels(sp.parent.preferred_contact_channels),
      });
      parentsByStudent.set(sp.student_id, existing);
    }

    // 4. Build incidents-by-student map
    const incidentsByStudent = new Map<string, typeof pendingIncidents>();
    for (const incident of pendingIncidents) {
      for (const p of incident.participants) {
        const existing = incidentsByStudent.get(p.student_id) ?? [];
        existing.push(incident);
        incidentsByStudent.set(p.student_id, existing);
      }
    }

    // 5. Build per-parent digest: collect all incidents across all their linked students
    // Map<parent_id, { parentInfo, digestEntries[], incidentIds[] }>
    const parentDigests = new Map<
      string,
      {
        parentInfo: ParentInfo;
        entries: DigestEntry[];
        incidentIds: Set<string>;
      }
    >();

    for (const [studentId, parents] of parentsByStudent) {
      const studentIncidents = incidentsByStudent.get(studentId) ?? [];
      if (studentIncidents.length === 0) continue;

      for (const parentInfo of parents) {
        // Guardian restriction check per parent+student
        const restricted = await tx.behaviourGuardianRestriction.findFirst({
          where: {
            tenant_id,
            student_id: studentId,
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
            `Guardian restriction active for parent ${parentInfo.parent_id} / student ${studentId} — skipping`,
          );
          continue;
        }

        // Collect incidents for this parent+student
        for (const incident of studentIncidents) {
          // Dedup check — already sent today for this specific incident+parent?
          const existingAck = await tx.behaviourParentAcknowledgement.findFirst({
            where: {
              tenant_id,
              incident_id: incident.id,
              parent_id: parentInfo.parent_id,
              sent_at: { gte: twentyFourHoursAgo },
            },
          });

          if (existingAck) continue;

          // Apply parent-safe rendering (Gap #6)
          const rendered = renderForParent(incident);

          const entry: DigestEntry = {
            incident_id: incident.id,
            incident_number: incident.incident_number,
            rendered_description: rendered,
            category_name: incident.category?.name ?? 'Incident',
            polarity: incident.polarity,
            severity: incident.severity,
            occurred_at: incident.occurred_at.toISOString(),
            student_id: studentId,
          };

          const existing = parentDigests.get(parentInfo.parent_id);
          if (existing) {
            // Only add if this incident wasn't already added for this parent
            if (!existing.incidentIds.has(incident.id)) {
              existing.entries.push(entry);
              existing.incidentIds.add(incident.id);
            }
          } else {
            parentDigests.set(parentInfo.parent_id, {
              parentInfo,
              entries: [entry],
              incidentIds: new Set([incident.id]),
            });
          }
        }
      }
    }

    // 6. Create ONE batch notification per parent (Gap #4) via preferred channels (Gap #5)
    let parentsNotified = 0;
    let notificationsSent = 0;

    for (const [parentId, digest] of parentDigests) {
      if (digest.entries.length === 0) continue;

      try {
        const { parentInfo, entries, incidentIds } = digest;

        // Create ack rows for each incident in the batch
        for (const incidentId of incidentIds) {
          await tx.behaviourParentAcknowledgement.create({
            data: {
              tenant_id,
              incident_id: incidentId,
              parent_id: parentId,
              channel: 'in_app' as $Enums.AcknowledgementChannel,
              sent_at: now,
            },
          });
        }

        // Create notifications if parent has a user account
        if (parentInfo.user_id) {
          const { channels } = parentInfo;

          for (const channel of channels) {
            // in_app is always delivered immediately; others are queued
            const isInApp = channel === 'in_app';

            await tx.notification.create({
              data: {
                tenant_id,
                recipient_user_id: parentInfo.user_id,
                channel,
                template_key: 'behaviour.digest_notification',
                locale: 'en',
                status: isInApp ? 'delivered' : 'queued',
                payload_json: {
                  is_digest: true,
                  entries: entries.map((e) => ({ ...e })),
                  total_incidents: entries.length,
                } as Prisma.InputJsonValue,
                source_entity_type: 'behaviour_digest',
                source_entity_id: tenant_id,
                delivered_at: isInApp ? now : undefined,
              },
            });
            notificationsSent++;
          }
        }

        parentsNotified++;
      } catch (err) {
        this.logger.error(
          `Failed to process digest for parent ${parentId}: ${(err as Error).message}`,
        );
        // Continue processing other parents
      }
    }

    // 7. Update all processed incident notification statuses to 'sent'
    for (const incident of pendingIncidents) {
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
