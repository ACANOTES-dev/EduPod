import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import {
  type AddStudentToCaseDto,
  type CaseOwnershipTransferDto,
  type CaseStatus,
  type CaseStatusTransitionDto,
  type CreateCaseDto,
  type LinkConcernToCaseDto,
  type UpdateCaseDto,
  getValidCaseTransitions,
  isValidCaseTransition,
} from '@school/shared/pastoral';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AuthReadFacade } from '../../auth/auth-read.facade';

import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../sequence/sequence.service';

import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface CaseRow {
  id: string;
  tenant_id: string;
  student_id: string;
  case_number: string;
  status: $Enums.PastoralCaseStatus;
  owner_user_id: string;
  opened_by_user_id: string;
  opened_reason: string;
  next_review_date: Date | null;
  tier: number;
  legal_hold: boolean;
  resolved_at: Date | null;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  owner?: { first_name: string; last_name: string } | null;
  opened_by?: { first_name: string; last_name: string } | null;
  student?: { id: string; first_name: string; last_name: string } | null;
  concerns?: Array<{
    id: string;
    category: string;
    severity: string;
    tier: number;
    created_at: Date;
    versions?: Array<{
      id: string;
      version_number: number;
      narrative: string;
      created_at: Date;
    }>;
  }>;
  case_students?: Array<{
    student_id: string;
    added_at: Date;
    student?: { id: string; first_name: string; last_name: string };
  }>;
}

export interface CaseListItemDto {
  id: string;
  case_number: string;
  student_id: string;
  student_name: string;
  status: string;
  tier: number;
  owner_user_id: string;
  owner_name: string | null;
  next_review_date: Date | null;
  created_at: Date;
  concern_count: number;
  student_count: number;
}

export interface CaseDetailDto extends CaseListItemDto {
  opened_by_user_id: string;
  opened_by_name: string | null;
  opened_reason: string;
  legal_hold: boolean;
  resolved_at: Date | null;
  closed_at: Date | null;
  updated_at: Date;
  days_open: number;
  concerns: Array<{
    id: string;
    category: string;
    severity: string;
    tier: number;
    created_at: Date;
    latest_narrative: string | null;
  }>;
  students: Array<{
    student_id: string;
    name: string;
    added_at: Date;
    is_primary: boolean;
  }>;
}

export interface OrphanedCaseDto {
  id: string;
  case_number: string;
  status: string;
  owner_user_id: string;
  created_at: Date;
}

// ─── Prisma enum mapping helper ─────────────────────────────────────────────

const STATUS_TO_ENUM: Record<string, $Enums.PastoralCaseStatus> = {
  open: 'open' as $Enums.PastoralCaseStatus,
  active: 'active' as $Enums.PastoralCaseStatus,
  monitoring: 'monitoring' as $Enums.PastoralCaseStatus,
  resolved: 'resolved' as $Enums.PastoralCaseStatus,
  closed: 'closed' as $Enums.PastoralCaseStatus,
};

