import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import { SANCTION_PARENT_VISIBLE_FIELDS } from '@school/shared';
import type { AmendmentListQuery } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';

/**
 * Parent-visible fields per entity type.
 * When these fields change after a parent notification was sent,
 * an amendment notice is created automatically.
 */
const INCIDENT_PARENT_VISIBLE_FIELDS = [
  'category_id',
  'parent_description',
  'parent_description_ar',
  'occurred_at',
] as const;

/** Fields that require the parent to re-acknowledge when changed */
const HIGH_SEVERITY_FIELDS = [
  'category_id',
  'type',
  'suspension_start_date',
  'suspension_end_date',
] as const;

interface CreateAmendmentNoticeParams {
  tenantId: string;
  entityType: string;
  entityId: string;
  changedById: string;
  authorisedById?: string;
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  reason: string;
  amendmentType: string;
}

interface CheckAndCreateAmendmentParams {
  tenantId: string;
  entityType: string;
  entityId: string;
  changedById: string;
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  reason: string;
  parentNotificationStatus?: string;
  parentVisibleFields?: readonly string[];
}

@Injectable()
export class BehaviourAmendmentsService {
  private readonly logger = new Logger(BehaviourAmendmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly historyService: BehaviourHistoryService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  // ─── Create Amendment Notice ────────────────────────────────────────────────

  async createAmendmentNotice(params: CreateAmendmentNoticeParams) {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: params.tenantId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return this.createAmendmentNoticeInTx(db, params);
    });
  }

  /**
   * Internal: create amendment notice within an existing transaction.
   * This is called both from the public method and from the appeal service.
   */
  async createAmendmentNoticeInTx(db: PrismaService, params: CreateAmendmentNoticeParams) {
    // Build what_changed JSONB diff from parent-visible fields only
    const parentVisibleFields = this.getParentVisibleFields(params.entityType);
    const whatChanged: Array<{
      field: string;
      old_value: unknown;
      new_value: unknown;
    }> = [];

    for (const field of parentVisibleFields) {
      if (params.previousValues[field] !== undefined || params.newValues[field] !== undefined) {
        const oldVal = params.previousValues[field] ?? null;
        const newVal = params.newValues[field] ?? null;
        if (oldVal !== newVal) {
          whatChanged.push({
            field,
            old_value: oldVal,
            new_value: newVal,
          });
        }
      }
    }

    // If no parent-visible fields changed, skip creating the notice
    if (whatChanged.length === 0) {
      return null;
    }

    // Determine if re-acknowledgement is required based on severity
    const changedFieldNames = whatChanged.map((c) => c.field);
    const requiresReack = changedFieldNames.some((f) =>
      (HIGH_SEVERITY_FIELDS as readonly string[]).includes(f),
    );

    // Map amendment type
    const amendmentType = params.amendmentType as $Enums.AmendmentType;

    // Insert the amendment notice
    const notice = await db.behaviourAmendmentNotice.create({
      data: {
        tenant_id: params.tenantId,
        entity_type: params.entityType,
        entity_id: params.entityId,
        amendment_type: amendmentType,
        what_changed: whatChanged as unknown as Prisma.InputJsonValue,
        change_reason: params.reason,
        changed_by_id: params.changedById,
        authorised_by_id: params.authorisedById ?? null,
        requires_parent_reacknowledgement: requiresReack,
      },
    });

    // Record entity history
    await this.historyService.recordHistory(
      db,
      params.tenantId,
      params.entityType,
      params.entityId,
      params.changedById,
      'amendment_created',
      null,
      {
        amendment_notice_id: notice.id,
        amendment_type: params.amendmentType,
        what_changed: whatChanged,
        requires_reacknowledgement: requiresReack,
      },
    );

    return notice;
  }

  // ─── List Amendment Notices ─────────────────────────────────────────────────

  async list(tenantId: string, filters: AmendmentListQuery) {
    const where: Prisma.BehaviourAmendmentNoticeWhereInput = {
      tenant_id: tenantId,
    };

    if (filters.entity_type) {
      where.entity_type = filters.entity_type;
    }
    if (filters.amendment_type) {
      where.amendment_type = filters.amendment_type as $Enums.AmendmentType;
    }
    if (filters.correction_sent !== undefined) {
      where.correction_notification_sent = filters.correction_sent;
    }

    const [data, total] = await Promise.all([
      this.prisma.behaviourAmendmentNotice.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        include: {
          changed_by: {
            select: { id: true, first_name: true, last_name: true },
          },
          authorised_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.behaviourAmendmentNotice.count({ where }),
    ]);

    return {
      data,
      meta: { page: filters.page, pageSize: filters.pageSize, total },
    };
  }

  // ─── Get By ID ──────────────────────────────────────────────────────────────

  async getById(tenantId: string, id: string) {
    const notice = await this.prisma.behaviourAmendmentNotice.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        changed_by: {
          select: { id: true, first_name: true, last_name: true },
        },
        authorised_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    if (!notice) {
      throw new NotFoundException({
        code: 'AMENDMENT_NOTICE_NOT_FOUND',
        message: 'Amendment notice not found',
      });
    }

    return notice;
  }

  // ─── Send Correction ────────────────────────────────────────────────────────

  async sendCorrection(tenantId: string, id: string, userId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const notice = await db.behaviourAmendmentNotice.findFirst({
        where: { id, tenant_id: tenantId },
      });
      if (!notice) {
        throw new NotFoundException({
          code: 'AMENDMENT_NOTICE_NOT_FOUND',
          message: 'Amendment notice not found',
        });
      }

      // ── Step 2-3: Resolve student_id + incident/sanction IDs from entity ──
      const entityRefs = await this.resolveEntityReferences(
        db,
        tenantId,
        notice.entity_type,
        notice.entity_id,
      );

      // ── Step 4: Find parents for the student ─────────────────────────────
      const now = new Date();
      if (entityRefs.studentId) {
        const studentParents = await db.studentParent.findMany({
          where: {
            student_id: entityRefs.studentId,
            tenant_id: tenantId,
          },
          include: {
            parent: {
              select: { id: true, user_id: true, status: true },
            },
          },
        });

        for (const sp of studentParents) {
          if (sp.parent.status !== 'active') continue;

          // ── Step 5: Create acknowledgement row with amendment_notice_id ─
          try {
            await db.behaviourParentAcknowledgement.create({
              data: {
                tenant_id: tenantId,
                incident_id: entityRefs.incidentId ?? null,
                sanction_id: entityRefs.sanctionId ?? null,
                amendment_notice_id: notice.id,
                parent_id: sp.parent.id,
                channel: 'in_app',
                sent_at: now,
              },
            });
          } catch (err) {
            this.logger.error(
              '[sendCorrection] ack row creation failed',
              err instanceof Error ? err.stack : String(err),
            );
          }

          // ── Step 6: Create in-app notification for correction ──────────
          if (sp.parent.user_id) {
            try {
              await db.notification.create({
                data: {
                  tenant_id: tenantId,
                  recipient_user_id: sp.parent.user_id,
                  channel: 'in_app',
                  template_key: notice.requires_parent_reacknowledgement
                    ? 'behaviour_reacknowledgement_request'
                    : 'behaviour_correction_parent',
                  locale: 'en',
                  status: 'delivered',
                  payload_json: {
                    amendment_notice_id: notice.id,
                    entity_type: notice.entity_type,
                    entity_id: notice.entity_id,
                    requires_reacknowledgement: notice.requires_parent_reacknowledgement,
                  },
                  source_entity_type: 'behaviour_amendment_notice',
                  source_entity_id: notice.id,
                  delivered_at: now,
                },
              });
            } catch (err) {
              this.logger.error(
                '[sendCorrection] notification creation failed',
                err instanceof Error ? err.stack : String(err),
              );
            }
          }
        }
      }

      // ── Step 7: Update correction_notification_sent flags ───────────────
      const updated = await db.behaviourAmendmentNotice.update({
        where: { id },
        data: {
          correction_notification_sent: true,
          correction_notification_sent_at: now,
        },
      });

      // ── Step 8: Document supersession ──────────────────────────────────
      try {
        const existingSentDoc = await db.behaviourDocument.findFirst({
          where: {
            tenant_id: tenantId,
            entity_id: notice.entity_id,
            status: 'sent_doc',
          },
          orderBy: { generated_at: 'desc' },
        });

        if (existingSentDoc) {
          await db.behaviourDocument.update({
            where: { id: existingSentDoc.id },
            data: {
              status: 'superseded',
              superseded_reason: `Amendment: ${notice.change_reason ?? 'Post-notification correction'}`,
            },
          });
        }
      } catch (err) {
        this.logger.error(
          '[sendCorrection] document supersession failed',
          err instanceof Error ? err.stack : String(err),
        );
      }

      // Enqueue correction notification to parent (async delivery)
      try {
        await this.notificationsQueue.add('behaviour:correction-parent', {
          tenant_id: tenantId,
          amendment_notice_id: id,
          entity_type: notice.entity_type,
          entity_id: notice.entity_id,
        });
      } catch (err) {
        this.logger.error(
          '[sendCorrection] correction-parent queue add failed',
          err instanceof Error ? err.stack : String(err),
        );
      }

      // If requires re-acknowledgement, enqueue re-ack request
      if (notice.requires_parent_reacknowledgement) {
        try {
          await this.notificationsQueue.add('behaviour:parent-reacknowledgement', {
            tenant_id: tenantId,
            amendment_notice_id: id,
            entity_type: notice.entity_type,
            entity_id: notice.entity_id,
          });
        } catch (err) {
          this.logger.error(
            '[sendCorrection] parent-reacknowledgement queue add failed',
            err instanceof Error ? err.stack : String(err),
          );
        }
      }

      // Record entity history
      await this.historyService.recordHistory(
        db,
        tenantId,
        notice.entity_type,
        notice.entity_id,
        userId,
        'correction_sent',
        { correction_notification_sent: false },
        {
          correction_notification_sent: true,
          amendment_notice_id: id,
          requires_reacknowledgement: notice.requires_parent_reacknowledgement,
        },
      );

      return updated;
    });
  }

  // ─── Get Pending (unsent corrections) ───────────────────────────────────────

  async getPending(tenantId: string, page: number, pageSize: number) {
    const where: Prisma.BehaviourAmendmentNoticeWhereInput = {
      tenant_id: tenantId,
      correction_notification_sent: false,
    };

    const [data, total] = await Promise.all([
      this.prisma.behaviourAmendmentNotice.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          changed_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.behaviourAmendmentNotice.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Check and Create Amendment ─────────────────────────────────────────────

  /**
   * Helper called during incident/sanction updates.
   * Checks if parent notification was already sent and if any parent-visible
   * field changed. If both conditions are met, creates an amendment notice.
   */
  async checkAndCreateAmendment(params: CheckAndCreateAmendmentParams): Promise<boolean> {
    const sentStatuses = ['sent', 'delivered', 'acknowledged'];

    // Check if notification was already sent to parent
    const notificationSent = params.parentNotificationStatus
      ? sentStatuses.includes(params.parentNotificationStatus)
      : false;

    if (!notificationSent) {
      return false;
    }

    // Get the correct parent-visible fields list
    const parentVisibleFields =
      params.parentVisibleFields ?? this.getParentVisibleFields(params.entityType);

    // Check if any parent-visible field changed
    const hasVisibleChange = parentVisibleFields.some((field) => {
      const oldVal = params.previousValues[field];
      const newVal = params.newValues[field];
      return newVal !== undefined && oldVal !== newVal;
    });

    if (!hasVisibleChange) {
      return false;
    }

    // Create amendment notice
    await this.createAmendmentNotice({
      tenantId: params.tenantId,
      entityType: params.entityType,
      entityId: params.entityId,
      changedById: params.changedById,
      previousValues: params.previousValues,
      newValues: params.newValues,
      reason: params.reason,
      amendmentType: 'correction',
    });

    return true;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Resolve the student_id, incident_id, and sanction_id from the
   * amendment notice's entity_type + entity_id. Incidents derive student
   * from the first 'subject' participant; sanctions have student_id directly.
   */
  private async resolveEntityReferences(
    db: PrismaService,
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<{
    studentId: string | null;
    incidentId: string | null;
    sanctionId: string | null;
  }> {
    if (entityType === 'sanction') {
      const sanction = await db.behaviourSanction.findFirst({
        where: { id: entityId, tenant_id: tenantId },
        select: { student_id: true, incident_id: true },
      });
      return {
        studentId: sanction?.student_id ?? null,
        incidentId: sanction?.incident_id ?? null,
        sanctionId: entityId,
      };
    }

    if (entityType === 'incident') {
      // Incidents don't have a direct student_id; find the subject participant
      const subjectParticipant = await db.behaviourIncidentParticipant.findFirst({
        where: {
          incident_id: entityId,
          tenant_id: tenantId,
          role: 'subject',
          student_id: { not: null },
        },
        select: { student_id: true },
      });
      return {
        studentId: subjectParticipant?.student_id ?? null,
        incidentId: entityId,
        sanctionId: null,
      };
    }

    return { studentId: null, incidentId: null, sanctionId: null };
  }

  private getParentVisibleFields(entityType: string): readonly string[] {
    switch (entityType) {
      case 'incident':
        return INCIDENT_PARENT_VISIBLE_FIELDS;
      case 'sanction':
        return SANCTION_PARENT_VISIBLE_FIELDS;
      default:
        return [];
    }
  }
}
