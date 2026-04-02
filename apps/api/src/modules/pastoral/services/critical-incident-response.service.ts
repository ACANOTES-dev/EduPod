import { randomUUID } from 'crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../../../../worker/src/base/queue.constants';
import type { PrismaService } from '../../prisma/prisma.service';

import type {
  AddExternalSupportDto,
  AddResponsePlanItemDto,
  ExternalSupportEntry,
  ResponsePlan,
  ResponsePlanItem,
  ResponsePlanPhaseProgress,
  UpdateResponsePlanItemDto,
} from './critical-incident.service';
import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

type ResponsePlanPhase = 'immediate' | 'short_term' | 'medium_term' | 'long_term';

const VALID_PHASES: ResponsePlanPhase[] = ['immediate', 'short_term', 'medium_term', 'long_term'];

// ─── Helpers ────────────────────────────────────────────────────────────────

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
export class CriticalIncidentResponseService {
  private readonly logger = new Logger(CriticalIncidentResponseService.name);

  constructor(
    private readonly eventService: PastoralEventService,
    @InjectQueue(QUEUE_NAMES.PASTORAL) private readonly pastoralQueue: Queue,
  ) {}

  // ─── RESPONSE PLAN: UPDATE ITEM ─────────────────────────────────────────────

  async updateResponsePlanItem(
    db: PrismaService,
    tenantId: string,
    incidentId: string,
    updatedById: string,
    dto: UpdateResponsePlanItemDto,
  ): Promise<ResponsePlan> {
    if (!VALID_PHASES.includes(dto.phase)) {
      throw new BadRequestException({
        code: 'INVALID_PHASE',
        message: `Invalid phase: ${dto.phase}`,
      });
    }

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

    // Notification pathway when an item is assigned to a staff member
    if (dto.assigned_to_id !== undefined && dto.assigned_to_id !== null) {
      void this.pastoralQueue
        .add(
          'pastoral:notify-assigned-staff',
          {
            tenant_id: tenantId,
            incident_id: incidentId,
            item_id: dto.item_id,
            assigned_to_id: dto.assigned_to_id,
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
          },
        )
        .catch((err) =>
          this.logger.error(`Failed to enqueue task notification: ${err.message}`, err.stack),
        );
    }

    return plan;
  }

  // ─── RESPONSE PLAN: ADD ITEM ────────────────────────────────────────────────

  async addResponsePlanItem(
    db: PrismaService,
    tenantId: string,
    incidentId: string,
    addedById: string,
    dto: AddResponsePlanItemDto,
  ): Promise<ResponsePlan> {
    if (!VALID_PHASES.includes(dto.phase)) {
      throw new BadRequestException({
        code: 'INVALID_PHASE',
        message: `Invalid phase: ${dto.phase}`,
      });
    }

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

    return plan;
  }

  // ─── RESPONSE PLAN: PROGRESS ────────────────────────────────────────────────

  async getResponsePlanProgress(
    db: PrismaService,
    tenantId: string,
    incidentId: string,
  ): Promise<ResponsePlanPhaseProgress[]> {
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
  }

  // ─── EXTERNAL SUPPORT: ADD ──────────────────────────────────────────────────

  async addExternalSupport(
    db: PrismaService,
    tenantId: string,
    incidentId: string,
    recordedById: string,
    dto: AddExternalSupportDto,
  ): Promise<ExternalSupportEntry> {
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
        entry_id: newEntry.id,
        provider_type: dto.provider_type,
        provider_name: dto.provider_name,
      },
      ip_address: null,
    });

    return newEntry;
  }

  // ─── EXTERNAL SUPPORT: UPDATE ───────────────────────────────────────────────

  async updateExternalSupport(
    db: PrismaService,
    tenantId: string,
    incidentId: string,
    entryId: string,
    updatedById: string,
    dto: Partial<AddExternalSupportDto>,
  ): Promise<ExternalSupportEntry> {
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
    if (dto.availability_notes !== undefined)
      entry.availability_notes = dto.availability_notes ?? null;
    if (dto.students_seen !== undefined) entry.students_seen = dto.students_seen ?? [];
    if (dto.outcome_notes !== undefined) entry.outcome_notes = dto.outcome_notes ?? null;

    log[entryIndex] = entry;

    await db.criticalIncident.update({
      where: { id: incidentId },
      data: {
        external_support_log: log as unknown as Prisma.InputJsonValue,
      },
    });

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

    return entry;
  }

  // ─── EXTERNAL SUPPORT: LIST ─────────────────────────────────────────────────

  async listExternalSupport(
    db: PrismaService,
    tenantId: string,
    incidentId: string,
  ): Promise<ExternalSupportEntry[]> {
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
  }
}
