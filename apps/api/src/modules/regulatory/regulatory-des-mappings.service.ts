import { Injectable, NotFoundException } from '@nestjs/common';

import type { CreateDesSubjectCodeMappingDto } from '@school/shared/regulatory';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RegulatoryDesMappingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create (upsert by tenant + subject) ────────────────────────────────────

  async create(tenantId: string, dto: CreateDesSubjectCodeMappingDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.desSubjectCodeMapping.upsert({
        where: {
          idx_des_subject_mapping_unique: {
            tenant_id: tenantId,
            subject_id: dto.subject_id,
          },
        },
        create: {
          tenant_id: tenantId,
          subject_id: dto.subject_id,
          des_code: dto.des_code,
          des_name: dto.des_name,
          des_level: dto.des_level ?? null,
          is_verified: dto.is_verified ?? false,
        },
        update: {
          des_code: dto.des_code,
          des_name: dto.des_name,
          des_level: dto.des_level ?? null,
          is_verified: dto.is_verified ?? false,
        },
      });
    });
  }

  // ─── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string) {
    return this.prisma.desSubjectCodeMapping.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'asc' },
      include: {
        subject: { select: { id: true, name: true } },
      },
    });
  }

  // ─── Remove ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, id: string) {
    const mapping = await this.prisma.desSubjectCodeMapping.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!mapping) {
      throw new NotFoundException({
        code: 'DES_MAPPING_NOT_FOUND',
        message: `DES subject code mapping with id "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.desSubjectCodeMapping.delete({ where: { id } });
    });
  }
}
