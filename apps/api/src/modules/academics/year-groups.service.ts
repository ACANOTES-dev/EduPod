import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type { CreateYearGroupDto } from './dto/create-year-group.dto';
import type { UpdateYearGroupDto } from './dto/update-year-group.dto';

@Injectable()
export class YearGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateYearGroupDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        return (tx as unknown as PrismaService).yearGroup.create({
          data: {
            tenant_id: tenantId,
            name: dto.name,
            display_order: dto.display_order ?? 0,
            next_year_group_id: dto.next_year_group_id ?? null,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'DUPLICATE_NAME',
          message: `A year group with name "${dto.name}" already exists`,
        });
      }
      throw err;
    }
  }

  async findAll(tenantId: string) {
    return this.prisma.yearGroup.findMany({
      where: { tenant_id: tenantId },
      orderBy: { display_order: 'asc' },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateYearGroupDto) {
    await this.assertExists(tenantId, id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        const updateData: Prisma.YearGroupUpdateInput = {};
        if (dto.name !== undefined) updateData.name = dto.name;
        if (dto.display_order !== undefined) updateData.display_order = dto.display_order;
        if (dto.next_year_group_id !== undefined) {
          updateData.next_year_group = dto.next_year_group_id
            ? { connect: { id: dto.next_year_group_id } }
            : { disconnect: true };
        }

        return (tx as unknown as PrismaService).yearGroup.update({
          where: { id },
          data: updateData,
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'DUPLICATE_NAME',
          message: `A year group with name "${dto.name}" already exists`,
        });
      }
      throw err;
    }
  }

  async remove(tenantId: string, id: string) {
    await this.assertExists(tenantId, id);

    // Check if referenced by students
    const studentCount = await this.prisma.student.count({
      where: { year_group_id: id, tenant_id: tenantId },
    });

    if (studentCount > 0) {
      throw new BadRequestException({
        code: 'YEAR_GROUP_IN_USE',
        message: 'Cannot delete a year group that has students assigned to it',
      });
    }

    // Check if referenced by classes
    const classCount = await this.prisma.class.count({
      where: { year_group_id: id, tenant_id: tenantId },
    });

    if (classCount > 0) {
      throw new BadRequestException({
        code: 'YEAR_GROUP_IN_USE',
        message: 'Cannot delete a year group that has classes assigned to it',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      return (tx as unknown as PrismaService).yearGroup.delete({
        where: { id },
      });
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async assertExists(tenantId: string, id: string) {
    const yearGroup = await this.prisma.yearGroup.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!yearGroup) {
      throw new NotFoundException({
        code: 'YEAR_GROUP_NOT_FOUND',
        message: `Year group with id "${id}" not found`,
      });
    }
  }
}
