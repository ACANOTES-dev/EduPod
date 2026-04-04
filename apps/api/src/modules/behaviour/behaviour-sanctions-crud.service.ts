import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import {
  type CreateSanctionDto,
  EXCLUSION_SUSPENSION_DAY_THRESHOLD,
  EXCLUSION_TRIGGER_TYPES,
  SANCTION_PARENT_VISIBLE_FIELDS,
  type SanctionListQuery,
  SUSPENSION_TYPES,
  type UpdateSanctionDto,
  behaviourSettingsSchema,
  type BehaviourSettings,
  type ClosureChecker,
} from '@school/shared/behaviour';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { BehaviourDocumentService } from './behaviour-document.service';
import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourSideEffectsService } from './behaviour-side-effects.service';

// ─── Sanction CRUD operations ─────────────────────────────────────────────────

@Injectable()
export class BehaviourSanctionsCrudService {
  private readonly logger = new Logger(BehaviourSanctionsCrudService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly historyService: BehaviourHistoryService,
    @Optional() private readonly documentService: BehaviourDocumentService | null,
    private readonly sideEffects: BehaviourSideEffectsService,
  ) {}

  // ─── Create (manual) ────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateSanctionDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        // Validate incident exists
        const incident = await db.behaviourIncident.findFirst({
          where: { id: dto.incident_id, tenant_id: tenantId },
        });
        if (!incident) {
          throw new NotFoundException({
            code: 'INCIDENT_NOT_FOUND',
            message: 'Incident not found',
          });
        }

        // Validate student exists
        const student = await db.student.findFirst({
          where: { id: dto.student_id, tenant_id: tenantId },
        });
        if (!student) {
          throw new NotFoundException({
            code: 'STUDENT_NOT_FOUND',
            message: 'Student not found',
          });
        }

        // Generate sanction number
        const sanctionNumber = await this.sequenceService.nextNumber(
          tenantId,
          'behaviour_sanction',
          tx,
          'SN',
        );

        // Load behaviour settings to check approval requirements
        const settings = await this.loadBehaviourSettings(db, tenantId);
        const needsApproval = this.requiresApproval(dto.type, settings);

        const initialStatus: $Enums.SanctionStatus = needsApproval
          ? 'pending_approval'
          : 'scheduled';

        // Compute suspension days for suspension types
        let suspensionDays: number | null = null;
        if (
          this.isSuspensionType(dto.type) &&
          dto.suspension_start_date &&
          dto.suspension_end_date
        ) {
          suspensionDays = await this.computeSuspensionDays(
            db,
            tenantId,
            new Date(dto.suspension_start_date),
            new Date(dto.suspension_end_date),
          );
        }

        const sanction = await db.behaviourSanction.create({
          data: {
            tenant_id: tenantId,
            sanction_number: sanctionNumber,
            incident_id: dto.incident_id,
            student_id: dto.student_id,
            type: dto.type as $Enums.SanctionType,
            status: initialStatus,
            scheduled_date: new Date(dto.scheduled_date),
            scheduled_start_time: dto.scheduled_start_time
              ? new Date(`1970-01-01T${dto.scheduled_start_time}`)
              : null,
            scheduled_end_time: dto.scheduled_end_time
              ? new Date(`1970-01-01T${dto.scheduled_end_time}`)
              : null,
            scheduled_room_id: dto.scheduled_room_id ?? null,
            supervised_by_id: dto.supervised_by_id ?? null,
            suspension_start_date: dto.suspension_start_date
              ? new Date(dto.suspension_start_date)
              : null,
            suspension_end_date: dto.suspension_end_date ? new Date(dto.suspension_end_date) : null,
            suspension_days: suspensionDays,
            return_conditions: dto.return_conditions ?? null,
            parent_meeting_required: dto.parent_meeting_required ?? false,
            notes: dto.notes ?? null,
          },
        });

