import { Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceRecordStatus, TuslaAbsenceCategory } from '@prisma/client';

import type { CreateTuslaAbsenceCodeMappingDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Enum Mappings ─────────────────────────────────────────────────────────

const API_CATEGORY_TO_PRISMA: Record<string, TuslaAbsenceCategory> = {
  illness: TuslaAbsenceCategory.illness,
  urgent_family_reason: TuslaAbsenceCategory.urgent_family_reason,
  holiday: TuslaAbsenceCategory.holiday,
  suspension: TuslaAbsenceCategory.tusla_suspension,
  expulsion: TuslaAbsenceCategory.tusla_expulsion,
  other: TuslaAbsenceCategory.tusla_other,
  unexplained: TuslaAbsenceCategory.unexplained,
};

@Injectable()
export class RegulatoryTuslaMappingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateTuslaAbsenceCodeMappingDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.tuslaAbsenceCodeMapping.create({
        data: {
          tenant_id: tenantId,
          attendance_status: dto.attendance_status as AttendanceRecordStatus,
          reason_pattern: dto.reason_pattern ?? null,
          tusla_category:
            API_CATEGORY_TO_PRISMA[dto.tusla_category] ?? TuslaAbsenceCategory.tusla_other,
          display_label: dto.display_label,
          is_default: dto.is_default ?? false,
        },
      });
    });
  }

  // ─── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string) {
    return this.prisma.tuslaAbsenceCodeMapping.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'asc' },
    });
  }

  // ─── Remove ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, id: string) {
    const mapping = await this.prisma.tuslaAbsenceCodeMapping.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!mapping) {
      throw new NotFoundException({
        code: 'TUSLA_MAPPING_NOT_FOUND',
        message: `Tusla absence code mapping with id "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.tuslaAbsenceCodeMapping.delete({ where: { id } });
    });
  }
}
