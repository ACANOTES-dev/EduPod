import { Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import type { CaseFilters } from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import type {
  CaseDetailDto,
  CaseListItemDto,
  CaseRow,
  OrphanedCaseDto,
  PaginationMeta,
} from './case.service';

// ─── Prisma enum mapping helper ─────────────────────────────────────────────

const STATUS_TO_ENUM: Record<string, $Enums.PastoralCaseStatus> = {
  open: 'open' as $Enums.PastoralCaseStatus,
  active: 'active' as $Enums.PastoralCaseStatus,
  monitoring: 'monitoring' as $Enums.PastoralCaseStatus,
  resolved: 'resolved' as $Enums.PastoralCaseStatus,
  closed: 'closed' as $Enums.PastoralCaseStatus,
};

/**
 * Read-only query operations for pastoral cases.
 * Extracted from CaseService as part of CQRS-lite split (M-16).
 *
 * All methods are side-effect-free — no writes, no queue dispatches, no audit events.
 */
@Injectable()
export class CaseQueriesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── LIST ───────────────────────────────────────────────────────────────────

  async findAll(
    tenantId: string,
    userId: string,
    filters: CaseFilters,
  ): Promise<{ data: CaseListItemDto[]; meta: PaginationMeta }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const skip = (filters.page - 1) * filters.pageSize;

    const where: Prisma.PastoralCaseWhereInput = {
      tenant_id: tenantId,
    };

    if (filters.status) {
      where.status = STATUS_TO_ENUM[filters.status];
    }
    if (filters.owner_user_id) {
      where.owner_user_id = filters.owner_user_id;
    }
    if (filters.tier) {
      where.tier = filters.tier;
    }

    // When filtering by student_id, check both primary student and linked students
    if (filters.student_id) {
      where.OR = [
        { student_id: filters.student_id },
        { case_students: { some: { student_id: filters.student_id } } },
      ];
    }

    // Date range filtering
    if (filters.date_from || filters.date_to) {
      where.created_at = {};
      if (filters.date_from) where.created_at.gte = new Date(filters.date_from);
      if (filters.date_to) where.created_at.lte = new Date(filters.date_to);
    }

    // Build orderBy
    const orderBy: Prisma.PastoralCaseOrderByWithRelationInput = {};
    if (filters.sort === 'next_review_date') orderBy.next_review_date = filters.order;
    else if (filters.sort === 'status') orderBy.status = filters.order;
    else orderBy.created_at = filters.order;

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const [cases, total] = await Promise.all([
        db.pastoralCase.findMany({
          where,
          include: {
            student: { select: { id: true, first_name: true, last_name: true } },
            owner: { select: { first_name: true, last_name: true } },
            concerns: { select: { id: true } },
            case_students: { select: { student_id: true } },
          },
          orderBy,
          skip,
          take: filters.pageSize,
        }),
        db.pastoralCase.count({ where }),
      ]);

      const data = (cases as CaseRow[]).map((c) => this.toCaseListItem(c));

      return { data, meta: { page: filters.page, pageSize: filters.pageSize, total } };
    }) as Promise<{ data: CaseListItemDto[]; meta: PaginationMeta }>;
  }

  // ─── FIND BY ID ─────────────────────────────────────────────────────────────

  async findById(
    tenantId: string,
    userId: string,
    caseId: string,
  ): Promise<{ data: CaseDetailDto }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const caseRecord = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.pastoralCase.findUnique({
        where: { id: caseId },
        include: {
          owner: { select: { first_name: true, last_name: true } },
          opened_by: { select: { first_name: true, last_name: true } },
          student: { select: { id: true, first_name: true, last_name: true } },
          concerns: {
            select: {
              id: true,
              category: true,
              severity: true,
              tier: true,
              created_at: true,
              versions: {
                orderBy: { version_number: 'desc' as const },
                take: 1,
                select: {
                  id: true,
                  version_number: true,
                  narrative: true,
                  created_at: true,
                },
              },
            },
          },
          case_students: {
            include: {
              student: { select: { id: true, first_name: true, last_name: true } },
            },
          },
        },
      });
    })) as CaseRow | null;

    if (!caseRecord) {
      throw new NotFoundException({
        code: 'CASE_NOT_FOUND',
        message: `Case "${caseId}" not found`,
      });
    }

    return { data: this.toCaseDetail(caseRecord) };
  }

  // ─── MY CASES ───────────────────────────────────────────────────────────────

  async findMyCases(tenantId: string, userId: string): Promise<{ data: CaseListItemDto[] }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const cases = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.pastoralCase.findMany({
        where: {
          tenant_id: tenantId,
          owner_user_id: userId,
          status: { notIn: ['closed' as $Enums.PastoralCaseStatus] },
        },
        include: {
          owner: { select: { first_name: true, last_name: true } },
          concerns: { select: { id: true } },
          case_students: { select: { student_id: true } },
        },
        orderBy: { created_at: 'desc' },
      });
    })) as CaseRow[];

    return { data: cases.map((c) => this.toCaseListItem(c)) };
  }

  // ─── ORPHAN DETECTION ───────────────────────────────────────────────────────

  async findOrphans(tenantId: string): Promise<{ data: OrphanedCaseDto[] }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    const orphans = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.pastoralCase.findMany({
        where: {
          tenant_id: tenantId,
          status: { not: 'closed' as $Enums.PastoralCaseStatus },
          concerns: { none: {} },
        },
        select: {
          id: true,
          case_number: true,
          status: true,
          owner_user_id: true,
          created_at: true,
        },
      });
    })) as Array<{
      id: string;
      case_number: string;
      status: $Enums.PastoralCaseStatus;
      owner_user_id: string;
      created_at: Date;
    }>;

    return {
      data: orphans.map((o) => ({
        id: o.id,
        case_number: o.case_number,
        status: o.status as string,
        owner_user_id: o.owner_user_id,
        created_at: o.created_at,
      })),
    };
  }

  // ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

  /**
   * Maps a raw case row to a list item DTO.
   */
  private toCaseListItem(caseRecord: CaseRow): CaseListItemDto {
    const ownerName = caseRecord.owner
      ? `${caseRecord.owner.first_name} ${caseRecord.owner.last_name}`
      : null;

    return {
      id: caseRecord.id,
      case_number: caseRecord.case_number,
      student_id: caseRecord.student_id,
      student_name: caseRecord.student
        ? `${caseRecord.student.first_name} ${caseRecord.student.last_name}`
        : 'Unknown',
      status: caseRecord.status as string,
      tier: caseRecord.tier,
      owner_user_id: caseRecord.owner_user_id,
      owner_name: ownerName,
      next_review_date: caseRecord.next_review_date,
      created_at: caseRecord.created_at,
      concern_count: caseRecord.concerns?.length ?? 0,
      student_count: caseRecord.case_students?.length ?? 0,
    };
  }

  /**
   * Maps a raw case row (with includes) to a detail DTO.
   */
  private toCaseDetail(caseRecord: CaseRow): CaseDetailDto {
    const listItem = this.toCaseListItem(caseRecord);

    const openedByName = caseRecord.opened_by
      ? `${caseRecord.opened_by.first_name} ${caseRecord.opened_by.last_name}`
      : null;

    // Calculate days open (calendar days since creation)
    const now = new Date();
    const created = new Date(caseRecord.created_at);
    const daysOpen = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

    // Map concerns with latest narrative
    const concerns = (caseRecord.concerns ?? []).map((c) => ({
      id: c.id,
      category: c.category,
      severity: c.severity,
      tier: c.tier,
      created_at: c.created_at,
      latest_narrative: c.versions?.[0]?.narrative ?? null,
    }));

    // Map students with primary indicator
    const students = (caseRecord.case_students ?? []).map((cs) => ({
      student_id: cs.student_id,
      name: cs.student ? `${cs.student.first_name} ${cs.student.last_name}` : 'Unknown',
      added_at: cs.added_at,
      is_primary: cs.student_id === caseRecord.student_id,
    }));

    return {
      ...listItem,
      opened_by_user_id: caseRecord.opened_by_user_id,
      opened_by_name: openedByName,
      opened_reason: caseRecord.opened_reason,
      legal_hold: caseRecord.legal_hold,
      resolved_at: caseRecord.resolved_at,
      closed_at: caseRecord.closed_at,
      updated_at: caseRecord.updated_at,
      days_open: daysOpen,
      concerns,
      students,
    };
  }
}
