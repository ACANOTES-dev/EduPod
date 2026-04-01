import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import {
  type CreateExclusionCaseDto,
  type ExclusionCaseListQuery,
  type ExclusionStatusKey,
  type RecordExclusionDecisionDto,
  type UpdateExclusionCaseDto,
  addSchoolDays,
  buildStatutoryTimeline,
  type ClosureChecker,
  computeTimelineStatuses,
  isValidExclusionTransition,
} from '@school/shared';
import { Queue } from 'bullmq';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { BehaviourDocumentService } from './behaviour-document.service';
import { BehaviourHistoryService } from './behaviour-history.service';

/** Map sanction type to exclusion case type */
const SANCTION_TO_EXCLUSION_TYPE: Record<string, $Enums.ExclusionType> = {
  suspension_external: 'suspension_extended',
  expulsion: 'expulsion',
};

@Injectable()
export class BehaviourExclusionCasesService {
  private readonly logger = new Logger(BehaviourExclusionCasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly historyService: BehaviourHistoryService,
    @Optional() private readonly documentService: BehaviourDocumentService | null,
    // TODO(M-17): Migrate to BehaviourSideEffectsService
    @InjectQueue('behaviour') private readonly behaviourQueue: Queue,
  ) {}

  // ─── Create from Sanction (auto-creation, within existing tx) ──────────

  async createFromSanction(tenantId: string, sanctionId: string, tx: PrismaService) {
    // Idempotency: check if case already exists for this sanction
    const existing = await tx.behaviourExclusionCase.findFirst({
      where: { tenant_id: tenantId, sanction_id: sanctionId },
    });
    if (existing) return existing;

    // Load the sanction
    const sanction = await tx.behaviourSanction.findFirst({
      where: { id: sanctionId, tenant_id: tenantId },
      include: {
        incident: { select: { id: true } },
      },
    });
    if (!sanction) {
      throw new NotFoundException({
        code: 'SANCTION_NOT_FOUND',
        message: 'Sanction not found for exclusion case creation',
      });
    }

    // Map sanction type to exclusion type
    const exclusionType = SANCTION_TO_EXCLUSION_TYPE[sanction.type] ?? 'suspension_extended';

    // Generate case number
    const caseNumber = await this.sequenceService.nextNumber(
      tenantId,
      'behaviour_exclusion',
      tx,
      'EX',
    );

    // Compute statutory timeline deadlines
    const closureChecker = this.buildClosureChecker(tx, tenantId);
    const now = new Date();

    // Notice deadline: 3 school days from now
    const noticeDeadline = await addSchoolDays(now, 3, closureChecker);
    // Hearing deadline: 10 school days from now (minimum 5 days notice to parents)
    const hearingDeadline = await addSchoolDays(now, 10, closureChecker);

    const noticeDeadlineStr = noticeDeadline.toISOString().split('T')[0] ?? '';
    const hearingDeadlineStr = hearingDeadline.toISOString().split('T')[0] ?? '';

    const statutoryTimeline = buildStatutoryTimeline(
      exclusionType,
      noticeDeadlineStr,
      hearingDeadlineStr,
    );

    const exclusionCase = await tx.behaviourExclusionCase.create({
      data: {
        tenant_id: tenantId,
        case_number: caseNumber,
        sanction_id: sanctionId,
        incident_id: sanction.incident_id,
        student_id: sanction.student_id,
        type: exclusionType,
        status: 'initiated',
        statutory_timeline: statutoryTimeline as unknown as Prisma.InputJsonValue,
      },
    });

    // Record history
    await this.historyService.recordHistory(
      tx,
      tenantId,
      'exclusion_case',
      exclusionCase.id,
      sanction.student_id,
      'created',
      null,
      {
        case_number: caseNumber,
        type: exclusionType,
        source: 'auto_from_sanction',
        sanction_id: sanctionId,
      },
    );

    // Set legal hold on linked incident
    await tx.behaviourIncident.update({
      where: { id: sanction.incident_id },
      data: { retention_status: 'legal_hold' as $Enums.RetentionStatus },
    });

    // Set legal hold on the sanction
    await tx.behaviourSanction.update({
      where: { id: sanctionId },
      data: { retention_status: 'legal_hold' as $Enums.RetentionStatus },
    });

    // Create an appeal_review task for the case
    await tx.behaviourTask.create({
      data: {
        tenant_id: tenantId,
        task_type: 'appeal_review',
        entity_type: 'exclusion_case' as $Enums.BehaviourTaskEntityType,
        entity_id: exclusionCase.id,
        title: `Review exclusion case ${caseNumber} — statutory timeline`,
        assigned_to_id: sanction.student_id, // placeholder — will be reassigned by admin
        created_by_id: sanction.student_id, // system-generated
        priority: 'critical' as $Enums.TaskPriority,
        status: 'pending',
        due_date: noticeDeadline,
      },
    });

    // Auto-generate exclusion notice if enabled
    try {
      const tenantSettingRow = await tx.tenantSetting.findFirst({
        where: { tenant_id: tenantId },
        select: { settings: true },
      });
      const rawSettings = (tenantSettingRow?.settings as Record<string, unknown>) ?? {};
      const behaviourSettings = (rawSettings.behaviour as Record<string, unknown>) ?? {};

      if (behaviourSettings.document_auto_generate_exclusion_notice !== false) {
        if (this.documentService) {
          await this.documentService.autoGenerateDocument(
            tx,
            tenantId,
            sanction.student_id,
            'exclusion_notice',
            'exclusion_case',
            exclusionCase.id,
            exclusionCase.student_id,
            'en',
          );
        }
      }
    } catch {
      // Don't fail exclusion creation if document generation fails
    }

    return exclusionCase;
  }

