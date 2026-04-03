import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  SECURITY_INCIDENT_STATUS_TRANSITIONS,
  type CreateIncidentEventDto,
  type CreateSecurityIncidentDto,
  type ListSecurityIncidentsDto,
  type NotifyControllersDto,
  type NotifyDpcDto,
  type SecurityIncidentStatus,
  type UpdateSecurityIncidentDto,
} from '@school/shared/security';

import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── User select shape (reused across queries) ───────────────────────────────

const USER_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
} as const;

// ─── Closed statuses (incidents not eligible for deduplication) ───────────────

const CLOSED_STATUSES: readonly string[] = ['resolved', 'closed'];

@Injectable()
export class SecurityIncidentsService {
  private readonly logger = new Logger(SecurityIncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // ─── List incidents with filtering & pagination ─────────────────────────────

  async list(filters: ListSecurityIncidentsDto) {
    const { page, pageSize, status, severity, incident_type, start_date, end_date } = filters;
    const skip = (page - 1) * pageSize;

    const where: Prisma.SecurityIncidentWhereInput = {
      ...(status ? { status } : {}),
      ...(severity ? { severity } : {}),
      ...(incident_type ? { incident_type } : {}),
      ...(start_date || end_date
        ? {
            detected_at: {
              ...(start_date ? { gte: new Date(start_date) } : {}),
              ...(end_date ? { lte: new Date(end_date) } : {}),
            },
          }
        : {}),
    };

    const [incidents, total] = await Promise.all([
      this.prisma.securityIncident.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { detected_at: 'desc' },
        include: {
          created_by: { select: USER_SELECT },
          assigned_to: { select: USER_SELECT },
          _count: { select: { events: true } },
        },
      }),
      this.prisma.securityIncident.count({ where }),
    ]);

    const data = incidents.map((inc) => ({
      ...inc,
      created_by_name: `${inc.created_by.first_name} ${inc.created_by.last_name}`,
      assigned_to_name: inc.assigned_to
        ? `${inc.assigned_to.first_name} ${inc.assigned_to.last_name}`
        : null,
      events_count: inc._count.events,
      created_by: undefined,
      assigned_to: undefined,
      _count: undefined,
    }));

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Get single incident with full timeline ─────────────────────────────────

  async findOne(id: string) {
    const incident = await this.prisma.securityIncident.findUnique({
      where: { id },
      include: {
        created_by: { select: USER_SELECT },
        assigned_to: { select: USER_SELECT },
        events: {
          orderBy: { created_at: 'asc' },
          include: {
            created_by: { select: USER_SELECT },
          },
        },
      },
    });

    if (!incident) {
      throw new NotFoundException({
        code: 'INCIDENT_NOT_FOUND',
        message: `Security incident with id "${id}" not found`,
      });
    }

    return {
      ...incident,
      created_by_name: `${incident.created_by.first_name} ${incident.created_by.last_name}`,
      assigned_to_name: incident.assigned_to
        ? `${incident.assigned_to.first_name} ${incident.assigned_to.last_name}`
        : null,
      events: incident.events.map((evt) => ({
        ...evt,
        created_by_name: `${evt.created_by.first_name} ${evt.created_by.last_name}`,
        created_by: undefined,
      })),
      created_by: undefined,
      assigned_to: undefined,
    };
  }

  // ─── Create incident manually ───────────────────────────────────────────────

  async create(dto: CreateSecurityIncidentDto, userId: string) {
    const incident = await this.prisma.securityIncident.create({
      data: {
        severity: dto.severity,
        incident_type: dto.incident_type,
        description: dto.description,
        affected_tenants: dto.affected_tenants ?? [],
        affected_data_subjects_count: dto.affected_data_subjects_count ?? null,
        data_categories_affected: dto.data_categories_affected ?? [],
        containment_actions: dto.containment_actions ?? null,
        assigned_to_user_id: dto.assigned_to_user_id ?? null,
        created_by_user_id: userId,
        status: 'detected',
        events: {
          create: {
            event_type: 'status_change',
            description: 'Incident created manually',
            created_by_user_id: userId,
          },
        },
      },
      include: {
        events: true,
      },
    });

    await this.auditLogService.write(
      null,
      userId,
      'security_incident',
      incident.id,
      'incident_created',
      {
        severity: dto.severity,
        incident_type: dto.incident_type,
      },
      null,
    );

    this.logger.log(`Security incident created: ${incident.id} (${dto.incident_type})`);

    return incident;
  }

