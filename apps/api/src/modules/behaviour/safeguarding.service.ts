import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import {
  type AssignSafeguardingConcernDto,
  type BehaviourSettings,
  type CreateConcernDto,
  type CreateCpRecordDto,
  type GardaReferralDto,
  type InitiateSealDto,
  type ListSafeguardingActionsQuery,
  type ListSafeguardingConcernsQuery,
  type MyReportsQuery,
  type RecordSafeguardingActionDto,
  type ReportSafeguardingConcernDto,
  type SafeguardingStatusTransitionDto,
  type TuslaReferralDto,
  type UpdateSafeguardingConcernDto,
  behaviourSettingsSchema,
  isValidSafeguardingTransition,
} from '@school/shared';
import { Queue } from 'bullmq';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CpRecordService } from '../child-protection/services/cp-record.service';
import { ConcernVersionService } from '../pastoral/services/concern-version.service';
import { ConcernService } from '../pastoral/services/concern.service';
import { PastoralEventService } from '../pastoral/services/pastoral-event.service';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';

import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourTasksService } from './behaviour-tasks.service';
import {
  SAFEGUARDING_CRITICAL_ESCALATION_JOB,
} from './safeguarding.constants';

// ─── Prisma → Domain enum maps ──────────────────────────────────────────────

const SEVERITY_TO_PRISMA: Record<string, $Enums.SafeguardingSeverity> = {
  low: 'low_sev' as $Enums.SafeguardingSeverity,
  medium: 'medium_sev' as $Enums.SafeguardingSeverity,
  high: 'high_sev' as $Enums.SafeguardingSeverity,
  critical: 'critical_sev' as $Enums.SafeguardingSeverity,
};

const PRISMA_TO_SEVERITY: Record<string, string> = {
  low_sev: 'low',
  medium_sev: 'medium',
  high_sev: 'high',
  critical_sev: 'critical',
};

const STATUS_TO_PRISMA: Record<string, $Enums.SafeguardingStatus> = {
  reported: 'reported' as $Enums.SafeguardingStatus,
  acknowledged: 'acknowledged' as $Enums.SafeguardingStatus,
  under_investigation: 'under_investigation' as $Enums.SafeguardingStatus,
  referred: 'referred' as $Enums.SafeguardingStatus,
  monitoring: 'sg_monitoring' as $Enums.SafeguardingStatus,
  resolved: 'sg_resolved' as $Enums.SafeguardingStatus,
  sealed: 'sealed' as $Enums.SafeguardingStatus,
};

const PRISMA_TO_STATUS: Record<string, string> = {
  reported: 'reported',
  acknowledged: 'acknowledged',
  under_investigation: 'under_investigation',
  referred: 'referred',
  sg_monitoring: 'monitoring',
  sg_resolved: 'resolved',
  sealed: 'sealed',
};

const CONCERN_TYPE_TO_PRISMA: Record<string, $Enums.SafeguardingConcernType> = {
  physical_abuse: 'physical_abuse' as $Enums.SafeguardingConcernType,
  emotional_abuse: 'emotional_abuse' as $Enums.SafeguardingConcernType,
  sexual_abuse: 'sexual_abuse' as $Enums.SafeguardingConcernType,
  neglect: 'neglect' as $Enums.SafeguardingConcernType,
  self_harm: 'self_harm' as $Enums.SafeguardingConcernType,
  bullying: 'bullying' as $Enums.SafeguardingConcernType,
  online_safety: 'online_safety' as $Enums.SafeguardingConcernType,
  domestic_violence: 'domestic_violence' as $Enums.SafeguardingConcernType,
  substance_abuse: 'substance_abuse' as $Enums.SafeguardingConcernType,
  mental_health: 'mental_health' as $Enums.SafeguardingConcernType,
  radicalisation: 'radicalisation' as $Enums.SafeguardingConcernType,
  other: 'other_concern' as $Enums.SafeguardingConcernType,
};

const PRISMA_TO_CONCERN_TYPE: Record<string, string> = {
  physical_abuse: 'physical_abuse',
  emotional_abuse: 'emotional_abuse',
  sexual_abuse: 'sexual_abuse',
  neglect: 'neglect',
  self_harm: 'self_harm',
  bullying: 'bullying',
  online_safety: 'online_safety',
  domestic_violence: 'domestic_violence',
  substance_abuse: 'substance_abuse',
  mental_health: 'mental_health',
  radicalisation: 'radicalisation',
  other_concern: 'other',
};

const ACK_STATUS_TO_PRISMA: Record<string, $Enums.ReporterAckStatus> = {
  received: 'received' as $Enums.ReporterAckStatus,
  assigned: 'assigned_ack' as $Enums.ReporterAckStatus,
  under_review: 'under_review_ack' as $Enums.ReporterAckStatus,
};

const PRISMA_TO_ACK_STATUS: Record<string, string> = {
  received: 'received',
  assigned_ack: 'assigned',
  under_review_ack: 'under_review',
};

const ACTION_TYPE_TO_PRISMA: Record<string, $Enums.SafeguardingActionType> = {
  note_added: 'note_added' as $Enums.SafeguardingActionType,
  status_changed: 'status_changed' as $Enums.SafeguardingActionType,
  assigned: 'assigned' as $Enums.SafeguardingActionType,
  meeting_held: 'meeting_held' as $Enums.SafeguardingActionType,
  parent_contacted: 'parent_contacted' as $Enums.SafeguardingActionType,
  agency_contacted: 'agency_contacted' as $Enums.SafeguardingActionType,
  tusla_referred: 'tusla_referred' as $Enums.SafeguardingActionType,
  garda_referred: 'garda_referred' as $Enums.SafeguardingActionType,
  document_uploaded: 'document_uploaded' as $Enums.SafeguardingActionType,
  document_downloaded: 'document_downloaded' as $Enums.SafeguardingActionType,
  review_completed: 'review_completed' as $Enums.SafeguardingActionType,
};

const PRISMA_TO_ACTION_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(ACTION_TYPE_TO_PRISMA).map(([k, v]) => [v, k]),
);

// ─── Behaviour → Pastoral severity mapping ──────────────────────────────────

const BEHAVIOUR_TO_PASTORAL_SEVERITY: Record<string, string> = {
  low: 'routine',
  medium: 'elevated',
  high: 'urgent',
  critical: 'critical',
};

// ─── Behaviour → Pastoral status mapping ─────────────────────────────────────

const BEHAVIOUR_TO_PASTORAL_STATUS: Record<string, string> = {
  reported: 'routine',
  acknowledged: 'routine',
  under_investigation: 'elevated',
  referred: 'elevated',
  monitoring: 'monitoring',
  resolved: 'resolved',
  sealed: 'resolved',
};

@Injectable()
export class SafeguardingService {
  private readonly logger = new Logger(SafeguardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly historyService: BehaviourHistoryService,
    private readonly tasksService: BehaviourTasksService,
    private readonly auditLogService: AuditLogService,
    @InjectQueue('behaviour') private readonly behaviourQueue: Queue,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    private readonly concernService: ConcernService,
    private readonly cpRecordService: CpRecordService,
    private readonly concernVersionService: ConcernVersionService,
    private readonly pastoralEventService: PastoralEventService,
    private readonly pdfRenderingService: PdfRenderingService,
  ) {}

  // ─── Report Concern ─────────────────────────────────────────────────────

