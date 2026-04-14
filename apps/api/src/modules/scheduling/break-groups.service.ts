import { Injectable, NotFoundException } from '@nestjs/common';

import type { CreateBreakGroupDto, UpdateBreakGroupDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { PrismaService } from '../prisma/prisma.service';

const INCLUDE_RELATIONS = {
  year_groups: {
    include: {
      year_group: { select: { id: true, name: true } },
    },
  },
} as const;

@Injectable()
export class BreakGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academicReadFacade: AcademicReadFacade,
  ) {}

  // ─── List ──────────────────────────────────────────────────────────────────

  async list(tenantId: string, academicYearId: string) {
    const data = await this.prisma.breakGroup.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      include: INCLUDE_RELATIONS,
      orderBy: { name: 'asc' },
    });

    return {
      data: data.map((bg) => this.formatBreakGroup(bg)),
    };
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateBreakGroupDto) {
    // Validate academic year exists
    await this.academicReadFacade.findYearByIdOrThrow(tenantId, dto.academic_year_id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Create break group
      const breakGroup = await db.breakGroup.create({
        data: {
          tenant_id: tenantId,
          academic_year_id: dto.academic_year_id,
          name: dto.name,
          name_ar: dto.name_ar ?? null,
          location: dto.location ?? null,
          required_supervisor_count: dto.required_supervisor_count,
        },
      });

      // Create year group links
      for (const yearGroupId of dto.year_group_ids) {
        await db.breakGroupYearGroup.create({
          data: {
            tenant_id: tenantId,
            break_group_id: breakGroup.id,
            year_group_id: yearGroupId,
          },
        });
      }

      // Return with relations
      return db.breakGroup.findUnique({
        where: { id: breakGroup.id },
        include: INCLUDE_RELATIONS,
      });
    });

    return this.formatBreakGroup(result);
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: UpdateBreakGroupDto) {
    const existing = await this.prisma.breakGroup.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'BREAK_GROUP_NOT_FOUND',
        message: `Break group "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Update fields
      const updateData: Record<string, unknown> = {};
      if (dto.name !== undefined) updateData['name'] = dto.name;
      if (dto.name_ar !== undefined) updateData['name_ar'] = dto.name_ar;
      if (dto.location !== undefined) updateData['location'] = dto.location;
      if (dto.required_supervisor_count !== undefined) {
        updateData['required_supervisor_count'] = dto.required_supervisor_count;
      }

      if (Object.keys(updateData).length > 0) {
        await db.breakGroup.update({
          where: { id },
          data: updateData,
        });
      }

      // Replace year group links if provided
      if (dto.year_group_ids !== undefined) {
        await db.breakGroupYearGroup.deleteMany({
          where: { break_group_id: id, tenant_id: tenantId },
        });

        for (const yearGroupId of dto.year_group_ids) {
          await db.breakGroupYearGroup.create({
            data: {
              tenant_id: tenantId,
              break_group_id: id,
              year_group_id: yearGroupId,
            },
          });
        }
      }

      return db.breakGroup.findUnique({
        where: { id },
        include: INCLUDE_RELATIONS,
      });
    });

    return this.formatBreakGroup(result);
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async delete(tenantId: string, id: string) {
    const existing = await this.prisma.breakGroup.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'BREAK_GROUP_NOT_FOUND',
        message: `Break group "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Delete year group links first (cascade should handle this, but be explicit)
      await db.breakGroupYearGroup.deleteMany({
        where: { break_group_id: id, tenant_id: tenantId },
      });

      await db.breakGroup.delete({ where: { id } });
    });

    return { message: 'Break group deleted' };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private formatBreakGroup(bg: unknown): Record<string, unknown> {
    if (!bg || typeof bg !== 'object') return {};
    const obj = bg as Record<string, unknown>;
    const yearGroups = obj['year_groups'];

    const detail = Array.isArray(yearGroups)
      ? yearGroups.map((yg: Record<string, unknown>) => yg['year_group'])
      : [];

    return {
      ...obj,
      year_group_ids: Array.isArray(yearGroups)
        ? yearGroups.map((yg: Record<string, unknown>) => {
            const ygObj = yg['year_group'] as Record<string, unknown> | undefined;
            return ygObj?.['id'] ?? yg['year_group_id'];
          })
        : [],
      year_groups_detail: detail,
      year_groups: detail,
    };
  }
}
