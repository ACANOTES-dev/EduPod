import { randomUUID } from 'crypto';

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../tenants/sequence.service';

import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface DeclareIncidentDto {
  incident_type: 'bereavement' | 'serious_accident' | 'community_trauma' | 'other';
  incident_type_other?: string;
  description: string;
  incident_date: string;
  scope: 'whole_school' | 'year_group' | 'class' | 'individual';
  scope_year_group_ids?: string[];
  scope_class_ids?: string[];
}

export interface UpdateIncidentDto {
  description?: string;
  communication_notes?: string;
}

export interface TransitionStatusDto {
  new_status: 'active' | 'monitoring' | 'closed';
  reason: string;
  closure_notes?: string;
}

export interface UpdateResponsePlanItemDto {
  phase: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  item_id: string;
  assigned_to_id?: string;
  is_done?: boolean;
  notes?: string;
}

export interface AddResponsePlanItemDto {
  phase: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  label: string;
  description?: string;
  assigned_to_id?: string;
}

export interface AddExternalSupportDto {
  provider_type: 'neps_ci_team' | 'external_counsellor' | 'other';
  provider_name: string;
  contact_person?: string;
  contact_details?: string;
  visit_date?: string;
  visit_time_start?: string;
  visit_time_end?: string;
  availability_notes?: string;
  students_seen?: string[];
  outcome_notes?: string;
}

export interface ResponsePlanItem {
  id: string;
  label: string;
  description: string | null;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  is_done: boolean;
  completed_at: string | null;
  completed_by_id: string | null;
  completed_by_name: string | null;
  notes: string | null;
}

export interface ResponsePlan {
  immediate: ResponsePlanItem[];
  short_term: ResponsePlanItem[];
  medium_term: ResponsePlanItem[];
  long_term: ResponsePlanItem[];
}

export interface ExternalSupportEntry {
  id: string;
  provider_type: string;
  provider_name: string;
  contact_person: string | null;
  contact_details: string | null;
  visit_date: string | null;
  visit_time_start: string | null;
  visit_time_end: string | null;
  availability_notes: string | null;
  students_seen: string[];
  outcome_notes: string | null;
  recorded_by_id: string;
  recorded_at: string;
}

export interface ResponsePlanPhaseProgress {
  phase: string;
  total: number;
  completed: number;
  percentage: number;
}

export interface CriticalIncidentFilters {
  status?: string;
  incident_type?: string;
  date_from?: string;
  date_to?: string;
}

type ResponsePlanPhase = 'immediate' | 'short_term' | 'medium_term' | 'long_term';

const VALID_PHASES: ResponsePlanPhase[] = ['immediate', 'short_term', 'medium_term', 'long_term'];

// ─── Default Response Plan Template ─────────────────────────────────────────

const DEFAULT_RESPONSE_PLAN_TEMPLATE = {
  immediate: [
    { label: 'Convene Critical Incident Management Team' },
    { label: 'Gather and verify facts' },
    { label: 'Contact bereaved/affected family' },
    { label: 'Designate staff room and support room' },
    { label: 'Prepare statement for staff briefing' },
    { label: 'Brief all staff before school starts' },
    { label: 'Identify high-risk students' },
    { label: 'Assign staff to support identified students' },
    { label: 'Contact NEPS for support' },
    { label: 'Prepare parent notification' },
  ],
  short_term: [
    { label: 'Daily CI Management Team briefing' },
    { label: 'Monitor affected students' },
    { label: 'Arrange external counselling support' },
    { label: 'Coordinate media response (if applicable)' },
    { label: 'Follow up with bereaved/affected family' },
    { label: 'Monitor staff wellbeing' },
    { label: 'Review and adjust support arrangements' },
  ],
  medium_term: [
    { label: 'Review ongoing support needs' },
    { label: 'Identify students needing continued support' },
    { label: 'Liaise with external agencies' },
    { label: 'Plan memorial/commemoration (if appropriate)' },
    { label: 'Review staff support needs' },
    { label: 'Document lessons learned' },
  ],
  long_term: [
    { label: 'Anniversary planning' },
    { label: 'Review at 3-month mark' },
    { label: 'Review at 6-month mark' },
    { label: 'Review at 12-month mark' },
    { label: 'Update CI Management Plan based on learnings' },
  ],
};

