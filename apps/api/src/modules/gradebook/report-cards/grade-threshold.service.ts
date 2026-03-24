import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ThresholdEntry {
  min_score: number;
  label: string;
  label_ar: string;
}

export interface CreateGradeThresholdConfigDto {
  name: string;
  thresholds_json: ThresholdEntry[];
  is_default?: boolean;
}

export interface UpdateGradeThresholdConfigDto {
  name?: string;
  thresholds_json?: ThresholdEntry[];
  is_default?: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class GradeThresholdService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateGradeThresholdConfigDto) {
    const existing = await this.prisma.gradeThresholdConfig.findFirst({
      where: { tenant_id: tenantId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException({
        error: {
          code: 'THRESHOLD_CONFIG_NAME_TAKEN',
          message: `A threshold config named "${dto.name}" already exists`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      if (dto.is_default) {
        await db.gradeThresholdConfig.updateMany({
          where: { tenant_id: tenantId, is_default: true },
          data: { is_default: false },
        });
      }

      return db.gradeThresholdConfig.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          thresholds_json: dto.thresholds_json as unknown as Prisma.InputJsonValue,
          is_default: dto.is_default ?? false,
        },
      });
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.gradeThresholdConfig.findMany({
      where: { tenant_id: tenantId },
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const config = await this.prisma.gradeThresholdConfig.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!config) {
      throw new NotFoundException({
        error: {
          code: 'THRESHOLD_CONFIG_NOT_FOUND',
          message: `Grade threshold config "${id}" not found`,
        },
      });
    }
    return config;
  }

  async update(tenantId: string, id: string, dto: UpdateGradeThresholdConfigDto) {
    const config = await this.prisma.gradeThresholdConfig.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!config) {
      throw new NotFoundException({
        error: {
          code: 'THRESHOLD_CONFIG_NOT_FOUND',
          message: `Grade threshold config "${id}" not found`,
        },
      });
    }

    if (dto.name !== undefined && dto.name !== config.name) {
      const conflict = await this.prisma.gradeThresholdConfig.findFirst({
        where: { tenant_id: tenantId, name: dto.name, id: { not: id } },
      });
      if (conflict) {
        throw new ConflictException({
          error: {
            code: 'THRESHOLD_CONFIG_NAME_TAKEN',
            message: `A threshold config named "${dto.name}" already exists`,
          },
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      if (dto.is_default) {
        await db.gradeThresholdConfig.updateMany({
          where: { tenant_id: tenantId, is_default: true, id: { not: id } },
          data: { is_default: false },
        });
      }

      const updateData: Prisma.GradeThresholdConfigUpdateInput = {};
      if (dto.name !== undefined) updateData.name = dto.name;
      if (dto.is_default !== undefined) updateData.is_default = dto.is_default;
      if (dto.thresholds_json !== undefined) {
        updateData.thresholds_json = dto.thresholds_json as unknown as Prisma.InputJsonValue;
      }

      return db.gradeThresholdConfig.update({ where: { id }, data: updateData });
    });
  }

  async remove(tenantId: string, id: string) {
    const config = await this.prisma.gradeThresholdConfig.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!config) {
      throw new NotFoundException({
        error: {
          code: 'THRESHOLD_CONFIG_NOT_FOUND',
          message: `Grade threshold config "${id}" not found`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.gradeThresholdConfig.delete({ where: { id } });
    });

    return { deleted: true };
  }

  // ─── Apply Threshold ──────────────────────────────────────────────────────

  /**
   * Given a numeric score and a threshold config, return the matching label.
   * Thresholds are sorted by min_score descending — first match wins.
   * Returns null if no threshold matches.
   */
  applyThreshold(score: number, thresholdConfig: ThresholdEntry[]): { label: string; label_ar: string } | null {
    // Sort descending by min_score
    const sorted = [...thresholdConfig].sort((a, b) => b.min_score - a.min_score);

    for (const threshold of sorted) {
      if (score >= threshold.min_score) {
        return { label: threshold.label, label_ar: threshold.label_ar };
      }
    }

    return null;
  }

  /**
   * Get the default threshold config for a tenant.
   * Returns null if none is configured.
   */
  async getDefaultConfig(tenantId: string) {
    return this.prisma.gradeThresholdConfig.findFirst({
      where: { tenant_id: tenantId, is_default: true },
    });
  }
}
