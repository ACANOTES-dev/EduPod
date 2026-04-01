import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { UpsertRotationConfigDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

export interface CurrentRotationWeek {
  cycle_length: number;
  week_index: number;
  week_label: string;
  weeks_elapsed: number;
}

@Injectable()
export class RotationService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Upsert Rotation Config ───────────────────────────────────────────────

  async upsertRotationConfig(tenantId: string, dto: UpsertRotationConfigDto) {
    // Verify academic year exists
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: dto.academic_year_id, tenant_id: tenantId },
      select: { id: true },
    });
    if (!academicYear) {
      throw new NotFoundException({
        error: { code: 'ACADEMIC_YEAR_NOT_FOUND', message: 'Academic year not found' },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const existing = await this.prisma.rotationConfig.findFirst({
      where: { tenant_id: tenantId, academic_year_id: dto.academic_year_id },
      select: { id: true },
    });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      if (existing) {
        return db.rotationConfig.update({
          where: { id: existing.id },
          data: {
            cycle_length: dto.cycle_length,
            week_labels_json: dto.week_labels,
            effective_start_date: new Date(dto.effective_start_date),
          },
        });
      }

      return db.rotationConfig.create({
        data: {
          tenant_id: tenantId,
          academic_year_id: dto.academic_year_id,
          cycle_length: dto.cycle_length,
          week_labels_json: dto.week_labels,
          effective_start_date: new Date(dto.effective_start_date),
        },
      });
    })) as unknown as {
      id: string;
      cycle_length: number;
      week_labels_json: unknown;
      effective_start_date: Date;
      updated_at: Date;
    };

    return {
      id: (result as { id: string }).id,
      academic_year_id: dto.academic_year_id,
      cycle_length: (result as { cycle_length: number }).cycle_length,
      week_labels: (result as { week_labels_json: string[] }).week_labels_json,
      effective_start_date: (result as { effective_start_date: Date }).effective_start_date
        .toISOString()
        .slice(0, 10),
      updated_at: (result as { updated_at: Date }).updated_at.toISOString(),
    };
  }

  // ─── Get Rotation Config ──────────────────────────────────────────────────

  async getRotationConfig(tenantId: string, academicYearId: string) {
    const config = await this.prisma.rotationConfig.findFirst({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
    });

    if (!config) {
      throw new NotFoundException({
        error: {
          code: 'ROTATION_CONFIG_NOT_FOUND',
          message: 'No rotation config found for this academic year',
        },
      });
    }

    return {
      id: config.id,
      academic_year_id: config.academic_year_id,
      cycle_length: config.cycle_length,
      week_labels: config.week_labels_json as string[],
      effective_start_date: config.effective_start_date.toISOString().slice(0, 10),
      created_at: config.created_at.toISOString(),
      updated_at: config.updated_at.toISOString(),
    };
  }

  // ─── Delete Rotation Config ───────────────────────────────────────────────

  async deleteRotationConfig(tenantId: string, academicYearId: string) {
    const config = await this.prisma.rotationConfig.findFirst({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      select: { id: true },
    });

    if (!config) {
      throw new NotFoundException({
        error: {
          code: 'ROTATION_CONFIG_NOT_FOUND',
          message: 'No rotation config found for this academic year',
        },
      });
    }

    // Check if any schedules reference rotation weeks
    const rotatingSchedules = await this.prisma.schedule.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        rotation_week: { not: null },
      },
      select: { id: true },
    });

    if (rotatingSchedules) {
      throw new ConflictException({
        error: {
          code: 'ROTATION_IN_USE',
          message:
            'Cannot delete rotation config — schedules reference rotation weeks. Update or archive those schedules first.',
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.rotationConfig.delete({ where: { id: config.id } });
    });

    return { deleted: true };
  }

  // ─── Get Current Rotation Week ────────────────────────────────────────────

  async getCurrentRotationWeek(
    tenantId: string,
    academicYearId: string,
    date?: string,
  ): Promise<CurrentRotationWeek> {
    const config = await this.prisma.rotationConfig.findFirst({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
    });

    if (!config) {
      throw new NotFoundException({
        error: {
          code: 'ROTATION_CONFIG_NOT_FOUND',
          message: 'No rotation config for this academic year',
        },
      });
    }

    const targetDate = date ? new Date(date) : new Date();
    const effectiveStart = config.effective_start_date;

    // Calculate the number of weeks elapsed since effective_start_date
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeksElapsed = Math.floor((targetDate.getTime() - effectiveStart.getTime()) / msPerWeek);
    const safeWeeks = Math.max(0, weeksElapsed);
    const weekIndex = safeWeeks % config.cycle_length;

    const weekLabels = config.week_labels_json as string[];
    const weekLabel = weekLabels[weekIndex] ?? `Week ${weekIndex + 1}`;

    return {
      cycle_length: config.cycle_length,
      week_index: weekIndex,
      week_label: weekLabel,
      weeks_elapsed: safeWeeks,
    };
  }
}