  // ─── Update incident ────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateSecurityIncidentDto, userId: string) {
    const existing = await this.prisma.securityIncident.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'INCIDENT_NOT_FOUND',
        message: `Security incident with id "${id}" not found`,
      });
    }

    // ─── Validate status transition if status is changing ───────────────────
    if (dto.status && dto.status !== existing.status) {
      const currentStatus = existing.status as SecurityIncidentStatus;
      const allowedTransitions = SECURITY_INCIDENT_STATUS_TRANSITIONS[currentStatus] ?? [];

      if (!allowedTransitions.includes(dto.status as SecurityIncidentStatus)) {
        throw new BadRequestException({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot transition from "${existing.status}" to "${dto.status}". Allowed: ${allowedTransitions.join(', ') || 'none'}`,
        });
      }
    }

    // ─── Build update data ──────────────────────────────────────────────────
    const updateData: Prisma.SecurityIncidentUpdateInput = {};
    if (dto.severity !== undefined) updateData.severity = dto.severity;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.affected_tenants !== undefined) updateData.affected_tenants = dto.affected_tenants;
    if (dto.affected_data_subjects_count !== undefined)
      updateData.affected_data_subjects_count = dto.affected_data_subjects_count;
    if (dto.data_categories_affected !== undefined)
      updateData.data_categories_affected = dto.data_categories_affected;
    if (dto.containment_actions !== undefined)
      updateData.containment_actions = dto.containment_actions;
    if (dto.root_cause !== undefined) updateData.root_cause = dto.root_cause;
    if (dto.remediation !== undefined) updateData.remediation = dto.remediation;
    if (dto.assigned_to_user_id !== undefined) {
      updateData.assigned_to = dto.assigned_to_user_id
        ? { connect: { id: dto.assigned_to_user_id } }
        : { disconnect: true };
    }
    if (dto.dpc_reference_number !== undefined)
      updateData.dpc_reference_number = dto.dpc_reference_number;

    // ─── Add status_change timeline event if status changed ─────────────────
    if (dto.status && dto.status !== existing.status) {
      updateData.events = {
        create: {
          event_type: 'status_change',
          description: `Status changed from "${existing.status}" to "${dto.status}"`,
          created_by_user_id: userId,
        },
      };
    }

    const updated = await this.prisma.securityIncident.update({
      where: { id },
      data: updateData,
    });

    await this.auditLogService.write(
      null,
      userId,
      'security_incident',
      id,
      'incident_updated',
      {
        changes: dto,
        previous_status: existing.status,
      },
      null,
    );

    return updated;
  }

  // ─── Add timeline event ─────────────────────────────────────────────────────

  async addEvent(incidentId: string, dto: CreateIncidentEventDto, userId: string) {
    const incident = await this.prisma.securityIncident.findUnique({
      where: { id: incidentId },
      select: { id: true },
    });

    if (!incident) {
      throw new NotFoundException({
        code: 'INCIDENT_NOT_FOUND',
        message: `Security incident with id "${incidentId}" not found`,
      });
    }

    const event = await this.prisma.securityIncidentEvent.create({
      data: {
        incident_id: incidentId,
        event_type: dto.event_type,
        description: dto.description,
        created_by_user_id: userId,
      },
    });

    await this.auditLogService.write(
      null,
      userId,
      'security_incident',
      incidentId,
      'event_added',
      {
        event_id: event.id,
        event_type: dto.event_type,
      },
      null,
    );

    return event;
  }

  // ─── Record controller notification ─────────────────────────────────────────

  async notifyControllers(incidentId: string, dto: NotifyControllersDto, userId: string) {
    const incident = await this.prisma.securityIncident.findUnique({
      where: { id: incidentId },
      select: { id: true },
    });

    if (!incident) {
      throw new NotFoundException({
        code: 'INCIDENT_NOT_FOUND',
        message: `Security incident with id "${incidentId}" not found`,
      });
    }

    const updated = await this.prisma.securityIncident.update({
      where: { id: incidentId },
      data: {
        reported_to_controllers_at: new Date(),
        events: {
          create: {
            event_type: 'notification',
            description: `Controllers notified for tenants: ${dto.tenant_ids.join(', ')}. Message: ${dto.message}`,
            created_by_user_id: userId,
          },
        },
      },
    });

    await this.auditLogService.write(
      null,
      userId,
      'security_incident',
      incidentId,
      'controllers_notified',
      {
        tenant_ids: dto.tenant_ids,
        message: dto.message,
      },
      null,
    );

    this.logger.log(
      `Controllers notified for incident ${incidentId}: ${dto.tenant_ids.length} tenant(s)`,
    );

    return updated;
  }

  // ─── Record DPC notification ────────────────────────────────────────────────

  async notifyDpc(incidentId: string, dto: NotifyDpcDto, userId: string) {
    const incident = await this.prisma.securityIncident.findUnique({
      where: { id: incidentId },
      select: { id: true },
    });

    if (!incident) {
      throw new NotFoundException({
        code: 'INCIDENT_NOT_FOUND',
        message: `Security incident with id "${incidentId}" not found`,
      });
    }

    const updated = await this.prisma.securityIncident.update({
      where: { id: incidentId },
      data: {
        reported_to_dpc_at: new Date(),
        dpc_reference_number: dto.dpc_reference_number,
        events: {
          create: {
            event_type: 'notification',
            description: `DPC notified. Reference: ${dto.dpc_reference_number}${dto.notes ? `. Notes: ${dto.notes}` : ''}`,
            created_by_user_id: userId,
          },
        },
      },
    });

    await this.auditLogService.write(
      null,
      userId,
      'security_incident',
      incidentId,
      'dpc_notified',
      {
        dpc_reference_number: dto.dpc_reference_number,
        notes: dto.notes,
      },
      null,
    );

    this.logger.log(`DPC notified for incident ${incidentId}: ref ${dto.dpc_reference_number}`);

    return updated;
  }

  // ─── Find or create for anomaly (worker deduplication) ──────────────────────

  async findOrCreateForAnomaly(
    incidentType: string,
    severity: string,
    description: string,
    affectedTenants: string[],
    systemUserId: string,
  ) {
    // Look for an existing open incident of the same type
    const existing = await this.prisma.securityIncident.findFirst({
      where: {
        incident_type: incidentType,
        status: { notIn: [...CLOSED_STATUSES] },
      },
      orderBy: { detected_at: 'desc' },
    });

    if (existing) {
      // Add evidence event to the existing incident
      await this.prisma.securityIncidentEvent.create({
        data: {
          incident_id: existing.id,
          event_type: 'evidence',
          description,
          created_by_user_id: systemUserId,
        },
      });

      this.logger.log(
        `Anomaly evidence added to existing incident ${existing.id} (${incidentType})`,
      );

      return existing;
    }

    // No open incident of this type — create a new one
    const incident = await this.prisma.securityIncident.create({
      data: {
        severity,
        incident_type: incidentType,
        description,
        affected_tenants: affectedTenants,
        created_by_user_id: systemUserId,
        status: 'detected',
        events: {
          create: {
            event_type: 'status_change',
            description: 'Incident auto-detected by anomaly scan',
            created_by_user_id: systemUserId,
          },
        },
      },
      include: {
        events: true,
      },
    });

    await this.auditLogService.write(
      null,
      systemUserId,
      'security_incident',
      incident.id,
      'incident_auto_created',
      {
        severity,
        incident_type: incidentType,
        affected_tenants: affectedTenants,
      },
      null,
    );

    this.logger.log(`New security incident auto-created: ${incident.id} (${incidentType})`);

    return incident;
  }
}
