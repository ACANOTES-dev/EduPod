import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import type {
  AssignSafeguardingConcernDto,
  BehaviourSettings,
  CreateConcernDto,
  CreateCpRecordDto,
  ListSafeguardingActionsQuery,
  ListSafeguardingConcernsQuery,
  MyReportsQuery,
  RecordSafeguardingActionDto,
  ReportSafeguardingConcernDto,
  SafeguardingStatusTransitionDto,
  UpdateSafeguardingConcernDto,
} from '@school/shared';
import { behaviourSettingsSchema, isValidSafeguardingTransition } from '@school/shared';
import { Queue } from 'bullmq';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CpRecordService } from '../child-protection/services/cp-record.service';
import { ConcernVersionService } from '../pastoral/services/concern-version.service';
import { ConcernService } from '../pastoral/services/concern.service';
import { PastoralEventService } from '../pastoral/services/pastoral-event.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';

import {
  ACK_STATUS_TO_PRISMA,
  ACTION_TYPE_TO_PRISMA,
  BEHAVIOUR_TO_PASTORAL_SEVERITY,
  BEHAVIOUR_TO_PASTORAL_STATUS,
  CONCERN_TYPE_TO_PRISMA,
  PRISMA_TO_ACK_STATUS,
  PRISMA_TO_ACTION_TYPE,
  PRISMA_TO_CONCERN_TYPE,
  PRISMA_TO_SEVERITY,
  PRISMA_TO_STATUS,
  SEVERITY_TO_PRISMA,
  STATUS_TO_PRISMA,
} from './safeguarding-enum-maps';
import { SAFEGUARDING_CRITICAL_ESCALATION_JOB } from './safeguarding.constants';

@Injectable()
export class SafeguardingConcernsService {
  private readonly logger = new Logger(SafeguardingConcernsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly auditLogService: AuditLogService,
    @InjectQueue('behaviour') private readonly behaviourQueue: Queue,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    private readonly concernService: ConcernService,
    private readonly cpRecordService: CpRecordService,
    private readonly concernVersionService: ConcernVersionService,
    private readonly pastoralEventService: PastoralEventService,
  ) {}

  // ─── Report Concern ─────────────────────────────────────────────────────

