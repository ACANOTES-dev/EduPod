import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type {
  CreateCompetencyScaleDto,
  UpdateCompetencyScaleDto,
} from './dto/gradebook.dto';

@Injectable()
export class CompetencyScaleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a competency scale.
   */
  async create(tenantId: string, dto: CreateCompetencyScaleDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.competencyScale.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          levels_json: dto.levels as unknown as Parameters<typeof db.competencyScale.create>[0]['data']['levels_json'],
        },
      });
    });
  }

  /**
   * List all competency scales for a tenant.
   */
  async list(tenantId: string) {
    const data = await this.prisma.competencyScale.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'asc' },
    });

    return { data };
  }

  /**
   * Get a single competency scale.
   */
  async findOne(tenantId: string, id: string) {
    const scale = await this.prisma.competencyScale.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!scale) {
      throw new NotFoundException({
        code: 'COMPETENCY_SCALE_NOT_FOUND',
        message: `Competency scale with id "${id}" not found`,
      });
    }

    return scale;
  }

  /**
   * Update a competency scale.
   */
  async update(tenantId: string, id: string, dto: UpdateCompetencyScaleDto) {
    const scale = await this.prisma.competencyScale.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!scale) {
      throw new NotFoundException({
        code: 'COMPETENCY_SCALE_NOT_FOUND',
        message: `Competency scale with id "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.competencyScale.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.levels !== undefined && {
            levels_json: dto.levels as unknown as Parameters<typeof db.competencyScale.update>[0]['data']['levels_json'],
          }),
        },
      });
    });
  }

  /**
   * Delete a competency scale.
   */
  async delete(tenantId: string, id: string) {
    const scale = await this.prisma.competencyScale.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!scale) {
      throw new NotFoundException({
        code: 'COMPETENCY_SCALE_NOT_FOUND',
        message: `Competency scale with id "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.competencyScale.delete({ where: { id } });
    });
  }

  /**
   * Ensure a default competency scale exists for the tenant.
   * Called lazily when the tenant first accesses Standards settings.
   */
  async ensureDefaultScale(tenantId: string) {
    const existing = await this.prisma.competencyScale.findFirst({
      where: { tenant_id: tenantId },
      select: { id: true },
    });

    if (existing) return existing;

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.competencyScale.create({
        data: {
          tenant_id: tenantId,
          name: 'Default Scale',
          levels_json: [
            { label: 'Beginning', threshold_min: 0 },
            { label: 'Developing', threshold_min: 40 },
            { label: 'Proficient', threshold_min: 70 },
            { label: 'Mastered', threshold_min: 90 },
          ],
        },
      });
    });
  }
}