        // Record history
        await this.historyService.recordHistory(
          db,
          tenantId,
          'sanction',
          sanction.id,
          userId,
          'created',
          null,
          {
            status: initialStatus,
            type: dto.type,
            sanction_number: sanctionNumber,
          },
        );

        // Auto-generate document if enabled
        try {
          const sanctionType = dto.type;
          let docType: string | null = null;

          if (sanctionType === 'detention' && settings.document_auto_generate_detention_notice) {
            docType = 'detention_notice';
          } else if (
            (sanctionType === 'suspension_internal' || sanctionType === 'suspension_external') &&
            settings.document_auto_generate_suspension_letter !== false // default on
          ) {
            docType = 'suspension_letter';
          }

          if (docType && this.documentService) {
            await this.documentService.autoGenerateDocument(
              db,
              tenantId,
              userId,
              docType,
              'sanction',
              sanction.id,
              sanction.student_id,
              'en',
            );
          }
        } catch (err) {
          // Don't fail sanction creation if document generation fails
          this.logger.error(
            '[create] Document generation failed',
            err instanceof Error ? err.stack : String(err),
          );
        }

        // Enqueue parent notification (best-effort)
        await this.sideEffects.emitSanctionParentNotification({
          tenant_id: tenantId,
          sanction_id: sanction.id,
          student_id: dto.student_id,
        });

        // Check if exclusion case should auto-create
        await this.checkAutoCreateExclusionCase(tenantId, sanction.id, dto.type, suspensionDays);