  async reportConcern(tenantId: string, userId: string, dto: ReportSafeguardingConcernDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Load behaviour settings for SLA thresholds
      const settings = await this.loadBehaviourSettings(db, tenantId);

      // Generate concern number
      const concernNumber = await this.sequenceService.nextNumber(
        tenantId,
        'safeguarding_concern',
        tx,
        'CP',
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
          concern_type:
            CONCERN_TYPE_TO_PRISMA[dto.concern_type] ??
            ('other_concern' as $Enums.SafeguardingConcernType),
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
          tenantId,
          userId,
          concernDto,
          null,
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
        await this.behaviourQueue.add(
          SAFEGUARDING_CRITICAL_ESCALATION_JOB,
          {
            tenant_id: tenantId,
            concern_id: concern.id,
            escalation_step: 0,
          },
          { delay: 0 },
        );
      }

      // Audit log
      void this.auditLogService.write(
        tenantId,
        userId,
        'safeguarding_concern',
        concern.id,
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
          ? (PRISMA_TO_ACK_STATUS[c.reporter_acknowledgement_status] ?? null)
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
    checkPermission: (
      userId: string,
      tenantId: string,
      membershipId: string,
      concernId?: string,
    ) => Promise<{ allowed: boolean; context: 'normal' | 'break_glass'; grantId?: string }>,
  ) {
    const access = await checkPermission(userId, tenantId, membershipId);
    if (!access.allowed) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Safeguarding access denied' });
    }

    const where: Prisma.SafeguardingConcernWhereInput = { tenant_id: tenantId };

    if (query.status) {
      const statusValues = query.status
        .split(',')
        .map((s: string) => STATUS_TO_PRISMA[s.trim()])
        .filter((v): v is $Enums.SafeguardingStatus => v !== undefined);
      if (statusValues.length > 0) where.status = { in: statusValues };
    }
    if (query.severity) {
      const sevValues = query.severity
        .split(',')
        .map((s: string) => SEVERITY_TO_PRISMA[s.trim()])
        .filter((v): v is $Enums.SafeguardingSeverity => v !== undefined);
      if (sevValues.length > 0) where.severity = { in: sevValues };
    }
    if (query.type) {
      where.concern_type = CONCERN_TYPE_TO_PRISMA[query.type] ?? undefined;
    }
    if (query.from)
      where.created_at = {
        ...((where.created_at as Prisma.DateTimeFilter) ?? {}),
        gte: new Date(query.from),
      };
    if (query.to)
      where.created_at = {
        ...((where.created_at as Prisma.DateTimeFilter) ?? {}),
        lte: new Date(query.to),
      };
    if (query.assigned_to_id) where.assigned_to_id = query.assigned_to_id;

    // SLA status filter
    if (query.sla_status === 'overdue') {
      where.sla_first_response_met_at = null;
      where.sla_first_response_due = { lt: new Date() };
    } else if (query.sla_status === 'due_soon') {
      where.sla_first_response_met_at = null;
      where.sla_first_response_due = {
        gte: new Date(),
        lte: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
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
          status: {
            notIn: [
              'sg_resolved' as $Enums.SafeguardingStatus,
              'sealed' as $Enums.SafeguardingStatus,
            ],
          },
        },
      }),
      this.prisma.safeguardingConcern.count({
        where: {
          tenant_id: tenantId,
          sla_first_response_met_at: null,
          sla_first_response_due: {
            gte: new Date(),
            lte: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
          status: {
            notIn: [
              'sg_resolved' as $Enums.SafeguardingStatus,
              'sealed' as $Enums.SafeguardingStatus,
            ],
          },
        },
      }),
      this.prisma.safeguardingConcern.count({
        where: {
          tenant_id: tenantId,
          OR: [
            { sla_first_response_met_at: { not: null } },
            { sla_first_response_due: { gt: new Date(Date.now() + 24 * 60 * 60 * 1000) } },
          ],
          status: {
            notIn: [
              'sg_resolved' as $Enums.SafeguardingStatus,
              'sealed' as $Enums.SafeguardingStatus,
            ],
          },
        },
      }),
    ]);

    // Audit log every list access
    void this.auditLogService.write(
      tenantId,
      userId,
      'safeguarding_concern',
      null,
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
    checkPermission: (
      userId: string,
      tenantId: string,
      membershipId: string,
      concernId?: string,
    ) => Promise<{ allowed: boolean; context: 'normal' | 'break_glass'; grantId?: string }>,
  ) {
    const access = await checkPermission(userId, tenantId, membershipId, concernId);
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
      throw new NotFoundException({
        code: 'CONCERN_NOT_FOUND',
        message: 'Safeguarding concern not found',
      });
    }

    // Audit every single view
    void this.auditLogService.write(
      tenantId,
      userId,
      'safeguarding_concern',
      concernId,
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
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: 'Safeguarding concern not found',
        });
      }
      if (concern.status === ('sealed' as $Enums.SafeguardingStatus)) {
        throw new ForbiddenException({
          code: 'CONCERN_SEALED',
          message: 'Concern is sealed and cannot be modified',
        });
      }

      const updateData: Prisma.SafeguardingConcernUpdateInput = {};
      if (dto.description !== undefined) updateData.description = dto.description;
      if (dto.concern_type !== undefined)
        updateData.concern_type = CONCERN_TYPE_TO_PRISMA[dto.concern_type];
      if (dto.severity !== undefined) updateData.severity = SEVERITY_TO_PRISMA[dto.severity];
      if (dto.immediate_actions_taken !== undefined)
        updateData.immediate_actions_taken = dto.immediate_actions_taken;

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
          metadata: {
            fields_updated: Object.keys(dto).filter(
              (k) => dto[k as keyof typeof dto] !== undefined,
            ),
          } as unknown as Prisma.InputJsonValue,
        },
      });

      void this.auditLogService.write(
        tenantId,
        userId,
        'safeguarding_concern',
        concernId,
        'safeguarding_concern_updated',
        { fields: Object.keys(dto) },
        null,
      );

      // ─── Propagate description change to pastoral concern version ───
      if (dto.description !== undefined && concern.pastoral_concern_id) {
        try {
          await this.concernVersionService.amendNarrative(
            tenantId,
            userId,
            concern.pastoral_concern_id,
            {
              new_narrative: dto.description,
              amendment_reason: 'Updated via behaviour safeguarding',
            },
            null,
          );
        } catch (propError) {
          this.logger.error(
            `Pastoral description propagation failed for concern ${concernId}: ${propError instanceof Error ? propError.message : String(propError)}`,
          );
        }
      }

      return {
        data: { id: updated.id, status: PRISMA_TO_STATUS[updated.status] ?? updated.status },
      };
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
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: 'Safeguarding concern not found',
        });
      }
      if (concern.status === ('sealed' as $Enums.SafeguardingStatus)) {
        throw new ForbiddenException({
          code: 'CONCERN_SEALED',
          message: 'Concern is sealed and cannot be modified',
        });
      }

      const fromStatus = PRISMA_TO_STATUS[concern.status] ?? concern.status;
      const toStatus = dto.status;

      if (
        !isValidSafeguardingTransition(
          fromStatus as Parameters<typeof isValidSafeguardingTransition>[0],
          toStatus as Parameters<typeof isValidSafeguardingTransition>[1],
        )
      ) {
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
        tenantId,
        userId,
        'safeguarding_concern',
        concernId,
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

      return {
        data: { id: updated.id, status: PRISMA_TO_STATUS[updated.status] ?? updated.status },
      };
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
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: 'Safeguarding concern not found',
        });
      }
      if (concern.status === ('sealed' as $Enums.SafeguardingStatus)) {
        throw new ForbiddenException({
          code: 'CONCERN_SEALED',
          message: 'Concern is sealed and cannot be modified',
        });
      }

      const updateData: Prisma.SafeguardingConcernUncheckedUpdateInput = {};
      if (dto.designated_liaison_id !== undefined)
        updateData.designated_liaison_id = dto.designated_liaison_id;
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
      throw new NotFoundException({
        code: 'CONCERN_NOT_FOUND',
        message: 'Safeguarding concern not found',
      });
    }
    if (concern.status === ('sealed' as $Enums.SafeguardingStatus)) {
      throw new ForbiddenException({
        code: 'CONCERN_SEALED',
        message: 'Concern is sealed and cannot be modified',
      });
    }

    const action = await this.prisma.safeguardingAction.create({
      data: {
        tenant_id: tenantId,
        concern_id: concernId,
        action_by_id: userId,
        action_type:
          ACTION_TYPE_TO_PRISMA[dto.action_type] ?? ('note_added' as $Enums.SafeguardingActionType),
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
    checkPermission: (
      userId: string,
      tenantId: string,
      membershipId: string,
      concernId?: string,
    ) => Promise<{ allowed: boolean; context: 'normal' | 'break_glass'; grantId?: string }>,
  ) {
    const access = await checkPermission(userId, tenantId, membershipId, concernId);
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
      tenantId,
      userId,
      'safeguarding_concern',
      concernId,
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

  mapConcernSummary(concern: {
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
      sla_breached:
        concern.sla_first_response_met_at === null &&
        concern.sla_first_response_due !== null &&
        concern.sla_first_response_due < new Date(),
      created_at: concern.created_at.toISOString(),
      student: concern.student
        ? {
            id: concern.student.id,
            name: `${concern.student.first_name} ${concern.student.last_name}`,
          }
        : null,
      reported_by: concern.reported_by
        ? {
            id: concern.reported_by.id,
            name: `${concern.reported_by.first_name} ${concern.reported_by.last_name}`,
          }
        : null,
      assigned_to: concern.assigned_to
        ? {
            id: concern.assigned_to.id,
            name: `${concern.assigned_to.first_name} ${concern.assigned_to.last_name}`,
          }
        : null,
    };
  }

  mapConcernDetail(concern: {
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
    student?: {
      id: string;
      first_name: string;
      last_name: string;
      date_of_birth: Date | null;
    } | null;
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
      sla_breached:
        concern.sla_first_response_met_at === null &&
        concern.sla_first_response_due !== null &&
        concern.sla_first_response_due < new Date(),
      sealed_at: concern.sealed_at?.toISOString() ?? null,
      sealed_reason: concern.sealed_reason,
      retention_until: concern.retention_until?.toISOString() ?? null,
      created_at: concern.created_at.toISOString(),
      updated_at: concern.updated_at.toISOString(),
      student: concern.student
        ? {
            id: concern.student.id,
            name: `${concern.student.first_name} ${concern.student.last_name}`,
            date_of_birth: concern.student.date_of_birth?.toISOString() ?? null,
          }
        : null,
      reported_by: concern.reported_by
        ? {
            id: concern.reported_by.id,
            name: `${concern.reported_by.first_name} ${concern.reported_by.last_name}`,
          }
        : null,
      designated_liaison: concern.designated_liaison
        ? {
            id: concern.designated_liaison.id,
            name: `${concern.designated_liaison.first_name} ${concern.designated_liaison.last_name}`,
          }
        : null,
      assigned_to: concern.assigned_to
        ? {
            id: concern.assigned_to.id,
            name: `${concern.assigned_to.first_name} ${concern.assigned_to.last_name}`,
          }
        : null,
      sealed_by: concern.sealed_by
        ? {
            id: concern.sealed_by.id,
            name: `${concern.sealed_by.first_name} ${concern.sealed_by.last_name}`,
          }
        : null,
      seal_approved_by: concern.seal_approved_by
        ? {
            id: concern.seal_approved_by.id,
            name: `${concern.seal_approved_by.first_name} ${concern.seal_approved_by.last_name}`,
          }
        : null,
      actions_count: concern._count?.actions ?? 0,
      linked_incidents_count: concern._count?.concern_incidents ?? 0,
    };
  }
}