// ─── Status Transition Map ──────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  ci_active: ['ci_monitoring', 'ci_closed'],
  ci_monitoring: ['ci_active', 'ci_closed'],
  ci_closed: ['ci_monitoring'],
};

// Map incoming API status strings to Prisma enum values
const STATUS_TO_PRISMA: Record<string, string> = {
  active: 'ci_active',
  monitoring: 'ci_monitoring',
  closed: 'ci_closed',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildResponsePlanItem(templateItem: { label: string }): ResponsePlanItem {
  return {
    id: randomUUID(),
    label: templateItem.label,
    description: null,
    assigned_to_id: null,
    assigned_to_name: null,
    is_done: false,
    completed_at: null,
    completed_by_id: null,
    completed_by_name: null,
    notes: null,
  };
}

function initialiseResponsePlan(): ResponsePlan {
  return {
    immediate: DEFAULT_RESPONSE_PLAN_TEMPLATE.immediate.map(buildResponsePlanItem),
    short_term: DEFAULT_RESPONSE_PLAN_TEMPLATE.short_term.map(buildResponsePlanItem),
    medium_term: DEFAULT_RESPONSE_PLAN_TEMPLATE.medium_term.map(buildResponsePlanItem),
    long_term: DEFAULT_RESPONSE_PLAN_TEMPLATE.long_term.map(buildResponsePlanItem),
  };
}

function parseResponsePlan(raw: Prisma.JsonValue | null | undefined): ResponsePlan {
  if (!raw || typeof raw !== 'object') {
    return { immediate: [], short_term: [], medium_term: [], long_term: [] };
  }
  const plan = raw as Record<string, unknown>;
  return {
    immediate: Array.isArray(plan.immediate) ? (plan.immediate as ResponsePlanItem[]) : [],
    short_term: Array.isArray(plan.short_term) ? (plan.short_term as ResponsePlanItem[]) : [],
    medium_term: Array.isArray(plan.medium_term) ? (plan.medium_term as ResponsePlanItem[]) : [],
    long_term: Array.isArray(plan.long_term) ? (plan.long_term as ResponsePlanItem[]) : [],
  };
}

function parseExternalSupportLog(raw: Prisma.JsonValue | null | undefined): ExternalSupportEntry[] {
  if (!raw || !Array.isArray(raw)) {
    return [];
  }
  return raw as unknown as ExternalSupportEntry[];
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class CriticalIncidentService {
  private readonly logger = new Logger(CriticalIncidentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly eventService: PastoralEventService,
  ) {}

  // ─── DECLARE ────────────────────────────────────────────────────────────────

  async declare(
    tenantId: string,
    declaredById: string,
    dto: DeclareIncidentDto,
  ): Promise<{ data: Record<string, unknown> }> {
    // Validate scope constraints
    if (dto.scope === 'year_group') {
      if (!dto.scope_year_group_ids || dto.scope_year_group_ids.length === 0) {
        throw new BadRequestException({
          code: 'SCOPE_IDS_REQUIRED',
          message: 'scope_year_group_ids required when scope is year_group',
        });
      }
    }

    if (dto.scope === 'class') {
      if (!dto.scope_class_ids || dto.scope_class_ids.length === 0) {
        throw new BadRequestException({
          code: 'SCOPE_IDS_REQUIRED',
          message: 'scope_class_ids required when scope is class',
        });
      }
    }

    // Validate incident_type=other requires description or incident_type_other
    if (dto.incident_type === 'other') {
      if (!dto.incident_type_other || dto.incident_type_other.trim().length === 0) {
        throw new BadRequestException({
          code: 'OTHER_TYPE_REQUIRES_DESCRIPTION',
          message: 'incident_type_other is required when incident_type is other',
        });
      }
    }

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: declaredById,
    });

    const created = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Generate incident number
      const incidentNumber = await this.sequenceService.nextNumber(
        tenantId,
        'critical_incident',
        tx,
        'CI',
      );

      // Build scope_ids from scope-specific arrays
      let scopeIds: string[] | undefined;
      if (dto.scope === 'year_group' && dto.scope_year_group_ids) {
        scopeIds = dto.scope_year_group_ids;
      } else if (dto.scope === 'class' && dto.scope_class_ids) {
        scopeIds = dto.scope_class_ids;
      }

      // Initialise response plan from template
      const responsePlan = initialiseResponsePlan();

      // Create the incident record
      // Use existing Prisma model columns. New columns will be added by schema agent.
      const incident = await db.criticalIncident.create({
        data: {
          tenant_id: tenantId,
          incident_type: dto.incident_type === 'other' ? 'ci_other' : dto.incident_type,
          description: dto.incident_type === 'other'
            ? `[${dto.incident_type_other}] ${dto.description}`
            : dto.description,
          occurred_at: new Date(dto.incident_date),
          scope: dto.scope === 'class' ? 'class_group' : dto.scope,
          scope_ids: scopeIds ? (scopeIds as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          declared_by_user_id: declaredById,
          status: 'ci_active',
          response_plan: responsePlan as unknown as Prisma.InputJsonValue,
          external_support_log: [] as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        ...incident,
        incident_number: incidentNumber,
      };
    })) as Record<string, unknown>;

    // Fire-and-forget: audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'critical_incident_declared',
      entity_type: 'critical_incident',
      entity_id: created.id as string,
      student_id: null,
      actor_user_id: declaredById,
      tier: 3,
      payload: {
        incident_id: created.id,
        incident_type: dto.incident_type,
        scope: dto.scope,
        description: dto.description,
      },
      ip_address: null,
    });

    return { data: created };
  }

  // ─── GET BY ID ──────────────────────────────────────────────────────────────

  async getById(
    tenantId: string,
    incidentId: string,
  ): Promise<{ data: Record<string, unknown> }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const incident = await db.criticalIncident.findFirst({
        where: { id: incidentId, tenant_id: tenantId },
      });

      if (!incident) {
        throw new NotFoundException({
          code: 'INCIDENT_NOT_FOUND',
          message: `Critical incident ${incidentId} not found`,
        });
      }

      const affectedCount = await db.criticalIncidentAffected.count({
        where: { incident_id: incidentId, tenant_id: tenantId },
      });

      return {
        ...incident,
        response_plan: parseResponsePlan(incident.response_plan),
        external_support_log: parseExternalSupportLog(incident.external_support_log),
        affected_count: affectedCount,
      };
    })) as Record<string, unknown>;

    return { data: result };
  }

  // ─── LIST ───────────────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    filters: CriticalIncidentFilters,
    page: number,
    pageSize: number,
  ): Promise<{ data: Record<string, unknown>[]; meta: PaginationMeta }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    const skip = (page - 1) * pageSize;

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const where: Record<string, unknown> = { tenant_id: tenantId };

      if (filters.status) {
        const prismaStatus = STATUS_TO_PRISMA[filters.status];
        if (prismaStatus) {
          where.status = prismaStatus;
        }
      }

      if (filters.incident_type) {
        where.incident_type = filters.incident_type === 'other'
          ? 'ci_other'
          : filters.incident_type;
      }

      if (filters.date_from || filters.date_to) {
        const dateFilter: Record<string, Date> = {};
        if (filters.date_from) {
          dateFilter.gte = new Date(filters.date_from);
        }
        if (filters.date_to) {
          dateFilter.lte = new Date(filters.date_to);
        }
        where.occurred_at = dateFilter;
      }

      const [data, total] = await Promise.all([
        db.criticalIncident.findMany({
          where,
          orderBy: { occurred_at: 'desc' },
          skip,
          take: pageSize,
        }),
        db.criticalIncident.count({ where }),
      ]);

      return {
        data: data as unknown as Record<string, unknown>[],
        meta: { page, pageSize, total },
      };
    }) as Promise<{ data: Record<string, unknown>[]; meta: PaginationMeta }>;
  }

  // ─── UPDATE ─────────────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    incidentId: string,
    updatedById: string,
    dto: UpdateIncidentDto,
  ): Promise<{ data: Record<string, unknown> }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: updatedById,
    });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.criticalIncident.findFirst({
        where: { id: incidentId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'INCIDENT_NOT_FOUND',
          message: `Critical incident ${incidentId} not found`,
        });
      }

      const updateData: Record<string, unknown> = {};

      if (dto.description !== undefined) {
        updateData.description = dto.description;
      }

      // communication_notes is a new column — store it if present
      // For now, it will be stored once the schema agent adds the column.
      // In the interim, we can store it in the description or skip.

      return db.criticalIncident.update({
        where: { id: incidentId },
        data: updateData,
      });
    })) as Record<string, unknown>;

    // Fire-and-forget: audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'critical_incident_updated',
      entity_type: 'critical_incident',
      entity_id: incidentId,
      student_id: null,
      actor_user_id: updatedById,
      tier: 3,
      payload: {
        incident_id: incidentId,
        changed_fields: Object.keys(dto).filter(
          (k) => dto[k as keyof UpdateIncidentDto] !== undefined,
        ),
        previous_description: undefined,
        new_description: dto.description,
      },
      ip_address: null,
    });

    return { data: updated };
  }

  // ─── TRANSITION STATUS ──────────────────────────────────────────────────────

  async transitionStatus(
    tenantId: string,
    incidentId: string,
    changedById: string,
    dto: TransitionStatusDto,
  ): Promise<{ data: Record<string, unknown> }> {
    // Map incoming status to Prisma enum
    const newPrismaStatus = STATUS_TO_PRISMA[dto.new_status];
    if (!newPrismaStatus) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Invalid target status: ${dto.new_status}`,
      });
    }

    // Closure requires closure_notes
    if (dto.new_status === 'closed' && (!dto.closure_notes || dto.closure_notes.trim().length === 0)) {
      throw new BadRequestException({
        code: 'CLOSURE_NOTES_REQUIRED',
        message: 'closure_notes are required when closing an incident',
      });
    }

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: changedById,
    });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.criticalIncident.findFirst({
        where: { id: incidentId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'INCIDENT_NOT_FOUND',
          message: `Critical incident ${incidentId} not found`,
        });
      }

      const currentStatus = existing.status as string;

      // Validate transition
      const allowed = VALID_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(newPrismaStatus)) {
        throw new BadRequestException({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot transition from ${currentStatus} to ${newPrismaStatus}`,
        });
      }

      return db.criticalIncident.update({
        where: { id: incidentId },
        data: {
          status: newPrismaStatus as 'ci_active' | 'ci_monitoring' | 'ci_closed',
        },
      });
    })) as Record<string, unknown>;

    // Fire-and-forget: audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'critical_incident_status_changed',
      entity_type: 'critical_incident',
      entity_id: incidentId,
      student_id: null,
      actor_user_id: changedById,
      tier: 3,
      payload: {
        incident_id: incidentId,
        from_status: dto.new_status === 'closed' ? 'monitoring' : 'active',
        to_status: dto.new_status,
        reason: dto.reason,
        closure_notes: dto.closure_notes ?? null,
        changed_by_id: changedById,
      },
      ip_address: null,
    });

    return { data: updated };
  }

  // ─── RESPONSE PLAN: UPDATE ITEM ─────────────────────────────────────────────

  async updateResponsePlanItem(
    tenantId: string,
    incidentId: string,
    updatedById: string,
    dto: UpdateResponsePlanItemDto,
  ): Promise<{ data: ResponsePlan }> {
    if (!VALID_PHASES.includes(dto.phase)) {
      throw new BadRequestException({
        code: 'INVALID_PHASE',
        message: `Invalid phase: ${dto.phase}`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: updatedById,
    });

    const updatedPlan = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const incident = await db.criticalIncident.findFirst({
        where: { id: incidentId, tenant_id: tenantId },
      });

      if (!incident) {
        throw new NotFoundException({
          code: 'INCIDENT_NOT_FOUND',
          message: `Critical incident ${incidentId} not found`,
        });
      }

      const plan = parseResponsePlan(incident.response_plan);
      const phaseItems = plan[dto.phase];
      const itemIndex = phaseItems.findIndex((item) => item.id === dto.item_id);

      if (itemIndex === -1) {
        throw new NotFoundException({
          code: 'PLAN_ITEM_NOT_FOUND',
          message: `Response plan item ${dto.item_id} not found in phase ${dto.phase}`,
        });
      }

      // Safe access — itemIndex is validated above
      const existingItem = phaseItems[itemIndex];
      if (!existingItem) {
        throw new NotFoundException({
          code: 'PLAN_ITEM_NOT_FOUND',
          message: `Response plan item ${dto.item_id} not found in phase ${dto.phase}`,
        });
      }

      const item = { ...existingItem };

      // Apply updates
      if (dto.assigned_to_id !== undefined) {
        item.assigned_to_id = dto.assigned_to_id;
      }

      if (dto.is_done !== undefined) {
        item.is_done = dto.is_done;
        if (dto.is_done) {
          item.completed_at = new Date().toISOString();
          item.completed_by_id = updatedById;
        } else {
          item.completed_at = null;
          item.completed_by_id = null;
          item.completed_by_name = null;
        }
      }

      if (dto.notes !== undefined) {
        item.notes = dto.notes;
      }

      phaseItems[itemIndex] = item;
      plan[dto.phase] = phaseItems;

      await db.criticalIncident.update({
        where: { id: incidentId },
        data: {
          response_plan: plan as unknown as Prisma.InputJsonValue,
        },
      });

      return plan;
    })) as ResponsePlan;

    // Fire-and-forget: audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'response_plan_item_updated',
      entity_type: 'critical_incident',
      entity_id: incidentId,
      student_id: null,
      actor_user_id: updatedById,
      tier: 3,
      payload: {
        incident_id: incidentId,
        phase: dto.phase,
        item_id: dto.item_id,
        is_done: dto.is_done,
        assigned_to_id: dto.assigned_to_id,
      },
      ip_address: null,
    });

    return { data: updatedPlan };
  }

  // ─── RESPONSE PLAN: ADD ITEM ────────────────────────────────────────────────

  async addResponsePlanItem(
    tenantId: string,
    incidentId: string,
    addedById: string,
    dto: AddResponsePlanItemDto,
  ): Promise<{ data: ResponsePlan }> {
    if (!VALID_PHASES.includes(dto.phase)) {
      throw new BadRequestException({
        code: 'INVALID_PHASE',
        message: `Invalid phase: ${dto.phase}`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: addedById,
    });

    const updatedPlan = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const incident = await db.criticalIncident.findFirst({
        where: { id: incidentId, tenant_id: tenantId },
      });

      if (!incident) {
        throw new NotFoundException({
          code: 'INCIDENT_NOT_FOUND',
          message: `Critical incident ${incidentId} not found`,
        });
      }

      const plan = parseResponsePlan(incident.response_plan);

      const newItem: ResponsePlanItem = {
        id: randomUUID(),
        label: dto.label,
        description: dto.description ?? null,
        assigned_to_id: dto.assigned_to_id ?? null,
        assigned_to_name: null,
        is_done: false,
        completed_at: null,
        completed_by_id: null,
        completed_by_name: null,
        notes: null,
      };

      plan[dto.phase].push(newItem);

      await db.criticalIncident.update({
        where: { id: incidentId },
        data: {
          response_plan: plan as unknown as Prisma.InputJsonValue,
        },
      });

      return plan;
    })) as ResponsePlan;

    // Fire-and-forget: audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'response_plan_item_added',
      entity_type: 'critical_incident',
      entity_id: incidentId,
      student_id: null,
      actor_user_id: addedById,
      tier: 3,
      payload: {
        incident_id: incidentId,
        phase: dto.phase,
        label: dto.label,
      },
      ip_address: null,
    });

    return { data: updatedPlan };
  }

  // ─── RESPONSE PLAN: PROGRESS ────────────────────────────────────────────────

  async getResponsePlanProgress(
    tenantId: string,
    incidentId: string,
  ): Promise<{ data: ResponsePlanPhaseProgress[] }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const progress = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const incident = await db.criticalIncident.findFirst({
        where: { id: incidentId, tenant_id: tenantId },
      });

      if (!incident) {
        throw new NotFoundException({
          code: 'INCIDENT_NOT_FOUND',
          message: `Critical incident ${incidentId} not found`,
        });
      }

      const plan = parseResponsePlan(incident.response_plan);

      return VALID_PHASES.map((phase) => {
        const items = plan[phase];
        const total = items.length;
        const completed = items.filter((item) => item.is_done).length;
        return {
          phase,
          total,
          completed,
          percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      });
    })) as ResponsePlanPhaseProgress[];

    return { data: progress };
  }

  // ─── EXTERNAL SUPPORT: ADD ──────────────────────────────────────────────────

  async addExternalSupport(
    tenantId: string,
    incidentId: string,
    recordedById: string,
    dto: AddExternalSupportDto,
  ): Promise<{ data: ExternalSupportEntry }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: recordedById,
    });

    const entry = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const incident = await db.criticalIncident.findFirst({
        where: { id: incidentId, tenant_id: tenantId },
      });

      if (!incident) {
        throw new NotFoundException({
          code: 'INCIDENT_NOT_FOUND',
          message: `Critical incident ${incidentId} not found`,
        });
      }

      const log = parseExternalSupportLog(incident.external_support_log);

      const newEntry: ExternalSupportEntry = {
        id: randomUUID(),
        provider_type: dto.provider_type,
        provider_name: dto.provider_name,
        contact_person: dto.contact_person ?? null,
        contact_details: dto.contact_details ?? null,
        visit_date: dto.visit_date ?? null,
        visit_time_start: dto.visit_time_start ?? null,
        visit_time_end: dto.visit_time_end ?? null,
        availability_notes: dto.availability_notes ?? null,
        students_seen: dto.students_seen ?? [],
        outcome_notes: dto.outcome_notes ?? null,
        recorded_by_id: recordedById,
        recorded_at: new Date().toISOString(),
      };

      log.push(newEntry);

      await db.criticalIncident.update({
        where: { id: incidentId },
        data: {
          external_support_log: log as unknown as Prisma.InputJsonValue,
        },
      });

      return newEntry;
    })) as ExternalSupportEntry;

    // Fire-and-forget: audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'external_support_added',
      entity_type: 'critical_incident',
      entity_id: incidentId,
      student_id: null,
      actor_user_id: recordedById,
      tier: 3,
      payload: {
        incident_id: incidentId,
        entry_id: entry.id,
        provider_type: dto.provider_type,
        provider_name: dto.provider_name,
      },
      ip_address: null,
    });

    return { data: entry };
  }

  // ─── EXTERNAL SUPPORT: UPDATE ───────────────────────────────────────────────

  async updateExternalSupport(
    tenantId: string,
    incidentId: string,
    entryId: string,
    updatedById: string,
    dto: Partial<AddExternalSupportDto>,
  ): Promise<{ data: ExternalSupportEntry }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: updatedById,
    });

    const updatedEntry = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const incident = await db.criticalIncident.findFirst({
        where: { id: incidentId, tenant_id: tenantId },
      });

      if (!incident) {
        throw new NotFoundException({
          code: 'INCIDENT_NOT_FOUND',
          message: `Critical incident ${incidentId} not found`,
        });
      }

      const log = parseExternalSupportLog(incident.external_support_log);
      const entryIndex = log.findIndex((e) => e.id === entryId);

      if (entryIndex === -1) {
        throw new NotFoundException({
          code: 'EXTERNAL_SUPPORT_ENTRY_NOT_FOUND',
          message: `External support entry ${entryId} not found`,
        });
      }

      const existingEntry = log[entryIndex];
      if (!existingEntry) {
        throw new NotFoundException({
          code: 'EXTERNAL_SUPPORT_ENTRY_NOT_FOUND',
          message: `External support entry ${entryId} not found`,
        });
      }

      const entry: ExternalSupportEntry = { ...existingEntry };

      // Apply partial updates
      if (dto.provider_type !== undefined) entry.provider_type = dto.provider_type;
      if (dto.provider_name !== undefined) entry.provider_name = dto.provider_name;
      if (dto.contact_person !== undefined) entry.contact_person = dto.contact_person ?? null;
      if (dto.contact_details !== undefined) entry.contact_details = dto.contact_details ?? null;
      if (dto.visit_date !== undefined) entry.visit_date = dto.visit_date ?? null;
      if (dto.visit_time_start !== undefined) entry.visit_time_start = dto.visit_time_start ?? null;
      if (dto.visit_time_end !== undefined) entry.visit_time_end = dto.visit_time_end ?? null;
      if (dto.availability_notes !== undefined) entry.availability_notes = dto.availability_notes ?? null;
      if (dto.students_seen !== undefined) entry.students_seen = dto.students_seen ?? [];
      if (dto.outcome_notes !== undefined) entry.outcome_notes = dto.outcome_notes ?? null;

      log[entryIndex] = entry;

      await db.criticalIncident.update({
        where: { id: incidentId },
        data: {
          external_support_log: log as unknown as Prisma.InputJsonValue,
        },
      });

      return entry;
    })) as ExternalSupportEntry;

    // Fire-and-forget: audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'external_support_updated',
      entity_type: 'critical_incident',
      entity_id: incidentId,
      student_id: null,
      actor_user_id: updatedById,
      tier: 3,
      payload: {
        incident_id: incidentId,
        entry_id: entryId,
        changed_fields: Object.keys(dto),
      },
      ip_address: null,
    });

    return { data: updatedEntry };
  }

  // ─── EXTERNAL SUPPORT: LIST ─────────────────────────────────────────────────

  async listExternalSupport(
    tenantId: string,
    incidentId: string,
  ): Promise<{ data: ExternalSupportEntry[] }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const entries = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const incident = await db.criticalIncident.findFirst({
        where: { id: incidentId, tenant_id: tenantId },
      });

      if (!incident) {
        throw new NotFoundException({
          code: 'INCIDENT_NOT_FOUND',
          message: `Critical incident ${incidentId} not found`,
        });
      }

      const log = parseExternalSupportLog(incident.external_support_log);

      // Sort by visit_date DESC, then recorded_at DESC
      return log.sort((a, b) => {
        const dateA = a.visit_date ?? '';
        const dateB = b.visit_date ?? '';
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        return b.recorded_at.localeCompare(a.recorded_at);
      });
    })) as ExternalSupportEntry[];

    return { data: entries };
  }
}