  async reportConcern(
    tenantId: string,
    userId: string,
    dto: ReportSafeguardingConcernDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Load behaviour settings for SLA thresholds
      const settings = await this.loadBehaviourSettings(db, tenantId);

      // Generate concern number
      const concernNumber = await this.sequenceService.nextNumber(
        tenantId, 'safeguarding_concern', tx, 'CP',
      );

      // Compute SLA deadline (wall-clock hours)
      const slaHoursMap: Record<string, number> = {
        critical: settings.safeguarding_sla_critical_hours,
        high: settings.safeguarding_sla_high_hours,
        medium: settings.safeguarding_sla_medium_hours,
        low: settings.safeguarding_sla_low_hours,
      };
      const slaHours = slaHoursMap[dto.severity] ?? 168;
      const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

      // Compute retention_until: student DOB + 25 years, or fallback
      const student = await db.student.findFirst({
        where: { id: dto.student_id, tenant_id: tenantId },
        select: { date_of_birth: true },
      });
      if (!student) {
        throw new NotFoundException({ code: 'STUDENT_NOT_FOUND', message: 'Student not found' });
      }

      const retentionYears = settings.safeguarding_retention_years;
      let retentionUntil: Date;
      if (student.date_of_birth) {
        retentionUntil = new Date(student.date_of_birth);
        retentionUntil.setFullYear(retentionUntil.getFullYear() + retentionYears);
      } else {
        retentionUntil = new Date();
        retentionUntil.setFullYear(retentionUntil.getFullYear() + retentionYears);
      }

      // Create concern
      const concern = await db.safeguardingConcern.create({
        data: {
          tenant_id: tenantId,
          concern_number: concernNumber,
          student_id: dto.student_id,
          reported_by_id: userId,
          concern_type: CONCERN_TYPE_TO_PRISMA[dto.concern_type] ?? ('other_concern' as $Enums.SafeguardingConcernType),
          severity: SEVERITY_TO_PRISMA[dto.severity] ?? ('low_sev' as $Enums.SafeguardingSeverity),
          status: 'reported' as $Enums.SafeguardingStatus,
          description: dto.description,
          immediate_actions_taken: dto.immediate_actions_taken ?? null,
          designated_liaison_id: settings.designated_liaison_user_id ?? null,
          sla_first_response_due: slaDeadline,
          retention_until: retentionUntil,
        },
      });

      // Create initial action log entry
      await db.safeguardingAction.create({
        data: {
          tenant_id: tenantId,
          concern_id: concern.id,
          action_by_id: userId,
          action_type: 'status_changed' as $Enums.SafeguardingActionType,
          description: 'Concern reported',
          metadata: { from: null, to: 'reported' } as unknown as Prisma.InputJsonValue,
        },
      });

      // Link to behaviour incident if provided
      if (dto.incident_id) {
        await db.safeguardingConcernIncident.create({
          data: {
            tenant_id: tenantId,
            concern_id: concern.id,
            incident_id: dto.incident_id,
            linked_by_id: userId,
          },
        });

        // Set incident status to converted_to_safeguarding
        await db.behaviourIncident.update({
          where: { id: dto.incident_id },
          data: { status: 'converted_to_safeguarding' as $Enums.IncidentStatus },
        });
      }

      // ─── Pastoral / CP delegation (facade) ──────────────────────────
      try {
        const pastoralSeverity = BEHAVIOUR_TO_PASTORAL_SEVERITY[dto.severity] ?? 'routine';

        const concernDto: CreateConcernDto = {
          student_id: dto.student_id,
          category: 'child_protection',
          severity: pastoralSeverity as CreateConcernDto['severity'],
          narrative: dto.description,
          occurred_at: new Date().toISOString(),
          actions_taken: dto.immediate_actions_taken ?? null,
          follow_up_needed: true,
          author_masked: true,
          tier: 3,
          behaviour_incident_id: dto.incident_id ?? null,
        };

        const pastoralConcern = await this.concernService.create(
          tenantId, userId, concernDto, null,
        );

        const cpRecordDto: CreateCpRecordDto = {
          concern_id: pastoralConcern.data.id,
          student_id: dto.student_id,
          record_type: 'concern',
          narrative: dto.description,
        };

        await this.cpRecordService.create(tenantId, userId, cpRecordDto, null);

        // Store cross-reference
        await db.safeguardingConcern.update({
          where: { id: concern.id },
          data: { pastoral_concern_id: pastoralConcern.data.id },
        });
      } catch (delegationError) {
        this.logger.error(
          `Pastoral/CP delegation failed for safeguarding concern ${concern.id}: ${delegationError instanceof Error ? delegationError.message : String(delegationError)}`,
        );
        // Enqueue retry job — behaviour record is primary, don't block
        await this.behaviourQueue.add('pastoral:sync-behaviour-safeguarding', {
          tenant_id: tenantId,
          concern_id: concern.id,
          user_id: userId,
          dto_snapshot: {
            student_id: dto.student_id,
            severity: dto.severity,
            description: dto.description,
            immediate_actions_taken: dto.immediate_actions_taken ?? null,
            incident_id: dto.incident_id ?? null,
          },
        });
      }

      // Notify DLP
      if (settings.designated_liaison_user_id) {
        await this.notificationsQueue.add('safeguarding:concern-reported', {
          tenant_id: tenantId,
          concern_id: concern.id,
          concern_number: concernNumber,
          severity: dto.severity,
          sla_deadline: slaDeadline.toISOString(),
          recipient_user_id: settings.designated_liaison_user_id,
        });
      }

      // Critical escalation chain
      if (dto.severity === 'critical') {
        await this.behaviourQueue.add(SAFEGUARDING_CRITICAL_ESCALATION_JOB, {
          tenant_id: tenantId,
          concern_id: concern.id,
          escalation_step: 0,
        }, { delay: 0 });
      }

      // Audit log
      void this.auditLogService.write(
        tenantId, userId, 'safeguarding_concern', concern.id,
        'safeguarding_concern_created',
        { concern_number: concernNumber, severity: dto.severity, concern_type: dto.concern_type },
        null,
      );

      return {
        data: {
          id: concern.id,
          concern_number: concernNumber,
          status: 'reported',
        },
      };
    }) as Promise<{ data: { id: string; concern_number: string; status: string } }>;
  }

  // ─── My Reports (Reporter View) ────────────────────────────────────────

  async getMyReports(tenantId: string, userId: string, query: MyReportsQuery) {
    const [data, total] = await Promise.all([
      this.prisma.safeguardingConcern.findMany({
        where: { tenant_id: tenantId, reported_by_id: userId },
        select: {
          concern_number: true,
          concern_type: true,
          created_at: true,
          reporter_acknowledgement_status: true,
        },
        orderBy: { created_at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.safeguardingConcern.count({
        where: { tenant_id: tenantId, reported_by_id: userId },
      }),
    ]);

    return {
      data: data.map((c) => ({
        concern_number: c.concern_number,
        concern_type: PRISMA_TO_CONCERN_TYPE[c.concern_type] ?? c.concern_type,
        reported_at: c.created_at.toISOString(),
        reporter_acknowledgement_status: c.reporter_acknowledgement_status
          ? PRISMA_TO_ACK_STATUS[c.reporter_acknowledgement_status] ?? null
          : null,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── List Concerns ──────────────────────────────────────────────────────

  async listConcerns(
    tenantId: string,
    userId: string,
    membershipId: string,
    query: ListSafeguardingConcernsQuery,
  ) {
    const access = await this.checkEffectivePermission(userId, tenantId, membershipId);
    if (!access.allowed) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Safeguarding access denied' });
    }

    const where: Prisma.SafeguardingConcernWhereInput = { tenant_id: tenantId };

    if (query.status) {
      const statusValues = query.status.split(',').map((s: string) => STATUS_TO_PRISMA[s.trim()]).filter((v): v is $Enums.SafeguardingStatus => v !== undefined);
      if (statusValues.length > 0) where.status = { in: statusValues };
    }
    if (query.severity) {
      const sevValues = query.severity.split(',').map((s: string) => SEVERITY_TO_PRISMA[s.trim()]).filter((v): v is $Enums.SafeguardingSeverity => v !== undefined);
      if (sevValues.length > 0) where.severity = { in: sevValues };
    }
    if (query.type) {
      where.concern_type = CONCERN_TYPE_TO_PRISMA[query.type] ?? undefined;
    }
    if (query.from) where.created_at = { ...(where.created_at as Prisma.DateTimeFilter ?? {}), gte: new Date(query.from) };
    if (query.to) where.created_at = { ...(where.created_at as Prisma.DateTimeFilter ?? {}), lte: new Date(query.to) };
    if (query.assigned_to_id) where.assigned_to_id = query.assigned_to_id;

    // SLA status filter
    if (query.sla_status === 'overdue') {
      where.sla_first_response_met_at = null;
      where.sla_first_response_due = { lt: new Date() };
    } else if (query.sla_status === 'due_soon') {
      where.sla_first_response_met_at = null;
      where.sla_first_response_due = { gte: new Date(), lte: new Date(Date.now() + 24 * 60 * 60 * 1000) };
    } else if (query.sla_status === 'on_track') {
      where.OR = [
        { sla_first_response_met_at: { not: null } },
        { sla_first_response_due: { gt: new Date(Date.now() + 24 * 60 * 60 * 1000) } },
      ];
    }

    const [data, total, slaOverdue, slaDueSoon, slaOnTrack] = await Promise.all([
      this.prisma.safeguardingConcern.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          student: { select: { id: true, first_name: true, last_name: true } },
          reported_by: { select: { id: true, first_name: true, last_name: true } },
          assigned_to: { select: { id: true, first_name: true, last_name: true } },
        },
      }),
      this.prisma.safeguardingConcern.count({ where }),
      this.prisma.safeguardingConcern.count({
        where: {
          tenant_id: tenantId,
          sla_first_response_met_at: null,
          sla_first_response_due: { lt: new Date() },
          status: { notIn: ['sg_resolved' as $Enums.SafeguardingStatus, 'sealed' as $Enums.SafeguardingStatus] },
        },
      }),
      this.prisma.safeguardingConcern.count({
        where: {
          tenant_id: tenantId,
          sla_first_response_met_at: null,
          sla_first_response_due: { gte: new Date(), lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
          status: { notIn: ['sg_resolved' as $Enums.SafeguardingStatus, 'sealed' as $Enums.SafeguardingStatus] },
        },
      }),
      this.prisma.safeguardingConcern.count({
        where: {
          tenant_id: tenantId,
          OR: [
            { sla_first_response_met_at: { not: null } },
            { sla_first_response_due: { gt: new Date(Date.now() + 24 * 60 * 60 * 1000) } },
          ],
          status: { notIn: ['sg_resolved' as $Enums.SafeguardingStatus, 'sealed' as $Enums.SafeguardingStatus] },
        },
      }),
    ]);

    // Audit log every list access
    void this.auditLogService.write(
      tenantId, userId, 'safeguarding_concern', null,
      'safeguarding_concerns_listed',
      { context: access.context, break_glass_grant_id: access.grantId ?? null },
      null,
    );

    return {
      data: data.map((c) => this.mapConcernSummary(c)),
      meta: { page: query.page, pageSize: query.pageSize, total },
      sla_summary: {
        overdue: slaOverdue,
        due_within_24h: slaDueSoon,
        on_track: slaOnTrack,
      },
    };
  }

  // ─── Concern Detail ─────────────────────────────────────────────────────

  async getConcernDetail(
    tenantId: string,
    userId: string,
    membershipId: string,
    concernId: string,
  ) {
    const access = await this.checkEffectivePermission(userId, tenantId, membershipId, concernId);
    if (!access.allowed) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Safeguarding access denied' });
    }

    const concern = await this.prisma.safeguardingConcern.findFirst({
      where: { id: concernId, tenant_id: tenantId },
      include: {
        student: { select: { id: true, first_name: true, last_name: true, date_of_birth: true } },
        reported_by: { select: { id: true, first_name: true, last_name: true } },
        designated_liaison: { select: { id: true, first_name: true, last_name: true } },
        assigned_to: { select: { id: true, first_name: true, last_name: true } },
        sealed_by: { select: { id: true, first_name: true, last_name: true } },
        seal_approved_by: { select: { id: true, first_name: true, last_name: true } },
        _count: { select: { actions: true, concern_incidents: true } },
      },
    });

    if (!concern) {
      throw new NotFoundException({ code: 'CONCERN_NOT_FOUND', message: 'Safeguarding concern not found' });
    }

    // Audit every single view
    void this.auditLogService.write(
      tenantId, userId, 'safeguarding_concern', concernId,
      'safeguarding_concern_viewed',
      {
        context: access.context,
        break_glass_grant_id: access.grantId ?? null,
      },
      null,
    );

    return { data: this.mapConcernDetail(concern) };
  }

  // ─── Update Concern ─────────────────────────────────────────────────────

  async updateConcern(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: UpdateSafeguardingConcernDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const concern = await db.safeguardingConcern.findFirst({
        where: { id: concernId, tenant_id: tenantId },
      });
      if (!concern) {
        throw new NotFoundException({ code: 'CONCERN_NOT_FOUND', message: 'Safeguarding concern not found' });
      }
      if (concern.status === ('sealed' as $Enums.SafeguardingStatus)) {
        throw new ForbiddenException({ code: 'CONCERN_SEALED', message: 'Concern is sealed and cannot be modified' });
      }

      const updateData: Prisma.SafeguardingConcernUpdateInput = {};
      if (dto.description !== undefined) updateData.description = dto.description;
      if (dto.concern_type !== undefined) updateData.concern_type = CONCERN_TYPE_TO_PRISMA[dto.concern_type];
      if (dto.severity !== undefined) updateData.severity = SEVERITY_TO_PRISMA[dto.severity];
      if (dto.immediate_actions_taken !== undefined) updateData.immediate_actions_taken = dto.immediate_actions_taken;

      const updated = await db.safeguardingConcern.update({
        where: { id: concernId },
        data: updateData,
      });

      // Record action
      await db.safeguardingAction.create({
        data: {
          tenant_id: tenantId,
          concern_id: concernId,
          action_by_id: userId,
          action_type: 'note_added' as $Enums.SafeguardingActionType,
          description: 'Concern details updated',
          metadata: { fields_updated: Object.keys(dto).filter((k) => dto[k as keyof typeof dto] !== undefined) } as unknown as Prisma.InputJsonValue,
        },
      });

      void this.auditLogService.write(
        tenantId, userId, 'safeguarding_concern', concernId,
        'safeguarding_concern_updated', { fields: Object.keys(dto) }, null,
      );

      // ─── Propagate description change to pastoral concern version ───
      if (dto.description !== undefined && concern.pastoral_concern_id) {
        try {
          await this.concernVersionService.amendNarrative(
            tenantId, userId, concern.pastoral_concern_id,
            { new_narrative: dto.description, amendment_reason: 'Updated via behaviour safeguarding' },
            null,
          );
        } catch (propError) {
          this.logger.error(
            `Pastoral description propagation failed for concern ${concernId}: ${propError instanceof Error ? propError.message : String(propError)}`,
          );
        }
      }

      return { data: { id: updated.id, status: PRISMA_TO_STATUS[updated.status] ?? updated.status } };
    }) as Promise<{ data: { id: string; status: string } }>;
  }

  // ─── Status Transition ──────────────────────────────────────────────────

  async transitionStatus(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: SafeguardingStatusTransitionDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const concern = await db.safeguardingConcern.findFirst({
        where: { id: concernId, tenant_id: tenantId },
      });
      if (!concern) {
        throw new NotFoundException({ code: 'CONCERN_NOT_FOUND', message: 'Safeguarding concern not found' });
      }
      if (concern.status === ('sealed' as $Enums.SafeguardingStatus)) {
        throw new ForbiddenException({ code: 'CONCERN_SEALED', message: 'Concern is sealed and cannot be modified' });
      }

      const fromStatus = PRISMA_TO_STATUS[concern.status] ?? concern.status;
      const toStatus = dto.status;

      if (!isValidSafeguardingTransition(fromStatus as Parameters<typeof isValidSafeguardingTransition>[0], toStatus as Parameters<typeof isValidSafeguardingTransition>[1])) {
        throw new BadRequestException({
          code: 'INVALID_TRANSITION',
          message: `Cannot transition from ${fromStatus} to ${toStatus}`,
        });
      }

      // Don't allow sealed via status transition — use seal/initiate + seal/approve
      if (toStatus === 'sealed') {
        throw new BadRequestException({
          code: 'SEAL_VIA_DEDICATED_ENDPOINT',
          message: 'Use the seal/initiate and seal/approve endpoints for dual-control sealing',
        });
      }

      const updateData: Prisma.SafeguardingConcernUpdateInput = {
        status: STATUS_TO_PRISMA[toStatus],
      };

      // Side effects per status
      if (toStatus === 'acknowledged') {
        updateData.sla_first_response_met_at = new Date();
        updateData.reporter_acknowledgement_status = ACK_STATUS_TO_PRISMA['assigned'];

        // Send reporter acknowledgement notification
        await this.notificationsQueue.add('safeguarding:reporter-ack', {
          tenant_id: tenantId,
          concern_id: concernId,
          concern_number: concern.concern_number,
          recipient_user_id: concern.reported_by_id,
        });
      }

      if (toStatus === 'under_investigation') {
        updateData.reporter_acknowledgement_status = ACK_STATUS_TO_PRISMA['under_review'];
      }

      if (toStatus === 'resolved') {
        updateData.resolved_at = new Date();
      }

      const updated = await db.safeguardingConcern.update({
        where: { id: concernId },
        data: updateData,
      });

      // Record action
      await db.safeguardingAction.create({
        data: {
          tenant_id: tenantId,
          concern_id: concernId,
          action_by_id: userId,
          action_type: 'status_changed' as $Enums.SafeguardingActionType,
          description: dto.reason,
          metadata: { from: fromStatus, to: toStatus } as unknown as Prisma.InputJsonValue,
        },
      });

      void this.auditLogService.write(
        tenantId, userId, 'safeguarding_concern', concernId,
        'safeguarding_concern_status_changed',
        { from: fromStatus, to: toStatus },
        null,
      );

      // ─── Propagate status change to pastoral concern ────────────────
      if (concern.pastoral_concern_id) {
        const pastoralStatus = BEHAVIOUR_TO_PASTORAL_STATUS[toStatus];
        if (pastoralStatus) {
          try {
            void this.pastoralEventService.write({
              tenant_id: tenantId,
              event_type: 'concern_status_changed',
              entity_type: 'concern',
              entity_id: concern.pastoral_concern_id,
              student_id: concern.student_id,
              actor_user_id: userId,
              tier: 3,
              payload: {
                concern_id: concern.pastoral_concern_id,
                old_status: BEHAVIOUR_TO_PASTORAL_STATUS[fromStatus] ?? fromStatus,
                new_status: pastoralStatus,
                source: 'behaviour_safeguarding',
              },
              ip_address: null,
            });
          } catch (propError) {
            this.logger.error(
              `Pastoral status propagation failed for concern ${concernId}: ${propError instanceof Error ? propError.message : String(propError)}`,
            );
          }
        }
      }

      return { data: { id: updated.id, status: PRISMA_TO_STATUS[updated.status] ?? updated.status } };
    }) as Promise<{ data: { id: string; status: string } }>;
  }

  // ─── Assign Concern ─────────────────────────────────────────────────────

  async assignConcern(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: AssignSafeguardingConcernDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const concern = await db.safeguardingConcern.findFirst({
        where: { id: concernId, tenant_id: tenantId },
      });
      if (!concern) {
        throw new NotFoundException({ code: 'CONCERN_NOT_FOUND', message: 'Safeguarding concern not found' });
      }
      if (concern.status === ('sealed' as $Enums.SafeguardingStatus)) {
        throw new ForbiddenException({ code: 'CONCERN_SEALED', message: 'Concern is sealed and cannot be modified' });
      }

      const updateData: Prisma.SafeguardingConcernUncheckedUpdateInput = {};
      if (dto.designated_liaison_id !== undefined) updateData.designated_liaison_id = dto.designated_liaison_id;
      if (dto.assigned_to_id !== undefined) updateData.assigned_to_id = dto.assigned_to_id;

      const updated = await db.safeguardingConcern.update({
        where: { id: concernId },
        data: updateData,
      });

      await db.safeguardingAction.create({
        data: {
          tenant_id: tenantId,
          concern_id: concernId,
          action_by_id: userId,
          action_type: 'assigned' as $Enums.SafeguardingActionType,
          description: `Concern assigned`,
          metadata: {
            designated_liaison_id: dto.designated_liaison_id ?? null,
            assigned_to_id: dto.assigned_to_id ?? null,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return { data: { id: updated.id } };
    }) as Promise<{ data: { id: string } }>;
  }

  // ─── Record Action ──────────────────────────────────────────────────────

  async recordAction(
    tenantId: string,
    userId: string,
    concernId: string,
    dto: RecordSafeguardingActionDto,
  ) {
    const concern = await this.prisma.safeguardingConcern.findFirst({
      where: { id: concernId, tenant_id: tenantId },
    });
    if (!concern) {
      throw new NotFoundException({ code: 'CONCERN_NOT_FOUND', message: 'Safeguarding concern not found' });
    }
    if (concern.status === ('sealed' as $Enums.SafeguardingStatus)) {
      throw new ForbiddenException({ code: 'CONCERN_SEALED', message: 'Concern is sealed and cannot be modified' });
    }

    const action = await this.prisma.safeguardingAction.create({
      data: {
        tenant_id: tenantId,
        concern_id: concernId,
        action_by_id: userId,
        action_type: ACTION_TYPE_TO_PRISMA[dto.action_type] ?? ('note_added' as $Enums.SafeguardingActionType),
        description: dto.description,
        due_date: dto.due_date ? new Date(dto.due_date) : null,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    return { data: { id: action.id } };
  }

  // ─── Get Actions ────────────────────────────────────────────────────────

  async getActions(
    tenantId: string,
    userId: string,
    membershipId: string,
    concernId: string,
    query: ListSafeguardingActionsQuery,
  ) {
    const access = await this.checkEffectivePermission(userId, tenantId, membershipId, concernId);
    if (!access.allowed) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Safeguarding access denied' });
    }

    const [data, total] = await Promise.all([
      this.prisma.safeguardingAction.findMany({
        where: { tenant_id: tenantId, concern_id: concernId },
        orderBy: { created_at: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          action_by: { select: { id: true, first_name: true, last_name: true } },
        },
      }),
      this.prisma.safeguardingAction.count({
        where: { tenant_id: tenantId, concern_id: concernId },
      }),
    ]);

    void this.auditLogService.write(
      tenantId, userId, 'safeguarding_concern', concernId,
      'safeguarding_actions_viewed',
      { context: access.context, break_glass_grant_id: access.grantId ?? null },
      null,
    );

    return {
      data: data.map((a) => ({
        id: a.id,
        action_type: PRISMA_TO_ACTION_TYPE[a.action_type] ?? a.action_type,
        description: a.description,
        metadata: a.metadata,
        due_date: a.due_date?.toISOString() ?? null,
        is_overdue: a.is_overdue,
        created_at: a.created_at.toISOString(),
        action_by: a.action_by
          ? { id: a.action_by.id, name: `${a.action_by.first_name} ${a.action_by.last_name}` }
          : null,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Referrals ──────────────────────────────────────────────────────────

  async recordTuslaReferral(
    tenantId: string, userId: string, concernId: string, dto: TuslaReferralDto,
  ) {
    return this.recordReferral(tenantId, userId, concernId, 'tusla', dto);
  }

  async recordGardaReferral(
    tenantId: string, userId: string, concernId: string, dto: GardaReferralDto,
  ) {
    return this.recordReferral(tenantId, userId, concernId, 'garda', dto);
  }

  private async recordReferral(
    tenantId: string,
    userId: string,
    concernId: string,
    type: 'tusla' | 'garda',
    dto: { reference_number: string; referred_at: string },
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const concern = await db.safeguardingConcern.findFirst({
        where: { id: concernId, tenant_id: tenantId },
      });
      if (!concern) {
        throw new NotFoundException({ code: 'CONCERN_NOT_FOUND', message: 'Safeguarding concern not found' });
      }
      if (concern.status === ('sealed' as $Enums.SafeguardingStatus)) {
        throw new ForbiddenException({ code: 'CONCERN_SEALED', message: 'Concern is sealed and cannot be modified' });
      }

      const updateData: Prisma.SafeguardingConcernUpdateInput = type === 'tusla'
        ? {
          is_tusla_referral: true,
          tusla_reference_number: dto.reference_number,
          tusla_referred_at: new Date(dto.referred_at),
        }
        : {
          is_garda_referral: true,
          garda_reference_number: dto.reference_number,
          garda_referred_at: new Date(dto.referred_at),
        };

      await db.safeguardingConcern.update({
        where: { id: concernId },
        data: updateData,
      });

      const actionType = type === 'tusla' ? 'tusla_referred' : 'garda_referred';
      await db.safeguardingAction.create({
        data: {
          tenant_id: tenantId,
          concern_id: concernId,
          action_by_id: userId,
          action_type: actionType as $Enums.SafeguardingActionType,
          description: `${type === 'tusla' ? 'Tusla' : 'Garda'} referral recorded: ${dto.reference_number}`,
          metadata: { reference_number: dto.reference_number, referred_at: dto.referred_at } as unknown as Prisma.InputJsonValue,
        },
      });

      return { data: { success: true } };
    }) as Promise<{ data: { success: boolean } }>;
  }

  // ─── Seal ───────────────────────────────────────────────────────────────

  async initiateSeal(
    tenantId: string, userId: string, concernId: string, dto: InitiateSealDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const concern = await db.safeguardingConcern.findFirst({
        where: { id: concernId, tenant_id: tenantId },
      });
      if (!concern) {
        throw new NotFoundException({ code: 'CONCERN_NOT_FOUND', message: 'Safeguarding concern not found' });
      }

      const status = PRISMA_TO_STATUS[concern.status] ?? concern.status;
      if (status !== 'resolved') {
        throw new BadRequestException({
          code: 'SEAL_REQUIRES_RESOLVED',
          message: 'Concern must be resolved before sealing',
        });
      }

      if (concern.sealed_by_id) {
        throw new BadRequestException({
          code: 'SEAL_ALREADY_INITIATED',
          message: 'Seal has already been initiated',
        });
      }

      await db.safeguardingConcern.update({
        where: { id: concernId },
        data: {
          sealed_by_id: userId,
          sealed_reason: dto.reason,
        },
      });

      // Create task for second seal holder (assigned to initiator — they route it to the second seal holder)
      await db.behaviourTask.create({
        data: {
          tenant_id: tenantId,
          task_type: 'safeguarding_action' as $Enums.BehaviourTaskType,
          entity_type: 'safeguarding_concern' as $Enums.BehaviourTaskEntityType,
          entity_id: concernId,
          title: `Seal approval required: ${concern.concern_number}`,
          description: `A request to seal safeguarding concern ${concern.concern_number} requires dual-control approval from a second safeguarding.seal holder.`,
          priority: 'high' as $Enums.TaskPriority,
          status: 'pending' as $Enums.BehaviourTaskStatus,
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          assigned_to_id: userId,
          created_by_id: userId,
        },
      });

      await db.safeguardingAction.create({
        data: {
          tenant_id: tenantId,
          concern_id: concernId,
          action_by_id: userId,
          action_type: 'status_changed' as $Enums.SafeguardingActionType,
          description: `Seal initiated: ${dto.reason}`,
          metadata: { action: 'seal_initiated', initiated_by: userId } as unknown as Prisma.InputJsonValue,
        },
      });

      return { data: { id: concernId, seal_initiated: true } };
    }) as Promise<{ data: { id: string; seal_initiated: boolean } }>;
  }

  async approveSeal(tenantId: string, userId: string, concernId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const concern = await db.safeguardingConcern.findFirst({
        where: { id: concernId, tenant_id: tenantId },
      });
      if (!concern) {
        throw new NotFoundException({ code: 'CONCERN_NOT_FOUND', message: 'Safeguarding concern not found' });
      }

      if (!concern.sealed_by_id) {
        throw new BadRequestException({
          code: 'SEAL_NOT_INITIATED',
          message: 'Seal has not been initiated',
        });
      }

      if (concern.sealed_by_id === userId) {
        throw new BadRequestException({
          code: 'DUAL_CONTROL_VIOLATION',
          message: 'Seal approval requires a different user than the initiator',
        });
      }

      const status = PRISMA_TO_STATUS[concern.status] ?? concern.status;
      if (status !== 'resolved') {
        throw new BadRequestException({
          code: 'SEAL_REQUIRES_RESOLVED',
          message: 'Concern must be in resolved status to approve seal',
        });
      }

      await db.safeguardingConcern.update({
        where: { id: concernId },
        data: {
          status: 'sealed' as $Enums.SafeguardingStatus,
          sealed_at: new Date(),
          seal_approved_by_id: userId,
        },
      });

      await db.safeguardingAction.create({
        data: {
          tenant_id: tenantId,
          concern_id: concernId,
          action_by_id: userId,
          action_type: 'status_changed' as $Enums.SafeguardingActionType,
          description: 'Concern sealed (dual-control approved)',
          metadata: {
            from: 'resolved',
            to: 'sealed',
            initiated_by: concern.sealed_by_id,
            approved_by: userId,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      // Complete the seal approval task
      await db.behaviourTask.updateMany({
        where: {
          tenant_id: tenantId,
          entity_type: 'safeguarding_concern' as $Enums.BehaviourTaskEntityType,
          entity_id: concernId,
          title: { contains: 'Seal approval required' },
          status: { in: ['pending' as $Enums.BehaviourTaskStatus, 'in_progress' as $Enums.BehaviourTaskStatus] },
        },
        data: { status: 'completed' as $Enums.BehaviourTaskStatus, completed_at: new Date() },
      });

      void this.auditLogService.write(
        tenantId, userId, 'safeguarding_concern', concernId,
        'safeguarding_concern_sealed',
        { initiated_by: concern.sealed_by_id, approved_by: userId },
        null,
      );

      return { data: { id: concernId, sealed: true } };
    }) as Promise<{ data: { id: string; sealed: boolean } }>;
  }

  // ─── Dashboard ──────────────────────────────────────────────────────────

  async getDashboard(tenantId: string) {
    const openStatuses = [
      'reported', 'acknowledged', 'under_investigation', 'referred', 'sg_monitoring',
    ] as $Enums.SafeguardingStatus[];

    const [
      bySeverity, byStatus, slaOverdue, slaDueSoon, slaOnTrack,
      overdueTasks, recentActions,
    ] = await Promise.all([
      // Open by severity
      this.prisma.safeguardingConcern.groupBy({
        by: ['severity'],
        where: { tenant_id: tenantId, status: { in: openStatuses } },
        _count: true,
      }),
      // By status
      this.prisma.safeguardingConcern.groupBy({
        by: ['status'],
        where: { tenant_id: tenantId, status: { in: openStatuses } },
        _count: true,
      }),
      // SLA overdue
      this.prisma.safeguardingConcern.count({
        where: {
          tenant_id: tenantId,
          sla_first_response_met_at: null,
          sla_first_response_due: { lt: new Date() },
          status: { in: openStatuses },
        },
      }),
      // SLA due within 24h
      this.prisma.safeguardingConcern.count({
        where: {
          tenant_id: tenantId,
          sla_first_response_met_at: null,
          sla_first_response_due: { gte: new Date(), lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
          status: { in: openStatuses },
        },
      }),
      // SLA on track
      this.prisma.safeguardingConcern.count({
        where: {
          tenant_id: tenantId,
          status: { in: openStatuses },
          OR: [
            { sla_first_response_met_at: { not: null } },
            { sla_first_response_due: { gt: new Date(Date.now() + 24 * 60 * 60 * 1000) } },
          ],
        },
      }),
      // Overdue tasks
      this.prisma.behaviourTask.findMany({
        where: {
          tenant_id: tenantId,
          entity_type: { in: ['safeguarding_concern', 'break_glass_grant'] as $Enums.BehaviourTaskEntityType[] },
          status: { in: ['pending', 'in_progress', 'overdue'] as $Enums.BehaviourTaskStatus[] },
          due_date: { lt: new Date() },
        },
        take: 10,
        orderBy: { due_date: 'asc' },
      }),
      // Recent actions
      this.prisma.safeguardingAction.findMany({
        where: { tenant_id: tenantId },
        orderBy: { created_at: 'desc' },
        take: 10,
        include: {
          action_by: { select: { id: true, first_name: true, last_name: true } },
          concern: { select: { concern_number: true } },
        },
      }),
    ]);

    const severityMap: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const row of bySeverity) {
      const key = PRISMA_TO_SEVERITY[row.severity] ?? row.severity;
      severityMap[key] = row._count;
    }

    const statusMap: Record<string, number> = {
      reported: 0, acknowledged: 0, under_investigation: 0, referred: 0, monitoring: 0,
    };
    for (const row of byStatus) {
      const key = PRISMA_TO_STATUS[row.status] ?? row.status;
      statusMap[key] = row._count;
    }

    const totalOpen = slaOverdue + slaDueSoon + slaOnTrack;
    const complianceRate = totalOpen > 0 ? Math.round(((slaOnTrack + slaDueSoon) / totalOpen) * 100) : 100;

    return {
      data: {
        open_by_severity: severityMap,
        sla_compliance: {
          overdue: slaOverdue,
          due_within_24h: slaDueSoon,
          on_track: slaOnTrack,
          compliance_rate: complianceRate,
        },
        by_status: statusMap,
        overdue_tasks: overdueTasks.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          due_date: t.due_date?.toISOString() ?? null,
          entity_type: t.entity_type,
          entity_id: t.entity_id,
        })),
        recent_actions: recentActions.map((a) => ({
          id: a.id,
          concern_number: a.concern?.concern_number ?? null,
          action_type: PRISMA_TO_ACTION_TYPE[a.action_type] ?? a.action_type,
          description: a.description,
          created_at: a.created_at.toISOString(),
          action_by: a.action_by
            ? { id: a.action_by.id, name: `${a.action_by.first_name} ${a.action_by.last_name}` }
            : null,
        })),
      },
    };
  }

  // ─── Case File PDF Generation ─────────────────────────────────────────

  async generateCaseFile(
    tenantId: string,
    concernId: string,
    redacted: boolean,
  ): Promise<Buffer> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const data = (await rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        // 1. Load the concern with all related data
        const concern = await db.safeguardingConcern.findFirst({
          where: { id: concernId, tenant_id: tenantId },
          include: {
            student: {
              select: { id: true, first_name: true, last_name: true, date_of_birth: true },
            },
            reported_by: {
              select: { id: true, first_name: true, last_name: true },
            },
            designated_liaison: {
              select: { id: true, first_name: true, last_name: true },
            },
            assigned_to: {
              select: { id: true, first_name: true, last_name: true },
            },
            sealed_by: {
              select: { id: true, first_name: true, last_name: true },
            },
            seal_approved_by: {
              select: { id: true, first_name: true, last_name: true },
            },
            actions: {
              orderBy: { created_at: 'asc' },
              include: {
                action_by: {
                  select: { id: true, first_name: true, last_name: true },
                },
              },
            },
            concern_incidents: {
              include: {
                incident: {
                  select: {
                    id: true,
                    occurred_at: true,
                    parent_description: true,
                    location: true,
                    polarity: true,
                    status: true,
                    category: { select: { name: true } },
                  },
                },
              },
            },
          },
        });

        if (!concern) {
          throw new NotFoundException({
            code: 'CONCERN_NOT_FOUND',
            message: 'Safeguarding concern not found',
          });
        }

        // 2. Load school name for branding
        const tenantSettings = await db.tenantSetting.findFirst({
          where: { tenant_id: tenantId },
          select: { settings: true },
        });
        const settings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
        const schoolName = (settings.school_name as string) ?? 'School';

        return { concern, schoolName };
      },
      { timeout: 30000 },
    )) as {
      concern: {
        id: string;
        concern_number: string;
        concern_type: $Enums.SafeguardingConcernType;
        severity: $Enums.SafeguardingSeverity;
        status: $Enums.SafeguardingStatus;
        description: string;
        immediate_actions_taken: string | null;
        is_tusla_referral: boolean;
        tusla_reference_number: string | null;
        tusla_referred_at: Date | null;
        tusla_outcome: string | null;
        is_garda_referral: boolean;
        garda_reference_number: string | null;
        garda_referred_at: Date | null;
        resolution_notes: string | null;
        resolved_at: Date | null;
        sealed_at: Date | null;
        sealed_reason: string | null;
        retention_until: Date | null;
        created_at: Date;
        updated_at: Date;
        student: { id: string; first_name: string; last_name: string; date_of_birth: Date | null } | null;
        reported_by: { id: string; first_name: string; last_name: string };
        designated_liaison: { id: string; first_name: string; last_name: string } | null;
        assigned_to: { id: string; first_name: string; last_name: string } | null;
        sealed_by: { id: string; first_name: string; last_name: string } | null;
        seal_approved_by: { id: string; first_name: string; last_name: string } | null;
        actions: Array<{
          id: string;
          action_type: $Enums.SafeguardingActionType;
          description: string;
          created_at: Date;
          action_by: { id: string; first_name: string; last_name: string };
        }>;
        concern_incidents: Array<{
          incident: {
            id: string;
            occurred_at: Date;
            parent_description: string | null;
            location: string | null;
            polarity: string;
            status: string;
            category: { name: string } | null;
          };
        }>;
      };
      schoolName: string;
    };

    // Build HTML and render outside transaction
    const html = buildCaseFileHtml(data.concern, data.schoolName, redacted);
    const pdfBuffer = await this.pdfRenderingService.renderFromHtml(html);

    this.logger.log(
      `Generated ${redacted ? 'redacted ' : ''}case file PDF for concern ${concernId} (${data.concern.actions.length} actions, ${data.concern.concern_incidents.length} linked incidents)`,
    );

    return pdfBuffer;
  }

  // ─── Permission Check with Break-Glass ──────────────────────────────────

  async checkEffectivePermission(
    userId: string,
    tenantId: string,
    membershipId: string,
    concernId?: string,
  ): Promise<{ allowed: boolean; context: 'normal' | 'break_glass'; grantId?: string }> {
    // Check normal permission
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: membershipId, user_id: userId, tenant_id: tenantId },
      include: {
        membership_roles: {
          include: {
            role: {
              include: {
                role_permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (membership) {
      const permissions = new Set<string>();
      for (const mr of membership.membership_roles) {
        for (const rp of mr.role.role_permissions) {
          permissions.add(rp.permission.permission_key);
        }
      }
      if (permissions.has('safeguarding.view')) {
        return { allowed: true, context: 'normal' };
      }
    }

    // Check break-glass grant
    const grantWhere: Prisma.SafeguardingBreakGlassGrantWhereInput = {
      tenant_id: tenantId,
      granted_to_id: userId,
      revoked_at: null,
      expires_at: { gt: new Date() },
    };

    if (concernId) {
      grantWhere.OR = [
        { scope: 'all_concerns' as $Enums.BreakGlassScope },
        {
          scope: 'specific_concerns' as $Enums.BreakGlassScope,
          scoped_concern_ids: { has: concernId },
        },
      ];
    } else {
      // For list operations, any active grant gives access
    }

    const grant = await this.prisma.safeguardingBreakGlassGrant.findFirst({
      where: grantWhere,
    });

    if (grant) {
      return { allowed: true, context: 'break_glass', grantId: grant.id };
    }

    return { allowed: false, context: 'normal' };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private async loadBehaviourSettings(
    db: PrismaService,
    tenantId: string,
  ): Promise<BehaviourSettings> {
    const tenantSetting = await db.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });
    const raw = (tenantSetting?.settings ?? {}) as Record<string, unknown>;
    const behaviour = (raw.behaviour ?? {}) as Record<string, unknown>;
    return behaviourSettingsSchema.parse(behaviour);
  }

  private mapConcernSummary(concern: {
    id: string;
    concern_number: string;
    concern_type: $Enums.SafeguardingConcernType;
    severity: $Enums.SafeguardingSeverity;
    status: $Enums.SafeguardingStatus;
    sla_first_response_due: Date | null;
    sla_first_response_met_at: Date | null;
    created_at: Date;
    student?: { id: string; first_name: string; last_name: string } | null;
    reported_by?: { id: string; first_name: string; last_name: string } | null;
    assigned_to?: { id: string; first_name: string; last_name: string } | null;
  }) {
    return {
      id: concern.id,
      concern_number: concern.concern_number,
      concern_type: PRISMA_TO_CONCERN_TYPE[concern.concern_type] ?? concern.concern_type,
      severity: PRISMA_TO_SEVERITY[concern.severity] ?? concern.severity,
      status: PRISMA_TO_STATUS[concern.status] ?? concern.status,
      sla_first_response_due: concern.sla_first_response_due?.toISOString() ?? null,
      sla_first_response_met_at: concern.sla_first_response_met_at?.toISOString() ?? null,
      sla_breached: concern.sla_first_response_met_at === null
        && concern.sla_first_response_due !== null
        && concern.sla_first_response_due < new Date(),
      created_at: concern.created_at.toISOString(),
      student: concern.student
        ? { id: concern.student.id, name: `${concern.student.first_name} ${concern.student.last_name}` }
        : null,
      reported_by: concern.reported_by
        ? { id: concern.reported_by.id, name: `${concern.reported_by.first_name} ${concern.reported_by.last_name}` }
        : null,
      assigned_to: concern.assigned_to
        ? { id: concern.assigned_to.id, name: `${concern.assigned_to.first_name} ${concern.assigned_to.last_name}` }
        : null,
    };
  }

  private mapConcernDetail(concern: {
    id: string;
    concern_number: string;
    concern_type: $Enums.SafeguardingConcernType;
    severity: $Enums.SafeguardingSeverity;
    status: $Enums.SafeguardingStatus;
    description: string;
    immediate_actions_taken: string | null;
    is_tusla_referral: boolean;
    tusla_reference_number: string | null;
    tusla_referred_at: Date | null;
    tusla_outcome: string | null;
    is_garda_referral: boolean;
    garda_reference_number: string | null;
    garda_referred_at: Date | null;
    resolution_notes: string | null;
    resolved_at: Date | null;
    reporter_acknowledgement_status: $Enums.ReporterAckStatus | null;
    sla_first_response_due: Date | null;
    sla_first_response_met_at: Date | null;
    sealed_at: Date | null;
    sealed_reason: string | null;
    retention_until: Date | null;
    created_at: Date;
    updated_at: Date;
    student?: { id: string; first_name: string; last_name: string; date_of_birth: Date | null } | null;
    reported_by?: { id: string; first_name: string; last_name: string } | null;
    designated_liaison?: { id: string; first_name: string; last_name: string } | null;
    assigned_to?: { id: string; first_name: string; last_name: string } | null;
    sealed_by?: { id: string; first_name: string; last_name: string } | null;
    seal_approved_by?: { id: string; first_name: string; last_name: string } | null;
    _count?: { actions: number; concern_incidents: number };
  }) {
    return {
      id: concern.id,
      concern_number: concern.concern_number,
      concern_type: PRISMA_TO_CONCERN_TYPE[concern.concern_type] ?? concern.concern_type,
      severity: PRISMA_TO_SEVERITY[concern.severity] ?? concern.severity,
      status: PRISMA_TO_STATUS[concern.status] ?? concern.status,
      description: concern.description,
      immediate_actions_taken: concern.immediate_actions_taken,
      is_tusla_referral: concern.is_tusla_referral,
      tusla_reference_number: concern.tusla_reference_number,
      tusla_referred_at: concern.tusla_referred_at?.toISOString() ?? null,
      tusla_outcome: concern.tusla_outcome,
      is_garda_referral: concern.is_garda_referral,
      garda_reference_number: concern.garda_reference_number,
      garda_referred_at: concern.garda_referred_at?.toISOString() ?? null,
      resolution_notes: concern.resolution_notes,
      resolved_at: concern.resolved_at?.toISOString() ?? null,
      sla_first_response_due: concern.sla_first_response_due?.toISOString() ?? null,
      sla_first_response_met_at: concern.sla_first_response_met_at?.toISOString() ?? null,
      sla_breached: concern.sla_first_response_met_at === null
        && concern.sla_first_response_due !== null
        && concern.sla_first_response_due < new Date(),
      sealed_at: concern.sealed_at?.toISOString() ?? null,
      sealed_reason: concern.sealed_reason,
      retention_until: concern.retention_until?.toISOString() ?? null,
      created_at: concern.created_at.toISOString(),
      updated_at: concern.updated_at.toISOString(),
      student: concern.student ? {
        id: concern.student.id,
        name: `${concern.student.first_name} ${concern.student.last_name}`,
        date_of_birth: concern.student.date_of_birth?.toISOString() ?? null,
      } : null,
      reported_by: concern.reported_by
        ? { id: concern.reported_by.id, name: `${concern.reported_by.first_name} ${concern.reported_by.last_name}` }
        : null,
      designated_liaison: concern.designated_liaison
        ? { id: concern.designated_liaison.id, name: `${concern.designated_liaison.first_name} ${concern.designated_liaison.last_name}` }
        : null,
      assigned_to: concern.assigned_to
        ? { id: concern.assigned_to.id, name: `${concern.assigned_to.first_name} ${concern.assigned_to.last_name}` }
        : null,
      sealed_by: concern.sealed_by
        ? { id: concern.sealed_by.id, name: `${concern.sealed_by.first_name} ${concern.sealed_by.last_name}` }
        : null,
      seal_approved_by: concern.seal_approved_by
        ? { id: concern.seal_approved_by.id, name: `${concern.seal_approved_by.first_name} ${concern.seal_approved_by.last_name}` }
        : null,
      actions_count: concern._count?.actions ?? 0,
      linked_incidents_count: concern._count?.concern_incidents ?? 0,
    };
  }
}

// ─── Case File HTML Builder ──────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPersonName(
  person: { first_name: string; last_name: string } | null | undefined,
  redacted: boolean,
  label: string,
): string {
  if (!person) return 'N/A';
  if (redacted) return label;
  return `${person.first_name} ${person.last_name}`;
}

interface CaseFileConcern {
  id: string;
  concern_number: string;
  concern_type: string;
  severity: string;
  status: string;
  description: string;
  immediate_actions_taken: string | null;
  is_tusla_referral: boolean;
  tusla_reference_number: string | null;
  tusla_referred_at: Date | null;
  tusla_outcome: string | null;
  is_garda_referral: boolean;
  garda_reference_number: string | null;
  garda_referred_at: Date | null;
  resolution_notes: string | null;
  resolved_at: Date | null;
  sealed_at: Date | null;
  sealed_reason: string | null;
  retention_until: Date | null;
  created_at: Date;
  updated_at: Date;
  student: { id: string; first_name: string; last_name: string; date_of_birth: Date | null } | null;
  reported_by: { id: string; first_name: string; last_name: string };
  designated_liaison: { id: string; first_name: string; last_name: string } | null;
  assigned_to: { id: string; first_name: string; last_name: string } | null;
  sealed_by: { id: string; first_name: string; last_name: string } | null;
  seal_approved_by: { id: string; first_name: string; last_name: string } | null;
  actions: Array<{
    id: string;
    action_type: string;
    description: string;
    created_at: Date;
    action_by: { id: string; first_name: string; last_name: string };
  }>;
  concern_incidents: Array<{
    incident: {
      id: string;
      occurred_at: Date;
      parent_description: string | null;
      location: string | null;
      polarity: string;
      status: string;
      category: { name: string } | null;
    };
  }>;
}

function buildCaseFileHtml(
  concern: CaseFileConcern,
  schoolName: string,
  redacted: boolean,
): string {
  const dateOpts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };
  const dateTimeOpts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  const watermarkText = redacted
    ? 'REDACTED \\2014 SAFEGUARDING'
    : 'STRICTLY CONFIDENTIAL \\2014 SAFEGUARDING';

  const subtitleText = redacted
    ? 'REDACTED SAFEGUARDING CASE FILE'
    : 'SAFEGUARDING CASE FILE';

  // Build student name tracking for redaction
  const studentName = redacted
    ? 'Student A'
    : concern.student
      ? `${concern.student.first_name} ${concern.student.last_name}`
      : 'Unknown';

  const studentDob = concern.student?.date_of_birth
    ? concern.student.date_of_birth.toLocaleDateString('en-IE', dateOpts)
    : 'N/A';

  const reporterName = formatPersonName(concern.reported_by, redacted, '[Reporter]');
  const liaisonName = formatPersonName(concern.designated_liaison, redacted, '[Designated Liaison]');
  const assigneeName = formatPersonName(concern.assigned_to, redacted, '[Assigned Staff]');

  const concernType = (PRISMA_TO_CONCERN_TYPE[concern.concern_type] ?? concern.concern_type).replace(/_/g, ' ');
  const severity = (PRISMA_TO_SEVERITY[concern.severity] ?? concern.severity);
  const status = (PRISMA_TO_STATUS[concern.status] ?? concern.status).replace(/_/g, ' ');

  // Description — redact any student/reporter names if redacted
  let descriptionText = concern.description;
  if (redacted && concern.student) {
    const studentFirst = concern.student.first_name;
    const studentLast = concern.student.last_name;
    const studentFull = `${studentFirst} ${studentLast}`;
    descriptionText = descriptionText
      .replace(new RegExp(escapeRegExp(studentFull), 'gi'), 'Student A')
      .replace(new RegExp(escapeRegExp(studentFirst), 'gi'), 'Student A')
      .replace(new RegExp(escapeRegExp(studentLast), 'gi'), '[REDACTED]');
  }
  if (redacted && concern.reported_by) {
    const reporterFull = `${concern.reported_by.first_name} ${concern.reported_by.last_name}`;
    descriptionText = descriptionText
      .replace(new RegExp(escapeRegExp(reporterFull), 'gi'), '[Reporter]')
      .replace(new RegExp(escapeRegExp(concern.reported_by.first_name), 'gi'), '[Reporter]')
      .replace(new RegExp(escapeRegExp(concern.reported_by.last_name), 'gi'), '[REDACTED]');
  }

  // Referrals section
  let referralsHtml = '';
  if (concern.is_tusla_referral || concern.is_garda_referral) {
    referralsHtml = `<div class="section">
      <h2>Referrals</h2>
      <table>
        <thead>
          <tr>
            <th>Agency</th>
            <th>Reference Number</th>
            <th>Date Referred</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>`;

    if (concern.is_tusla_referral) {
      referralsHtml += `<tr>
        <td>Tusla (Child &amp; Family Agency)</td>
        <td>${escapeHtml(concern.tusla_reference_number ?? 'N/A')}</td>
        <td>${concern.tusla_referred_at ? concern.tusla_referred_at.toLocaleDateString('en-IE', dateOpts) : 'N/A'}</td>
        <td>${escapeHtml(concern.tusla_outcome ?? 'Pending')}</td>
      </tr>`;
    }

    if (concern.is_garda_referral) {
      referralsHtml += `<tr>
        <td>An Garda S&iacute;och&aacute;na</td>
        <td>${escapeHtml(concern.garda_reference_number ?? 'N/A')}</td>
        <td>${concern.garda_referred_at ? concern.garda_referred_at.toLocaleDateString('en-IE', dateOpts) : 'N/A'}</td>
        <td>&mdash;</td>
      </tr>`;
    }

    referralsHtml += '</tbody></table></div>';
  }

  // Actions timeline
  const actionRows = concern.actions.length > 0
    ? concern.actions
        .map((a) => {
          const actionBy = formatPersonName(a.action_by, redacted, '[Staff]');
          let actionDesc = a.description;
          if (redacted) {
            actionDesc = redactNames(actionDesc, concern);
          }
          return `<tr>
            <td>${a.created_at.toLocaleDateString('en-IE', dateTimeOpts)}</td>
            <td>${escapeHtml(a.action_type.replace(/_/g, ' '))}</td>
            <td>${escapeHtml(actionBy)}</td>
            <td>${escapeHtml(actionDesc)}</td>
          </tr>`;
        })
        .join('')
    : '<tr><td colspan="4" class="empty">No actions recorded</td></tr>';

  // Linked incidents
  const incidentRows = concern.concern_incidents.length > 0
    ? concern.concern_incidents
        .map((ci) => {
          const inc = ci.incident;
          let incDesc = inc.parent_description ?? '';
          if (redacted) {
            incDesc = redactNames(incDesc, concern);
          }
          return `<tr>
            <td>${inc.occurred_at.toLocaleDateString('en-IE', dateOpts)}</td>
            <td>${escapeHtml(inc.category?.name ?? 'N/A')}</td>
            <td>${escapeHtml(inc.polarity)}</td>
            <td>${escapeHtml(inc.location ?? 'N/A')}</td>
            <td>${escapeHtml(incDesc)}</td>
          </tr>`;
        })
        .join('')
    : '<tr><td colspan="5" class="empty">No linked incidents</td></tr>';

  // Resolution section
  let resolutionHtml = '';
  if (concern.resolved_at ?? concern.resolution_notes) {
    let resNotes = concern.resolution_notes ?? '';
    if (redacted) {
      resNotes = redactNames(resNotes, concern);
    }
    resolutionHtml = `<div class="section">
      <h2>Resolution</h2>
      <table>
        <tbody>
          <tr><td class="label-cell">Resolved At</td><td>${concern.resolved_at ? concern.resolved_at.toLocaleDateString('en-IE', dateTimeOpts) : 'N/A'}</td></tr>
          <tr><td class="label-cell">Resolution Notes</td><td>${escapeHtml(resNotes) || 'N/A'}</td></tr>
        </tbody>
      </table>
    </div>`;
  }

  // Seal section
  let sealHtml = '';
  if (concern.sealed_at) {
    sealHtml = `<div class="section">
      <h2>Seal Information</h2>
      <table>
        <tbody>
          <tr><td class="label-cell">Sealed At</td><td>${concern.sealed_at.toLocaleDateString('en-IE', dateTimeOpts)}</td></tr>
          <tr><td class="label-cell">Sealed By</td><td>${escapeHtml(formatPersonName(concern.sealed_by, redacted, '[Sealer]'))}</td></tr>
          <tr><td class="label-cell">Approved By</td><td>${escapeHtml(formatPersonName(concern.seal_approved_by, redacted, '[Approver]'))}</td></tr>
          <tr><td class="label-cell">Reason</td><td>${escapeHtml(concern.sealed_reason ?? 'N/A')}</td></tr>
          <tr><td class="label-cell">Retention Until</td><td>${concern.retention_until ? concern.retention_until.toLocaleDateString('en-IE', dateOpts) : 'N/A'}</td></tr>
        </tbody>
      </table>
    </div>`;
  }

  const generatedDate = new Date().toLocaleDateString('en-IE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #333;
    line-height: 1.4;
    padding: 10px;
  }
  @page { margin: 20mm; }
  body::after {
    content: "${watermarkText}";
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 60px;
    color: rgba(200, 50, 50, 0.15);
    z-index: 1000;
    pointer-events: none;
    white-space: nowrap;
  }
  .header {
    text-align: center;
    border-bottom: 3px solid #c00;
    padding-bottom: 10px;
    margin-bottom: 15px;
  }
  .header h1 {
    font-size: 18px;
    color: #222;
    margin-bottom: 2px;
  }
  .header .subtitle {
    font-size: 13px;
    color: #c00;
    font-weight: bold;
    letter-spacing: 1.5px;
  }
  .header .concern-number {
    font-size: 11px;
    color: #666;
    margin-top: 4px;
  }
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 20px;
    margin-bottom: 15px;
    padding: 10px 12px;
    background: #fdf2f2;
    border: 1px solid #f5c6cb;
    border-radius: 4px;
  }
  .info-grid .info-item {
    font-size: 11px;
  }
  .info-grid .info-item strong {
    color: #555;
    min-width: 120px;
    display: inline-block;
  }
  .severity-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .severity-low { background: #d4edda; color: #155724; }
  .severity-medium { background: #fff3cd; color: #856404; }
  .severity-high { background: #f8d7da; color: #721c24; }
  .severity-critical { background: #c00; color: #fff; }
  .section { margin-bottom: 16px; page-break-inside: avoid; }
  .section h2 {
    font-size: 13px;
    color: #c00;
    border-bottom: 1px solid #ddd;
    padding-bottom: 3px;
    margin-bottom: 6px;
  }
  .description-block {
    padding: 8px 12px;
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    white-space: pre-wrap;
    font-size: 11px;
    line-height: 1.5;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
  }
  th {
    background: #f0f0f0;
    padding: 5px 6px;
    border: 1px solid #ddd;
    text-align: left;
    font-weight: bold;
    font-size: 9px;
    text-transform: uppercase;
    color: #555;
  }
  td {
    padding: 4px 6px;
    border: 1px solid #ddd;
    vertical-align: top;
  }
  tr:nth-child(even) { background: #fafafa; }
  .label-cell {
    font-weight: bold;
    width: 160px;
    color: #555;
    background: #f8f8f8;
  }
  .empty {
    text-align: center;
    color: #999;
    font-style: italic;
    padding: 10px;
  }
  .footer {
    margin-top: 20px;
    padding-top: 8px;
    border-top: 2px solid #c00;
    font-size: 9px;
    color: #999;
    display: flex;
    justify-content: space-between;
  }
  .footer .warning {
    color: #c00;
    font-weight: bold;
  }
</style>
</head>
<body>

<div class="header">
  <h1>${escapeHtml(schoolName)}</h1>
  <div class="subtitle">${subtitleText}</div>
  <div class="concern-number">Ref: ${escapeHtml(concern.concern_number)}</div>
</div>

<div class="info-grid">
  <div class="info-item"><strong>Student:</strong> ${escapeHtml(studentName)}</div>
  <div class="info-item"><strong>Date of Birth:</strong> ${redacted ? '[REDACTED]' : escapeHtml(studentDob)}</div>
  <div class="info-item"><strong>Concern Type:</strong> ${escapeHtml(concernType)}</div>
  <div class="info-item"><strong>Severity:</strong> <span class="severity-badge severity-${severity}">${escapeHtml(severity)}</span></div>
  <div class="info-item"><strong>Status:</strong> ${escapeHtml(status)}</div>
  <div class="info-item"><strong>Reported By:</strong> ${escapeHtml(reporterName)}</div>
  <div class="info-item"><strong>Designated Liaison:</strong> ${escapeHtml(liaisonName)}</div>
  <div class="info-item"><strong>Assigned To:</strong> ${escapeHtml(assigneeName)}</div>
  <div class="info-item"><strong>Date Reported:</strong> ${concern.created_at.toLocaleDateString('en-IE', dateOpts)}</div>
  <div class="info-item"><strong>Last Updated:</strong> ${concern.updated_at.toLocaleDateString('en-IE', dateOpts)}</div>
</div>

<div class="section">
  <h2>Description of Concern</h2>
  <div class="description-block">${escapeHtml(descriptionText)}</div>
</div>

${concern.immediate_actions_taken ? `<div class="section">
  <h2>Immediate Actions Taken</h2>
  <div class="description-block">${escapeHtml(redacted ? redactNames(concern.immediate_actions_taken, concern) : concern.immediate_actions_taken)}</div>
</div>` : ''}

${referralsHtml}

<div class="section">
  <h2>Action Timeline (${concern.actions.length} entries)</h2>
  <table>
    <thead>
      <tr>
        <th>Date/Time</th>
        <th>Action Type</th>
        <th>By</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>${actionRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>Linked Incidents (${concern.concern_incidents.length})</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Category</th>
        <th>Polarity</th>
        <th>Location</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>${incidentRows}</tbody>
  </table>
</div>

${resolutionHtml}
${sealHtml}

<div class="footer">
  <span class="warning">SAFEGUARDING &mdash; ${redacted ? 'REDACTED COPY' : 'STRICTLY CONFIDENTIAL'}</span>
  <span>Generated: ${escapeHtml(generatedDate)}</span>
</div>

</body>
</html>`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactNames(text: string, concern: CaseFileConcern): string {
  let result = text;
  if (concern.student) {
    const fullName = `${concern.student.first_name} ${concern.student.last_name}`;
    result = result
      .replace(new RegExp(escapeRegExp(fullName), 'gi'), 'Student A')
      .replace(new RegExp(escapeRegExp(concern.student.first_name), 'gi'), 'Student A')
      .replace(new RegExp(escapeRegExp(concern.student.last_name), 'gi'), '[REDACTED]');
  }
  if (concern.reported_by) {
    const fullName = `${concern.reported_by.first_name} ${concern.reported_by.last_name}`;
    result = result
      .replace(new RegExp(escapeRegExp(fullName), 'gi'), '[Reporter]')
      .replace(new RegExp(escapeRegExp(concern.reported_by.first_name), 'gi'), '[Reporter]')
      .replace(new RegExp(escapeRegExp(concern.reported_by.last_name), 'gi'), '[REDACTED]');
  }
  return result;
}
