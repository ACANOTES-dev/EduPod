import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreateNepsVisitDto {
  visit_date: string;
  psychologist_name: string;
  notes?: string;
}

export interface UpdateNepsVisitDto {
  visit_date?: string;
  psychologist_name?: string;
  notes?: string;
}

export interface NepsVisitFilters {
  from_date?: string;
  to_date?: string;
  page: number;
  pageSize: number;
}

export interface AddStudentToVisitDto {
  student_id: string;
  referral_id?: string;
}

export interface UpdateVisitStudentDto {
  outcome?: string;
}

export interface NepsVisitRow {
  id: string;
  tenant_id: string;
  visit_date: Date;
  psychologist_name: string;
  notes: string | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
  _count?: { students: number };
}

export interface NepsVisitWithStudents extends NepsVisitRow {
  students: Array<{
    id: string;
    student_id: string;
    referral_id: string | null;
    outcome: string | null;
    created_at: Date;
    student?: { id: string; first_name: string; last_name: string };
  }>;
}

export interface NepsVisitStudentRow {
  id: string;
  tenant_id: string;
  visit_id: string;
  student_id: string;
  referral_id: string | null;
  outcome: string | null;
  created_at: Date;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class NepsVisitService {
  private readonly logger = new Logger(NepsVisitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
  ) {}

  // ─── CREATE ──────────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    userId: string,
    dto: CreateNepsVisitDto,
  ): Promise<NepsVisitRow> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const visit = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.pastoralNepsVisit.create({
        data: {
          tenant_id: tenantId,
          visit_date: new Date(dto.visit_date),
          psychologist_name: dto.psychologist_name,
          notes: dto.notes ?? null,
          created_by_user_id: userId,
        },
      });
    })) as NepsVisitRow;

    // Fire-and-forget: audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'neps_visit_created',
      entity_type: 'referral',
      entity_id: visit.id,
      student_id: null,
      actor_user_id: userId,
      tier: 1,
      payload: {
        visit_id: visit.id,
        visit_date: dto.visit_date,
        psychologist_name: dto.psychologist_name,
      },
      ip_address: null,
    });

    return visit;
  }

  // ─── LIST ────────────────────────────────────────────────────────────────────

  async list(
    tenantId: string,
    filters: NepsVisitFilters,
  ): Promise<{ data: NepsVisitRow[]; meta: PaginationMeta }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    const skip = (filters.page - 1) * filters.pageSize;

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const where: Record<string, unknown> = { tenant_id: tenantId };

      if (filters.from_date || filters.to_date) {
        const dateFilter: Record<string, Date> = {};
        if (filters.from_date) {
          dateFilter.gte = new Date(filters.from_date);
        }
        if (filters.to_date) {
          dateFilter.lte = new Date(filters.to_date);
        }
        where.visit_date = dateFilter;
      }

      const [data, total] = await Promise.all([
        db.pastoralNepsVisit.findMany({
          where,
          orderBy: { visit_date: 'desc' },
          skip,
          take: filters.pageSize,
          include: { _count: { select: { students: true } } },
        }),
        db.pastoralNepsVisit.count({ where }),
      ]);

      return {
        data: data as unknown as NepsVisitRow[],
        meta: { page: filters.page, pageSize: filters.pageSize, total },
      };
    }) as Promise<{ data: NepsVisitRow[]; meta: PaginationMeta }>;
  }

  // ─── GET ─────────────────────────────────────────────────────────────────────

  async get(
    tenantId: string,
    visitId: string,
  ): Promise<NepsVisitWithStudents> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const visit = await db.pastoralNepsVisit.findFirst({
        where: { id: visitId, tenant_id: tenantId },
        include: {
          students: {
            include: {
              student: {
                select: { id: true, first_name: true, last_name: true },
              },
            },
          },
        },
      });

      if (!visit) {
        throw new NotFoundException({
          code: 'NEPS_VISIT_NOT_FOUND',
          message: `NEPS visit ${visitId} not found`,
        });
      }

      return visit;
    })) as NepsVisitWithStudents;
  }

  // ─── UPDATE ──────────────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    visitId: string,
    dto: UpdateNepsVisitDto,
  ): Promise<NepsVisitRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralNepsVisit.findFirst({
        where: { id: visitId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'NEPS_VISIT_NOT_FOUND',
          message: `NEPS visit ${visitId} not found`,
        });
      }

      const updateData: Record<string, unknown> = {};

      if (dto.visit_date !== undefined) {
        updateData.visit_date = new Date(dto.visit_date);
      }
      if (dto.psychologist_name !== undefined) {
        updateData.psychologist_name = dto.psychologist_name;
      }
      if (dto.notes !== undefined) {
        updateData.notes = dto.notes;
      }

      return db.pastoralNepsVisit.update({
        where: { id: visitId },
        data: updateData,
      });
    })) as NepsVisitRow;
  }

  // ─── REMOVE ──────────────────────────────────────────────────────────────────

  async remove(tenantId: string, visitId: string): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralNepsVisit.findFirst({
        where: { id: visitId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'NEPS_VISIT_NOT_FOUND',
          message: `NEPS visit ${visitId} not found`,
        });
      }

      await db.pastoralNepsVisit.delete({
        where: { id: visitId },
      });
    });
  }

  // ─── ADD STUDENT ─────────────────────────────────────────────────────────────

  async addStudent(
    tenantId: string,
    visitId: string,
    dto: AddStudentToVisitDto,
  ): Promise<NepsVisitStudentRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return (await rlsClient.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        // Validate visit exists
        const visit = await db.pastoralNepsVisit.findFirst({
          where: { id: visitId, tenant_id: tenantId },
        });

        if (!visit) {
          throw new NotFoundException({
            code: 'NEPS_VISIT_NOT_FOUND',
            message: `NEPS visit ${visitId} not found`,
          });
        }

        return db.pastoralNepsVisitStudent.create({
          data: {
            tenant_id: tenantId,
            visit_id: visitId,
            student_id: dto.student_id,
            referral_id: dto.referral_id ?? null,
          },
        });
      })) as NepsVisitStudentRow;
    } catch (error: unknown) {
      // P2002 = unique constraint violation (student already linked to visit)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'STUDENT_ALREADY_LINKED',
          message: `Student ${dto.student_id} is already linked to visit ${visitId}`,
        });
      }
      throw error;
    }
  }

  // ─── UPDATE STUDENT OUTCOME ──────────────────────────────────────────────────

  async updateStudentOutcome(
    tenantId: string,
    visitStudentId: string,
    dto: UpdateVisitStudentDto,
  ): Promise<NepsVisitStudentRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralNepsVisitStudent.findFirst({
        where: { id: visitStudentId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'VISIT_STUDENT_NOT_FOUND',
          message: `Visit-student record ${visitStudentId} not found`,
        });
      }

      return db.pastoralNepsVisitStudent.update({
        where: { id: visitStudentId },
        data: { outcome: dto.outcome ?? null },
      });
    })) as NepsVisitStudentRow;
  }

  // ─── REMOVE STUDENT ──────────────────────────────────────────────────────────

  async removeStudent(
    tenantId: string,
    visitStudentId: string,
  ): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralNepsVisitStudent.findFirst({
        where: { id: visitStudentId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'VISIT_STUDENT_NOT_FOUND',
          message: `Visit-student record ${visitStudentId} not found`,
        });
      }

      await db.pastoralNepsVisitStudent.delete({
        where: { id: visitStudentId },
      });
    });
  }
}
