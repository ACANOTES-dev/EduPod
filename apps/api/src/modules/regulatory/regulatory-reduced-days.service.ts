import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReducedSchoolDayReason } from '@prisma/client';
import type { CreateReducedSchoolDayDto, UpdateReducedSchoolDayDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Enum Mappings ─────────────────────────────────────────────────────────

const API_REASON_TO_PRISMA: Record<string, ReducedSchoolDayReason> = {
  behaviour_management: ReducedSchoolDayReason.behaviour_management,
  medical_needs: ReducedSchoolDayReason.medical_needs,
  phased_return: ReducedSchoolDayReason.phased_return,
  assessment_pending: ReducedSchoolDayReason.assessment_pending,
  other: ReducedSchoolDayReason.rsd_other,
};

// ─── Interfaces ────────────────────────────────────────────────────────────

interface ListReducedDaysParams {
  page: number;
  pageSize: number;
  student_id?: string;
  is_active?: boolean;
}

@Injectable()
export class RegulatoryReducedDaysService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateReducedSchoolDayDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.reducedSchoolDay.create({
        data: {
          tenant_id: tenantId,
          student_id: dto.student_id,
          start_date: new Date(dto.start_date),
          end_date: dto.end_date ? new Date(dto.end_date) : null,
          hours_per_day: dto.hours_per_day,
          reason: API_REASON_TO_PRISMA[dto.reason] ?? ReducedSchoolDayReason.rsd_other,
          reason_detail: dto.reason_detail ?? null,
          approved_by_id: userId,
          parent_consent_date: dto.parent_consent_date ? new Date(dto.parent_consent_date) : null,
          review_date: dto.review_date ? new Date(dto.review_date) : null,
          notes: dto.notes ?? null,
        },
      });
    });
  }

  // ─── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string, params: ListReducedDaysParams) {
    const { page, pageSize, student_id, is_active } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ReducedSchoolDayWhereInput = { tenant_id: tenantId };

    if (student_id) where.student_id = student_id;
    if (is_active !== undefined) where.is_active = is_active;

    const [data, total] = await Promise.all([
      this.prisma.reducedSchoolDay.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          student: { select: { id: true, first_name: true, last_name: true } },
          approved_by: { select: { id: true, first_name: true, last_name: true } },
        },
      }),
      this.prisma.reducedSchoolDay.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Find One ───────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const record = await this.prisma.reducedSchoolDay.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        student: { select: { id: true, first_name: true, last_name: true } },
        approved_by: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'REDUCED_SCHOOL_DAY_NOT_FOUND',
        message: `Reduced school day record with id "${id}" not found`,
      });
    }

    return record;
  }

  // ─── Update ─────────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: UpdateReducedSchoolDayDto) {
    await this.findOne(tenantId, id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const data: Prisma.ReducedSchoolDayUncheckedUpdateInput = {};
      if (dto.end_date !== undefined) data.end_date = dto.end_date ? new Date(dto.end_date) : null;
      if (dto.hours_per_day !== undefined) data.hours_per_day = dto.hours_per_day;
      if (dto.reason_detail !== undefined) data.reason_detail = dto.reason_detail;
      if (dto.parent_consent_date !== undefined) {
        data.parent_consent_date = dto.parent_consent_date ? new Date(dto.parent_consent_date) : null;
      }
      if (dto.review_date !== undefined) {
        data.review_date = dto.review_date ? new Date(dto.review_date) : null;
      }
      if (dto.tusla_notified !== undefined) {
        data.tusla_notified = dto.tusla_notified;
        if (dto.tusla_notified) data.tusla_notified_at = new Date();
      }
      if (dto.is_active !== undefined) data.is_active = dto.is_active;
      if (dto.notes !== undefined) data.notes = dto.notes;

      return db.reducedSchoolDay.update({ where: { id }, data });
    });
  }

  // ─── Remove ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.reducedSchoolDay.delete({ where: { id } });
    });
  }
}