        return db.behaviourSanction.findUnique({
          where: { id: sanction.id },
          include: {
            incident: { select: { id: true, incident_number: true } },
            student: {
              select: { id: true, first_name: true, last_name: true },
            },
            supervised_by: {
              select: { id: true, first_name: true, last_name: true },
            },
          },
        });
      },
      { timeout: 30000 },
    );
  }

  // ─── Create from policy engine (within existing transaction) ───────────

  async createFromPolicy(
    tenantId: string,
    data: {
      incident_id: string;
      student_id: string;
      type: string;
      scheduled_date: Date;
      notes: string | null;
      created_by_id: string;
    },
    tx: PrismaService,
  ) {
    // Dedup: check for existing sanction of same type on same incident+student
    const existing = await tx.behaviourSanction.findFirst({
      where: {
        tenant_id: tenantId,
        incident_id: data.incident_id,
        student_id: data.student_id,
        type: data.type as $Enums.SanctionType,
      },
    });
    if (existing) return existing;

    // Generate sanction number
    const sanctionNumber = await this.sequenceService.nextNumber(
      tenantId,
      'behaviour_sanction',
      tx,
      'SN',
    );

    // Load settings to check approval requirements
    const settings = await this.loadBehaviourSettings(tx, tenantId);
    const needsApproval = this.requiresApproval(data.type, settings);

    const initialStatus: $Enums.SanctionStatus = needsApproval ? 'pending_approval' : 'scheduled';

    const sanction = await tx.behaviourSanction.create({
      data: {
        tenant_id: tenantId,
        sanction_number: sanctionNumber,
        incident_id: data.incident_id,
        student_id: data.student_id,
        type: data.type as $Enums.SanctionType,
        status: initialStatus,
        scheduled_date: data.scheduled_date,
        notes: data.notes,
      },
    });

    // Record history
    await this.historyService.recordHistory(
      tx,
      tenantId,
      'sanction',
      sanction.id,
      data.created_by_id,
      'created',
      null,
      {
        status: initialStatus,
        type: data.type,
        sanction_number: sanctionNumber,
        source: 'policy_engine',
      },
    );

    // Check if exclusion case should auto-create
    await this.checkAutoCreateExclusionCase(tenantId, sanction.id, data.type, null);

    return sanction;
  }

  // ─── List ──────────────────────────────────────────────────────────────

  async list(tenantId: string, query: SanctionListQuery) {
    const where: Prisma.BehaviourSanctionWhereInput = {
      tenant_id: tenantId,
      retention_status: 'active',
    };

    if (query.student_id) where.student_id = query.student_id;
    if (query.type) where.type = query.type as $Enums.SanctionType;
    if (query.status) where.status = query.status as $Enums.SanctionStatus;
    if (query.supervised_by_id) where.supervised_by_id = query.supervised_by_id;
    if (query.incident_id) where.incident_id = query.incident_id;
    if (query.date_from || query.date_to) {
      const scheduledDate: Record<string, Date> = {};
      if (query.date_from) scheduledDate.gte = new Date(query.date_from);
      if (query.date_to) scheduledDate.lte = new Date(query.date_to);
      where.scheduled_date = scheduledDate;
    }

    const [data, total] = await Promise.all([
      this.prisma.behaviourSanction.findMany({
        where,
        orderBy: { scheduled_date: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          incident: {
            select: { id: true, incident_number: true, description: true },
          },
          student: {
            select: { id: true, first_name: true, last_name: true },
          },
          supervised_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.behaviourSanction.count({ where }),
    ]);

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  // ─── Get by ID ─────────────────────────────────────────────────────────

  async getById(tenantId: string, id: string) {
    const sanction = await this.prisma.behaviourSanction.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        incident: {
          select: {
            id: true,
            incident_number: true,
            description: true,
            category: {
              select: { id: true, name: true, severity: true },
            },
          },
        },
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            year_group: { select: { id: true, name: true } },
          },
        },
        supervised_by: {
          select: { id: true, first_name: true, last_name: true },
        },
        served_by: {
          select: { id: true, first_name: true, last_name: true },
        },
        scheduled_room: {
          select: { id: true, name: true },
        },
        replaced_by: {
          select: { id: true, sanction_number: true, status: true },
        },
        appeals: {
          select: {
            id: true,
            appeal_number: true,
            status: true,
            grounds_category: true,
            submitted_at: true,
          },
        },
        exclusion_cases: {
          select: {
            id: true,
            case_number: true,
            status: true,
            type: true,
          },
        },
      },
    });

    if (!sanction) {
      throw new NotFoundException({
        code: 'SANCTION_NOT_FOUND',
        message: 'Sanction not found',
      });
    }

    return sanction;
  }

  // ─── Update ────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: UpdateSanctionDto, userId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const sanction = await db.behaviourSanction.findFirst({
        where: { id, tenant_id: tenantId },
      });
      if (!sanction) {
        throw new NotFoundException({
          code: 'SANCTION_NOT_FOUND',
          message: 'Sanction not found',
        });
      }

      // Build diff for history
      const previousValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};
      const parentVisibleChanged: string[] = [];

      for (const [key, value] of Object.entries(dto)) {
        if (value === undefined) continue;
        const currentVal = (sanction as unknown as Record<string, unknown>)[key];
        if (currentVal !== value) {
          previousValues[key] = currentVal;
          newValues[key] = value;

          if (
            SANCTION_PARENT_VISIBLE_FIELDS.includes(
              key as (typeof SANCTION_PARENT_VISIBLE_FIELDS)[number],
            )
          ) {
            parentVisibleChanged.push(key);
          }
        }
      }

      if (Object.keys(newValues).length === 0) return sanction;

      const updated = await db.behaviourSanction.update({
        where: { id },
        data: {
          ...(dto.scheduled_date !== undefined
            ? { scheduled_date: new Date(dto.scheduled_date) }
            : {}),
          ...(dto.scheduled_start_time !== undefined
            ? {
                scheduled_start_time: dto.scheduled_start_time
                  ? new Date(`1970-01-01T${dto.scheduled_start_time}`)
                  : null,
              }
            : {}),
          ...(dto.scheduled_end_time !== undefined
            ? {
                scheduled_end_time: dto.scheduled_end_time
                  ? new Date(`1970-01-01T${dto.scheduled_end_time}`)
                  : null,
              }
            : {}),
          ...(dto.scheduled_room_id !== undefined
            ? { scheduled_room_id: dto.scheduled_room_id ?? null }
            : {}),
          ...(dto.supervised_by_id !== undefined
            ? { supervised_by_id: dto.supervised_by_id ?? null }
            : {}),
          ...(dto.return_conditions !== undefined
            ? { return_conditions: dto.return_conditions ?? null }
            : {}),
          ...(dto.parent_meeting_required !== undefined
            ? { parent_meeting_required: dto.parent_meeting_required }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
        },
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'sanction',
        id,
        userId,
        'updated',
        previousValues,
        newValues,
      );

      // Trigger amendment workflow if parent-visible fields changed
      if (parentVisibleChanged.length > 0) {
        await this.createAmendmentNotice(
          db,
          tenantId,
          id,
          userId,
          previousValues,
          newValues,
          parentVisibleChanged,
        );
      }

      return updated;
    });
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

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

  private requiresApproval(type: string, settings: BehaviourSettings): boolean {
    if (
      (type === 'suspension_internal' || type === 'suspension_external' || type === 'expulsion') &&
      settings.suspension_requires_approval
    ) {
      return true;
    }
    if (type === 'expulsion' && settings.expulsion_requires_approval) {
      return true;
    }
    return false;
  }

  private isSuspensionType(type: string): boolean {
    return (SUSPENSION_TYPES as readonly string[]).includes(type);
  }

  private async computeSuspensionDays(
    db: PrismaService,
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const closureChecker = this.buildClosureChecker(db, tenantId);

    let days = 0;
    const current = new Date(startDate);
    while (current <= endDate) {
      const isWeekend = [0, 6].includes(current.getDay());
      if (!isWeekend) {
        const isClosure = await closureChecker(current);
        if (!isClosure) {
          days++;
        }
      }
      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  private buildClosureChecker(db: PrismaService, tenantId: string): ClosureChecker {
    return async (date: Date): Promise<boolean> => {
      const dateStr = date.toISOString().split('T')[0] ?? '';
      const closure = await db.schoolClosure.findFirst({
        where: {
          tenant_id: tenantId,
          closure_date: new Date(dateStr),
        },
      });
      return closure !== null;
    };
  }

  private async checkAutoCreateExclusionCase(
    tenantId: string,
    sanctionId: string,
    sanctionType: string,
    suspensionDays: number | null,
  ): Promise<void> {
    // Only trigger for external suspension (with enough days) or expulsion
    if (!(EXCLUSION_TRIGGER_TYPES as readonly string[]).includes(sanctionType)) {
      return;
    }

    if (
      sanctionType === 'suspension_external' &&
      (suspensionDays === null || suspensionDays < EXCLUSION_SUSPENSION_DAY_THRESHOLD)
    ) {
      return;
    }

    // Enqueue exclusion case creation (best-effort)
    await this.sideEffects.emitCreateExclusionCase({
      tenant_id: tenantId,
      sanction_id: sanctionId,
    });
  }

  private async createAmendmentNotice(
    db: PrismaService,
    tenantId: string,
    sanctionId: string,
    userId: string,
    previousValues: Record<string, unknown>,
    newValues: Record<string, unknown>,
    changedFields: string[],
  ): Promise<void> {
    const whatChanged = changedFields.map((field) => ({
      field,
      old_value: previousValues[field] != null ? String(previousValues[field]) : null,
      new_value: newValues[field] != null ? String(newValues[field]) : null,
    }));

    await db.behaviourAmendmentNotice.create({
      data: {
        tenant_id: tenantId,
        entity_type: 'sanction',
        entity_id: sanctionId,
        amendment_type: 'correction',
        what_changed: whatChanged as unknown as Prisma.InputJsonValue,
        change_reason: 'Parent-visible field updated',
        changed_by_id: userId,
      },
    });
  }
}