function toPrismaStatus(status: string): $Enums.PastoralCaseStatus {
  const mapped = STATUS_TO_ENUM[status];
  if (!mapped) {
    throw new BadRequestException({
      code: 'INVALID_STATUS',
      message: `Invalid case status: ${status}`,
    });
  }
  return mapped;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class CaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authReadFacade: AuthReadFacade,
    private readonly sequenceService: SequenceService,
    private readonly eventService: PastoralEventService,
  ) {}

  // ─── CREATE ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateCaseDto): Promise<{ data: CaseRow }> {
    if (dto.concern_ids.length < 1) {
      throw new BadRequestException({
        code: 'MIN_ONE_CONCERN',
        message: 'A case must have at least one linked concern',
      });
    }

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const created = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 1. Validate all concern_ids exist and belong to this tenant
      const concerns = await db.pastoralConcern.findMany({
        where: {
          id: { in: dto.concern_ids },
          tenant_id: tenantId,
        },
        select: { id: true, tier: true, case_id: true },
      });

      if (concerns.length !== dto.concern_ids.length) {
        throw new BadRequestException({
          code: 'INVALID_CONCERN_IDS',
          message: 'One or more concern IDs are invalid or do not belong to this tenant',
        });
      }

      // Check none are already linked to another case
      const alreadyLinked = concerns.filter((c) => c.case_id !== null);
      if (alreadyLinked.length > 0) {
        throw new BadRequestException({
          code: 'CONCERNS_ALREADY_LINKED',
          message: `Concerns already linked to another case: ${alreadyLinked.map((c) => c.id).join(', ')}`,
        });
      }

      // 2. Calculate tier as highest among linked concerns
      const maxConcernTier = Math.max(...concerns.map((c) => c.tier));
      const effectiveTier = Math.max(dto.tier ?? 1, maxConcernTier);

      // 3. Generate case number via SequenceService
      const caseNumber = await this.sequenceService.nextNumber(tenantId, 'pastoral_case', tx, 'PC');

      // 4. Create case record
      const caseRecord = await db.pastoralCase.create({
        data: {
          tenant_id: tenantId,
          student_id: dto.student_id,
          case_number: caseNumber,
          status: 'open' as $Enums.PastoralCaseStatus,
          owner_user_id: dto.owner_user_id,
          opened_by_user_id: userId,
          opened_reason: dto.opened_reason,
          next_review_date: dto.next_review_date ? new Date(dto.next_review_date) : null,
          tier: effectiveTier,
        },
      });

      // 5. Link concerns to this case
      await db.pastoralConcern.updateMany({
        where: {
          id: { in: dto.concern_ids },
          tenant_id: tenantId,
        },
        data: { case_id: caseRecord.id },
      });

      // 6. Create primary student link in pastoral_case_students
      await db.pastoralCaseStudent.create({
        data: {
          case_id: caseRecord.id,
          student_id: dto.student_id,
          tenant_id: tenantId,
        },
      });

      // 7. Create additional student links if provided
      if (dto.additional_student_ids && dto.additional_student_ids.length > 0) {
        const additionalStudents = dto.additional_student_ids.filter(
          (sid) => sid !== dto.student_id,
        );
        if (additionalStudents.length > 0) {
          await db.pastoralCaseStudent.createMany({
            data: additionalStudents.map((sid) => ({
              case_id: caseRecord.id,
              student_id: sid,
              tenant_id: tenantId,
            })),
          });
        }
      }

      return caseRecord;
    })) as CaseRow;

    // Fire-and-forget: write case_created audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'case_created',
      entity_type: 'case',
      entity_id: created.id,
      student_id: created.student_id,
      actor_user_id: userId,
      tier: created.tier,
      payload: {
        case_id: created.id,
        student_id: created.student_id,
        case_number: created.case_number,
        linked_concern_ids: dto.concern_ids,
        owner_user_id: dto.owner_user_id,
        reason: dto.opened_reason,
      },
      ip_address: null,
    });

    return { data: created };
  }

  // ─── LIST (delegated to CaseQueriesService — M-16 CQRS-lite split) ────────
  // ─── FIND BY ID (delegated to CaseQueriesService — M-16 CQRS-lite split) ──

  // ─── UPDATE ─────────────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    userId: string,
    caseId: string,
    dto: UpdateCaseDto,
  ): Promise<{ data: CaseRow }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralCase.findUnique({
        where: { id: caseId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'CASE_NOT_FOUND',
          message: `Case "${caseId}" not found`,
        });
      }

      const updateData: Prisma.PastoralCaseUpdateInput = {};

      if (dto.next_review_date !== undefined) {
        updateData.next_review_date = dto.next_review_date ? new Date(dto.next_review_date) : null;
      }
      if (dto.tier !== undefined) {
        updateData.tier = dto.tier;
      }
      if (dto.legal_hold !== undefined) {
        updateData.legal_hold = dto.legal_hold;
      }
      if (dto.owner_user_id !== undefined) {
        updateData.owner = { connect: { id: dto.owner_user_id } };
      }

      return db.pastoralCase.update({
        where: { id: caseId },
        data: updateData,
      });
    })) as CaseRow;

    // Note: metadata updates (next_review_date, tier, legal_hold) are tracked
    // by the updated_at timestamp on the case. No dedicated audit event type
    // exists for metadata-only changes.

    return { data: updated };
  }

  // ─── TRANSITION STATUS ──────────────────────────────────────────────────────

  async transition(
    tenantId: string,
    userId: string,
    caseId: string,
    dto: CaseStatusTransitionDto,
  ): Promise<{ data: CaseRow }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    let oldStatus: CaseStatus = 'open';

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralCase.findUnique({
        where: { id: caseId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'CASE_NOT_FOUND',
          message: `Case "${caseId}" not found`,
        });
      }

      const currentStatus = existing.status as CaseStatus;
      oldStatus = currentStatus;
      const newStatus = dto.status;

      // Validate transition using shared state machine
      if (!isValidCaseTransition(currentStatus, newStatus)) {
        const validTransitions = getValidCaseTransitions(currentStatus);
        throw new BadRequestException({
          code: 'INVALID_TRANSITION',
          message: `Cannot transition from "${currentStatus}" to "${newStatus}". Valid transitions: ${validTransitions.join(', ')}`,
        });
      }

      const updateData: Prisma.PastoralCaseUpdateInput = {
        status: toPrismaStatus(newStatus),
      };

      // Side effects based on transition
      if (newStatus === 'resolved') {
        updateData.resolved_at = new Date();
      } else if (newStatus === 'closed') {
        updateData.closed_at = new Date();
      } else if (currentStatus === 'closed' && newStatus === 'open') {
        // Reopen: clear resolved_at and closed_at
        updateData.resolved_at = null;
        updateData.closed_at = null;
      }

      return db.pastoralCase.update({
        where: { id: caseId },
        data: updateData,
      });
    })) as CaseRow;

    // Fire-and-forget: write case_status_changed audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'case_status_changed',
      entity_type: 'case',
      entity_id: caseId,
      student_id: updated.student_id,
      actor_user_id: userId,
      tier: updated.tier,
      payload: {
        case_id: caseId,
        old_status: oldStatus,
        new_status: dto.status,
        reason: dto.reason,
      },
      ip_address: null,
    });

    return { data: updated };
  }

  // ─── TRANSFER OWNERSHIP ─────────────────────────────────────────────────────

  async transferOwnership(
    tenantId: string,
    userId: string,
    caseId: string,
    dto: CaseOwnershipTransferDto,
  ): Promise<{ data: CaseRow }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const result = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralCase.findUnique({
        where: { id: caseId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'CASE_NOT_FOUND',
          message: `Case "${caseId}" not found`,
        });
      }

      // Validate new owner exists (users table is platform-level, no RLS)
      const newOwner = await this.authReadFacade.findUserSummary(tenantId, dto.new_owner_user_id);

      if (!newOwner) {
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: `User "${dto.new_owner_user_id}" not found`,
        });
      }

      const oldOwnerId = existing.owner_user_id;

      const updated = await db.pastoralCase.update({
        where: { id: caseId },
        data: { owner_user_id: dto.new_owner_user_id },
      });

      // Write audit event within context of having old/new owner info
      void this.eventService.write({
        tenant_id: tenantId,
        event_type: 'case_ownership_transferred',
        entity_type: 'case',
        entity_id: caseId,
        student_id: existing.student_id,
        actor_user_id: userId,
        tier: existing.tier,
        payload: {
          case_id: caseId,
          old_owner_user_id: oldOwnerId,
          new_owner_user_id: dto.new_owner_user_id,
          reason: dto.reason,
        },
        ip_address: null,
      });

      return updated;
    })) as CaseRow;

    return { data: result };
  }

  // ─── LINK CONCERN ───────────────────────────────────────────────────────────

  async linkConcern(
    tenantId: string,
    userId: string,
    caseId: string,
    dto: LinkConcernToCaseDto,
  ): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const eventContext = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Validate case exists
      const caseRecord = await db.pastoralCase.findUnique({
        where: { id: caseId },
      });
      if (!caseRecord) {
        throw new NotFoundException({
          code: 'CASE_NOT_FOUND',
          message: `Case "${caseId}" not found`,
        });
      }

      // Validate concern exists and belongs to tenant
      const concern = await db.pastoralConcern.findUnique({
        where: { id: dto.concern_id },
      });
      if (!concern) {
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: `Concern "${dto.concern_id}" not found`,
        });
      }

      // Check concern is not already linked to another case
      if (concern.case_id !== null && concern.case_id !== caseId) {
        throw new BadRequestException({
          code: 'CONCERN_ALREADY_LINKED',
          message: `Concern "${dto.concern_id}" is already linked to case "${concern.case_id}"`,
        });
      }

      // If already linked to this case, idempotent return
      if (concern.case_id === caseId) {
        return null;
      }

      // Link concern
      await db.pastoralConcern.update({
        where: { id: dto.concern_id },
        data: { case_id: caseId },
      });

      // Recalculate tier
      const recalculatedTier = await this.recalculateTier(tenantId, caseId, db);

      return {
        student_id: concern.student_id,
        tier: Math.max(caseRecord.tier, concern.tier, recalculatedTier),
      };
    })) as { student_id: string; tier: number } | null;

    if (!eventContext) {
      return;
    }

    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'case_concern_linked',
      entity_type: 'case',
      entity_id: caseId,
      student_id: eventContext.student_id,
      actor_user_id: userId,
      tier: eventContext.tier,
      payload: {
        case_id: caseId,
        concern_id: dto.concern_id,
        student_id: eventContext.student_id,
      },
      ip_address: null,
    });
  }

  // ─── UNLINK CONCERN ─────────────────────────────────────────────────────────

  async unlinkConcern(
    tenantId: string,
    userId: string,
    caseId: string,
    concernId: string,
  ): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const eventContext = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Validate case exists
      const caseRecord = await db.pastoralCase.findUnique({
        where: { id: caseId },
      });
      if (!caseRecord) {
        throw new NotFoundException({
          code: 'CASE_NOT_FOUND',
          message: `Case "${caseId}" not found`,
        });
      }

      // Validate concern is linked to this case
      const concern = await db.pastoralConcern.findUnique({
        where: { id: concernId },
      });
      if (!concern || concern.case_id !== caseId) {
        throw new BadRequestException({
          code: 'CONCERN_NOT_LINKED',
          message: `Concern "${concernId}" is not linked to case "${caseId}"`,
        });
      }

      // Count remaining concerns (must be > 1 after unlinking)
      const linkedConcernCount = await db.pastoralConcern.count({
        where: { case_id: caseId, tenant_id: tenantId },
      });

      if (linkedConcernCount <= 1) {
        throw new BadRequestException({
          code: 'LAST_CONCERN',
          message: 'Cannot unlink the last concern from a case. Close the case instead.',
        });
      }

      // Unlink concern
      await db.pastoralConcern.update({
        where: { id: concernId },
        data: { case_id: null },
      });

      // Recalculate tier
      const recalculatedTier = await this.recalculateTier(tenantId, caseId, db);

      return {
        student_id: concern.student_id,
        tier: Math.max(caseRecord.tier, concern.tier, recalculatedTier),
      };
    })) as { student_id: string; tier: number };

    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'case_concern_unlinked',
      entity_type: 'case',
      entity_id: caseId,
      student_id: eventContext.student_id,
      actor_user_id: userId,
      tier: eventContext.tier,
      payload: {
        case_id: caseId,
        concern_id: concernId,
        student_id: eventContext.student_id,
      },
      ip_address: null,
    });
  }

  // ─── ADD STUDENT ────────────────────────────────────────────────────────────

  async addStudent(
    tenantId: string,
    userId: string,
    caseId: string,
    dto: AddStudentToCaseDto,
  ): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const eventContext = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Validate case exists
      const caseRecord = await db.pastoralCase.findUnique({
        where: { id: caseId },
      });
      if (!caseRecord) {
        throw new NotFoundException({
          code: 'CASE_NOT_FOUND',
          message: `Case "${caseId}" not found`,
        });
      }

      // Validate student exists
      const student = await db.student.findFirst({
        where: { id: dto.student_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!student) {
        throw new NotFoundException({
          code: 'STUDENT_NOT_FOUND',
          message: `Student "${dto.student_id}" not found`,
        });
      }

      // Idempotent: check if already linked
      const existing = await db.pastoralCaseStudent.findUnique({
        where: {
          case_id_student_id: {
            case_id: caseId,
            student_id: dto.student_id,
          },
        },
      });
      if (existing) {
        return null; // Already linked, no-op
      }

      await db.pastoralCaseStudent.create({
        data: {
          case_id: caseId,
          student_id: dto.student_id,
          tenant_id: tenantId,
        },
      });
      return {
        student_id: dto.student_id,
        tier: caseRecord.tier,
      };
    })) as { student_id: string; tier: number } | null;

    if (!eventContext) {
      return;
    }

    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'case_student_added',
      entity_type: 'case',
      entity_id: caseId,
      student_id: eventContext.student_id,
      actor_user_id: userId,
      tier: eventContext.tier,
      payload: {
        case_id: caseId,
        student_id: eventContext.student_id,
      },
      ip_address: null,
    });
  }

  // ─── REMOVE STUDENT ─────────────────────────────────────────────────────────

  async removeStudent(
    tenantId: string,
    userId: string,
    caseId: string,
    studentId: string,
  ): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const eventContext = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Validate case exists
      const caseRecord = await db.pastoralCase.findUnique({
        where: { id: caseId },
      });
      if (!caseRecord) {
        throw new NotFoundException({
          code: 'CASE_NOT_FOUND',
          message: `Case "${caseId}" not found`,
        });
      }

      // Cannot remove the primary student
      if (caseRecord.student_id === studentId) {
        throw new BadRequestException({
          code: 'CANNOT_REMOVE_PRIMARY_STUDENT',
          message: 'Cannot remove the primary student from a case.',
        });
      }

      // Verify the student link exists
      const link = await db.pastoralCaseStudent.findUnique({
        where: {
          case_id_student_id: {
            case_id: caseId,
            student_id: studentId,
          },
        },
      });
      if (!link) {
        throw new NotFoundException({
          code: 'STUDENT_NOT_LINKED',
          message: `Student "${studentId}" is not linked to case "${caseId}"`,
        });
      }

      await db.pastoralCaseStudent.delete({
        where: {
          case_id_student_id: {
            case_id: caseId,
            student_id: studentId,
          },
        },
      });
      return {
        student_id: studentId,
        tier: caseRecord.tier,
      };
    })) as { student_id: string; tier: number };

    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'case_student_removed',
      entity_type: 'case',
      entity_id: caseId,
      student_id: eventContext.student_id,
      actor_user_id: userId,
      tier: eventContext.tier,
      payload: {
        case_id: caseId,
        student_id: eventContext.student_id,
      },
      ip_address: null,
    });
  }

  // ─── MY CASES (delegated to CaseQueriesService — M-16 CQRS-lite split) ────
  // ─── ORPHAN DETECTION (delegated to CaseQueriesService — M-16) ────────────

  // ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

  /**
   * Recalculates case tier as the highest tier among linked concerns.
   * Updates the case record if the tier has changed.
   */
  private async recalculateTier(
    tenantId: string,
    caseId: string,
    db: PrismaService,
  ): Promise<number> {
    const concerns = await db.pastoralConcern.findMany({
      where: { case_id: caseId, tenant_id: tenantId },
      select: { tier: true },
    });

    const maxTier = concerns.length > 0 ? Math.max(...concerns.map((c) => c.tier)) : 1;

    await db.pastoralCase.update({
      where: { id: caseId },
      data: { tier: maxTier },
    });

    return maxTier;
  }

  // toCaseListItem and toCaseDetail moved to CaseQueriesService (M-16)
}