  // ─── Create (manual from sanction) ─────────────────────────────────────

  async create(tenantId: string, dto: CreateExclusionCaseDto, _userId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;
        return this.createFromSanction(tenantId, dto.sanction_id, db);
      },
      { timeout: 30000 },
    );
  }

  // ─── List ──────────────────────────────────────────────────────────────

  async list(tenantId: string, query: ExclusionCaseListQuery) {
    const where: Prisma.BehaviourExclusionCaseWhereInput = {
      tenant_id: tenantId,
    };

    if (query.status) where.status = query.status as $Enums.ExclusionStatus;
    if (query.type) where.type = query.type as $Enums.ExclusionType;
    if (query.student_id) where.student_id = query.student_id;
    if (query.has_appeal !== undefined) {
      if (query.has_appeal) {
        where.appeal_id = { not: null };
      } else {
        where.appeal_id = null;
      }
    }
    if (query.appeal_deadline_before) {
      where.appeal_deadline = {
        lte: new Date(query.appeal_deadline_before),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.behaviourExclusionCase.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              year_group: { select: { id: true, name: true } },
            },
          },
          sanction: {
            select: {
              id: true,
              sanction_number: true,
              type: true,
            },
          },
          decided_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.behaviourExclusionCase.count({ where }),
    ]);

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  // ─── Get by ID ─────────────────────────────────────────────────────────

  async getById(tenantId: string, id: string) {
    const exclusionCase = await this.prisma.behaviourExclusionCase.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            year_group: { select: { id: true, name: true } },
          },
        },
        sanction: {
          select: {
            id: true,
            sanction_number: true,
            type: true,
            status: true,
            scheduled_date: true,
            suspension_start_date: true,
            suspension_end_date: true,
            suspension_days: true,
          },
        },
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
        decided_by: {
          select: { id: true, first_name: true, last_name: true },
        },
        appeal: {
          select: {
            id: true,
            appeal_number: true,
            status: true,
            grounds_category: true,
            submitted_at: true,
            decision: true,
          },
        },
      },
    });

    if (!exclusionCase) {
      throw new NotFoundException({
        code: 'EXCLUSION_CASE_NOT_FOUND',
        message: 'Exclusion case not found',
      });
    }

    return exclusionCase;
  }

  // ─── Update ────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: UpdateExclusionCaseDto, userId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const exclusionCase = await db.behaviourExclusionCase.findFirst({
        where: { id, tenant_id: tenantId },
      });
      if (!exclusionCase) {
        throw new NotFoundException({
          code: 'EXCLUSION_CASE_NOT_FOUND',
          message: 'Exclusion case not found',
        });
      }

      // Build diff for history
      const previousValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(dto)) {
        if (value === undefined) continue;
        const currentVal = (exclusionCase as unknown as Record<string, unknown>)[key];
        if (JSON.stringify(currentVal) !== JSON.stringify(value)) {
          previousValues[key] = currentVal;
          newValues[key] = value;
        }
      }

      if (Object.keys(newValues).length === 0) return exclusionCase;

      const updated = await db.behaviourExclusionCase.update({
        where: { id },
        data: {
          ...(dto.hearing_date !== undefined
            ? { hearing_date: dto.hearing_date ? new Date(dto.hearing_date) : null }
            : {}),
          ...(dto.hearing_attendees !== undefined
            ? {
                hearing_attendees: dto.hearing_attendees as unknown as Prisma.InputJsonValue,
              }
            : {}),
          ...(dto.student_representation !== undefined
            ? { student_representation: dto.student_representation ?? null }
            : {}),
          ...(dto.conditions_for_return !== undefined
            ? { conditions_for_return: dto.conditions_for_return ?? null }
            : {}),
          ...(dto.conditions_for_transfer !== undefined
            ? { conditions_for_transfer: dto.conditions_for_transfer ?? null }
            : {}),
        },
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'exclusion_case',
        id,
        userId,
        'updated',
        previousValues,
        newValues,
      );

      return updated;
    });
  }

  // ─── Status Transition ─────────────────────────────────────────────────

  async transitionStatus(
    tenantId: string,
    id: string,
    newStatus: ExclusionStatusKey,
    reason: string | undefined,
    userId: string,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const exclusionCase = await db.behaviourExclusionCase.findFirst({
        where: { id, tenant_id: tenantId },
      });
      if (!exclusionCase) {
        throw new NotFoundException({
          code: 'EXCLUSION_CASE_NOT_FOUND',
          message: 'Exclusion case not found',
        });
      }

      const currentStatus = exclusionCase.status as ExclusionStatusKey;
      if (!isValidExclusionTransition(currentStatus, newStatus)) {
        throw new BadRequestException({
          code: 'INVALID_TRANSITION',
          message: `Cannot transition from "${currentStatus}" to "${newStatus}"`,
        });
      }

      const updateData: Prisma.BehaviourExclusionCaseUpdateInput = {
        status: newStatus as $Enums.ExclusionStatus,
      };

      // Handle special side-effects per status
      if (newStatus === 'notice_issued') {
        updateData.formal_notice_issued_at = new Date();

        // Update statutory timeline step
        await this.markTimelineStepComplete(db, id, 'Written notice to parents');
      }

      if (newStatus === 'hearing_held') {
        await this.markTimelineStepComplete(db, id, 'Hearing held');
      }

      const updated = await db.behaviourExclusionCase.update({
        where: { id },
        data: updateData,
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'exclusion_case',
        id,
        userId,
        'status_changed',
        { status: currentStatus },
        { status: newStatus },
        reason,
      );

      return updated;
    });
  }

  // ─── Generate Notice (stub — Phase G) ─────────────────────────────────

  async generateNotice(
    _tenantId: string,
    _id: string,
    _userId: string,
  ): Promise<{ status: string; message: string }> {
    return {
      status: 'not_implemented',
      message:
        'Document generation via Puppeteer is planned for Phase G. ' +
        'This endpoint is a placeholder.',
    };
  }

  // ─── Generate Board Pack (stub — Phase G) ──────────────────────────────

  async generateBoardPack(
    _tenantId: string,
    _id: string,
    _userId: string,
  ): Promise<{ status: string; message: string }> {
    return {
      status: 'not_implemented',
      message:
        'Board pack generation via Puppeteer is planned for Phase G. ' +
        'This endpoint is a placeholder.',
    };
  }

  // ─── Record Decision ───────────────────────────────────────────────────

  async recordDecision(
    tenantId: string,
    id: string,
    dto: RecordExclusionDecisionDto,
    userId: string,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const exclusionCase = await db.behaviourExclusionCase.findFirst({
        where: { id, tenant_id: tenantId },
      });
      if (!exclusionCase) {
        throw new NotFoundException({
          code: 'EXCLUSION_CASE_NOT_FOUND',
          message: 'Exclusion case not found',
        });
      }

      // Must be in hearing_held or decision_made to record a decision
      const currentStatus = exclusionCase.status as ExclusionStatusKey;
      if (currentStatus !== 'hearing_held' && currentStatus !== 'decision_made') {
        throw new BadRequestException({
          code: 'INVALID_STATE_FOR_DECISION',
          message: `Cannot record decision in status "${currentStatus}". Must be "hearing_held" or "decision_made".`,
        });
      }

      // Compute appeal deadline: 15 school days from decision date
      const closureChecker = this.buildClosureChecker(db, tenantId);
      const decisionDate = new Date();
      const appealDeadline = await addSchoolDays(decisionDate, 15, closureChecker);

      const updated = await db.behaviourExclusionCase.update({
        where: { id },
        data: {
          decision: dto.decision as $Enums.ExclusionDecision,
          decision_date: decisionDate,
          decision_reasoning: dto.decision_reasoning,
          decided_by_id: dto.decided_by_id,
          conditions_for_return: dto.conditions_for_return ?? null,
          conditions_for_transfer: dto.conditions_for_transfer ?? null,
          appeal_deadline: appealDeadline,
          status: 'appeal_window',
        },
      });

      // Mark timeline steps
      await this.markTimelineStepComplete(db, id, 'Decision communicated to parents in writing');

      // Update the appeal window step with the computed deadline
      const appealDeadlineStr = appealDeadline.toISOString().split('T')[0] ?? '';
      await this.updateTimelineStepDeadline(
        db,
        id,
        'Appeal window (15 school days from decision date)',
        appealDeadlineStr,
      );

      await this.historyService.recordHistory(
        db,
        tenantId,
        'exclusion_case',
        id,
        userId,
        'decision_recorded',
        { status: currentStatus, decision: null },
        {
          status: 'appeal_window',
          decision: dto.decision,
          appeal_deadline: appealDeadlineStr,
        },
      );

      return updated;
    });
  }

  // ─── Get Timeline ──────────────────────────────────────────────────────

  async getTimeline(tenantId: string, id: string) {
    const exclusionCase = await this.prisma.behaviourExclusionCase.findFirst({
      where: { id, tenant_id: tenantId },
      select: { statutory_timeline: true },
    });

    if (!exclusionCase) {
      throw new NotFoundException({
        code: 'EXCLUSION_CASE_NOT_FOUND',
        message: 'Exclusion case not found',
      });
    }

    const rawTimeline = (exclusionCase.statutory_timeline ?? []) as Array<{
      step: string;
      required_by: string | null;
      completed_at: string | null;
      status: string;
    }>;

    const computed = computeTimelineStatuses(rawTimeline);

    return { data: computed };
  }

  // ─── Get Documents (stub) ──────────────────────────────────────────────

  async getDocuments(tenantId: string, id: string) {
    // Verify case exists
    const exclusionCase = await this.prisma.behaviourExclusionCase.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!exclusionCase) {
      throw new NotFoundException({
        code: 'EXCLUSION_CASE_NOT_FOUND',
        message: 'Exclusion case not found',
      });
    }

    // Return documents linked to this exclusion case
    const documents = await this.prisma.behaviourDocument.findMany({
      where: {
        tenant_id: tenantId,
        entity_type: 'exclusion_case',
        entity_id: id,
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        document_type: true,
        generated_at: true,
        status: true,
        locale: true,
        generated_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    return { data: documents };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

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

  private async markTimelineStepComplete(
    db: PrismaService,
    caseId: string,
    stepName: string,
  ): Promise<void> {
    const exclusionCase = await db.behaviourExclusionCase.findUnique({
      where: { id: caseId },
      select: { statutory_timeline: true },
    });
    if (!exclusionCase) return;

    const timeline = (exclusionCase.statutory_timeline ?? []) as Array<{
      step: string;
      required_by: string | null;
      completed_at: string | null;
      status: string;
    }>;

    const updatedTimeline = timeline.map((entry) => {
      if (entry.step === stepName && !entry.completed_at) {
        return {
          ...entry,
          completed_at: new Date().toISOString(),
          status: 'complete',
        };
      }
      return entry;
    });

    await db.behaviourExclusionCase.update({
      where: { id: caseId },
      data: {
        statutory_timeline: updatedTimeline as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async updateTimelineStepDeadline(
    db: PrismaService,
    caseId: string,
    stepName: string,
    deadline: string,
  ): Promise<void> {
    const exclusionCase = await db.behaviourExclusionCase.findUnique({
      where: { id: caseId },
      select: { statutory_timeline: true },
    });
    if (!exclusionCase) return;

    const timeline = (exclusionCase.statutory_timeline ?? []) as Array<{
      step: string;
      required_by: string | null;
      completed_at: string | null;
      status: string;
    }>;

    const updatedTimeline = timeline.map((entry) => {
      if (entry.step === stepName) {
        return { ...entry, required_by: deadline };
      }
      return entry;
    });

    await db.behaviourExclusionCase.update({
      where: { id: caseId },
      data: {
        statutory_timeline: updatedTimeline as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
