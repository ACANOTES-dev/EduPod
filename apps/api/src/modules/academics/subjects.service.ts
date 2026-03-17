import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type { CreateSubjectDto } from './dto/create-subject.dto';
import type { UpdateSubjectDto } from './dto/update-subject.dto';

type SubjectType = 'academic' | 'supervision' | 'duty' | 'other';

interface ListSubjectsFilters {
  subject_type?: SubjectType;
  active?: boolean;
}

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateSubjectDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        return (tx as unknown as PrismaService).subject.create({
          data: {
            tenant_id: tenantId,
            name: dto.name,
            code: dto.code ?? null,
            subject_type: dto.subject_type ?? 'academic',
            active: dto.active ?? true,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'DUPLICATE_NAME',
          message: `A subject with name "${dto.name}" already exists`,
        });
      }
      throw err;
    }
  }

  async findAll(tenantId: string, filters: ListSubjectsFilters) {
    const where: Prisma.SubjectWhereInput = { tenant_id: tenantId };

    if (filters.subject_type !== undefined) {
      where.subject_type = filters.subject_type;
    }
    if (filters.active !== undefined) {
      where.active = filters.active;
    }

    return this.prisma.subject.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateSubjectDto) {
    await this.assertExists(tenantId, id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        const updateData: Prisma.SubjectUpdateInput = {};
        if (dto.name !== undefined) updateData.name = dto.name;
        if (dto.code !== undefined) updateData.code = dto.code;
        if (dto.subject_type !== undefined) updateData.subject_type = dto.subject_type;
        if (dto.active !== undefined) updateData.active = dto.active;

        return (tx as unknown as PrismaService).subject.update({
          where: { id },
          data: updateData,
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'DUPLICATE_NAME',
          message: `A subject with name "${dto.name}" already exists`,
        });
      }
      throw err;
    }
  }

  async remove(tenantId: string, id: string) {
    await this.assertExists(tenantId, id);

    // Check if referenced by classes
    const classCount = await this.prisma.class.count({
      where: { subject_id: id, tenant_id: tenantId },
    });

    if (classCount > 0) {
      throw new BadRequestException({
        code: 'SUBJECT_IN_USE',
        message: 'Cannot delete a subject that is assigned to classes',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      return (tx as unknown as PrismaService).subject.delete({
        where: { id },
      });
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async assertExists(tenantId: string, id: string) {
    const subject = await this.prisma.subject.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!subject) {
      throw new NotFoundException({
        code: 'SUBJECT_NOT_FOUND',
        message: `Subject with id "${id}" not found`,
      });
    }
  }
}
